import { GLASS } from "./glass-config"
import type { GlassMotion } from "./glass-mode"

/**
 * What one content of the glass is: a photo texture (or none, for a voice), the voice's inner light (linear rgb, and
 * its weight), and the memory's color for the rim and the bloom (linear rgb).
 */
export interface LensSlot {
  texture: WebGLTexture | null
  light: [number, number, number]
  lightWeight: number
  tint: [number, number, number]
}

/** One frame: the voice (a ripple and a glow), the morph from the flat orb (0) to the glass (1), and the dissolve. */
export interface LensFrame extends GlassMotion {
  time: number
  glass: number
  mix: number
  /** 1 while it dissolves to another memory: the glass fogs a little mid-way, hiding the double image. 0 to sharpen. */
  fog?: number
}

export interface GlassRenderer {
  /** An sRGB, mipmapped, trilinear (and anisotropic, where there is) texture of a decoded photo. */
  texture: (source: TexImageSource) => WebGLTexture | null
  release: (texture: WebGLTexture | null) => void
  /** Blends two contents' photos into one texture, in texture space, so a new dissolve can start from what is shown. */
  collapse: (a: LensSlot, b: LensSlot, mix: number, size: number) => WebGLTexture | null
  /** The canvas backing store (`device` px square) and the sphere inside it (`deviceDiameter` px). */
  resize: (device: number, deviceDiameter: number) => void
  /** Clears the canvas to transparent (nothing shown: whatever is under it shows through). */
  clear: () => void
  draw: (a: LensSlot, b: LensSlot | null, frame: LensFrame) => void
  dispose: () => void
}

export interface GlassOptions {
  /** The GL context was lost: the caller falls back to the CSS glass. */
  onLost?: () => void
}

/** sRGB to linear light, for the colors the shader mixes. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const MAX_ANISOTROPY = 8

/**
 * Uploads a decoded photo as a texture: stored as sRGB (sampling it gives linear light, mipmaps are averaged in linear,
 * so nothing darkens or washes out), with a full mip chain and trilinear filtering (a 1600 px photo shrinks into the
 * sphere without shimmer), and `anisotropy` x anisotropic filtering where the GPU has it (the rim gathers the photo
 * steeply). It never queries the GPU: a query waits for every draw queued before it. Rows go in as they are (no flip,
 * straight alpha): the shader reads the photo upright.
 */
export function setupPhotoTexture(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
  { anisotropy = 0 }: { anisotropy?: number } = {},
): WebGLTexture | null {
  const width = (source as HTMLImageElement).naturalWidth || (source as ImageBitmap).width
  const height = (source as HTMLImageElement).naturalHeight || (source as ImageBitmap).height
  if (!(width > 0 && height > 0)) return null
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL)
  const levels = Math.floor(Math.log2(Math.max(width, height))) + 1
  gl.texStorage2D(gl.TEXTURE_2D, levels, gl.SRGB8_ALPHA8, width, height)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const ext = anisotropy > 1 ? gl.getExtension("EXT_texture_filter_anisotropic") : null
  if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy)
  return texture
}

const f = (v: number) => v.toFixed(6)
const LENS_K = (GLASS.lens.edge - GLASS.lens.center) / (1 - GLASS.lens.rimStart) ** GLASS.lens.power

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/**
 * The glass in screen space, in linear light, written out as sRGB. `q` is the sphere (radius 1, y up).
 * - The lens (uGlass 1): the middle is a straight, barely magnified scale of the photo (crisp, natural); past
 *   `rimStart` it gathers more of the photo toward the rim, with a faint color fringe (dispersion) only there.
 *   At uGlass 0 it is the flat orb disc, pixel for pixel: the morph from the approach starts from it.
 * - Fresnel: transmission falls at grazing angles and a cool rim light (with the memory's color) rises.
 * - A small, soft highlight near the upper left rim and a faint one across, laid on with a screen blend (they lift
 *   the photo, never wash it into a flat blob).
 * - A thin shade inside the lower rim, and a thin bloom outside it that is gone before the canvas edge.
 * - Two contents and a dissolve (uMix): a photo or a voice's inner light each. The voice ripples the lookup (uWarp)
 *   and lights the core (uGlow).
 */
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPhotoA;
uniform sampler2D uPhotoB;
uniform float uHasA;
uniform float uHasB;
uniform vec4 uLightA;
uniform vec4 uLightB;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform float uMix;
uniform float uGlass;
uniform float uTime;
uniform float uWarp;
uniform float uGlow;
uniform float uRadius;
uniform float uAa;
uniform float uFog;

const float LENS_C = ${f(GLASS.lens.center)};
const float LENS_R0 = ${f(GLASS.lens.rimStart)};
const float LENS_N = ${f(GLASS.lens.power)};
const float LENS_K = ${f(LENS_K)};
const float DISPERSION = ${f(GLASS.dispersion)};
const vec2 SPEC_AT = vec2(${f(GLASS.specular.at[0])}, ${f(GLASS.specular.at[1])});
const float SPEC_PEAK = ${f(GLASS.specular.peak)};
const float SPEC_RAD = ${f(GLASS.specular.radial)};
const float SPEC_TAN = ${f(GLASS.specular.tangential)};
const vec2 SPEC2_AT = vec2(${f(GLASS.specular.secondaryAt[0])}, ${f(GLASS.specular.secondaryAt[1])});
const float SPEC2_PEAK = ${f(GLASS.specular.secondaryPeak)};
const float SPEC2_SIZE = ${f(GLASS.specular.secondarySize)};
const float FRESNEL = ${f(GLASS.fresnel)};
const float SHADE = ${f(GLASS.shade)};
const float BLOOM_W = ${f(GLASS.bloom.width)};
const float BLOOM_A = ${f(GLASS.bloom.alpha)};

vec3 encodeSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float lensRadius(float r) {
  return LENS_C * r + LENS_K * pow(max(r - LENS_R0, 0.0), LENS_N);
}

vec3 photoAt(sampler2D tex, vec2 p) {
  vec2 uv = clamp(0.5 + 0.5 * p, 0.0, 1.0);
  // Mid-dissolve between two memories the glass fogs a little (a mip bias), so they blend instead of doubling.
  return texture(tex, vec2(uv.x, 1.0 - uv.y), uFog * 9.6 * uMix * (1.0 - uMix)).rgb;
}

vec3 refracted(sampler2D tex, vec2 p, float ca) {
  return vec3(photoAt(tex, p * (1.0 + ca)).r, photoAt(tex, p).g, photoAt(tex, p * (1.0 - ca)).b);
}

void main() {
  vec2 q = (vUv - 0.5) * 2.0 / uRadius;
  float r = length(q);
  float rc = min(r, 1.0);

  // The voice sends rings out through the surface; they bend the lookup a little.
  float ring = sin(r * 18.0 - uTime * 6.5) * exp(-r * 1.6);
  float scale = mix(1.0, lensRadius(rc) / max(rc, 1e-4), uGlass) + ring * uWarp * 0.014;
  vec2 p = q * scale;
  float ca = DISPERSION * uGlass * pow(smoothstep(LENS_R0, 1.0, r), 1.5);

  // A voice: an inner light in the memory's color that breathes, and that the voice brightens and ripples.
  float breath = 0.5 + 0.5 * sin(uTime * 1.3);
  float core = exp(-r * r * (3.2 - 1.4 * uGlow));
  float tight = exp(-r * r * 16.0);
  float waves = pow(0.5 + 0.5 * sin(r * 22.0 - uTime * 6.5), 2.5) * exp(-r * 1.6) * uWarp;
  float lightShape = core * (0.22 + 0.05 * breath + 1.0 * uGlow) + waves * 1.4;
  float whiteShape = tight * (0.04 + 0.36 * uGlow);
  vec3 tint = mix(uTintA, uTintB, uMix);
  vec3 bodyA = refracted(uPhotoA, p, ca) * uHasA + uLightA.rgb * lightShape + vec3(uLightA.a) * whiteShape;
  vec3 bodyB = refracted(uPhotoB, p, ca) * uHasB + uLightB.rgb * lightShape + vec3(uLightB.a) * whiteShape;
  vec3 body = mix(bodyA, bodyB, uMix);
  // A photo that speaks glows faintly from within.
  body += tint * uGlow * 0.05 * (1.0 - rc) * mix(uHasA, uHasB, uMix);

  float z = sqrt(max(1.0 - rc * rc, 0.0));
  float grazing = 1.0 - z;
  float g2 = grazing * grazing;
  vec3 col = body * (1.0 - 0.8 * g2 * g2 * grazing * uGlass);
  col *= 1.0 - uGlass * SHADE * smoothstep(0.8, 1.0, r) * (0.55 + 0.45 * clamp(-q.y, 0.0, 1.0));
  vec3 rimLight = mix(vec3(0.80, 0.88, 1.0), tint, 0.35);
  col += rimLight * FRESNEL * g2 * grazing * uGlass * (1.0 + 0.8 * uGlow);
  col = clamp(col, 0.0, 1.0);

  vec2 d1 = q - SPEC_AT;
  vec2 u1 = normalize(SPEC_AT);
  float rad = dot(d1, u1);
  float tang = dot(d1, vec2(-u1.y, u1.x));
  float spec = SPEC_PEAK * exp(-(rad * rad / (SPEC_RAD * SPEC_RAD) + tang * tang / (SPEC_TAN * SPEC_TAN)));
  vec2 d2 = q - SPEC2_AT;
  spec += SPEC2_PEAK * exp(-dot(d2, d2) / (SPEC2_SIZE * SPEC2_SIZE));
  col = 1.0 - (1.0 - col) * (1.0 - spec * uGlass);

  float inside = 1.0 - smoothstep(1.0 - uAa, 1.0 + uAa, r);
  float bloom = r > 1.0 - uAa ? BLOOM_A * uGlass * (1.0 + 0.6 * uGlow) * (1.0 - smoothstep(1.0, 1.0 + BLOOM_W, r)) : 0.0;
  float alpha = inside + bloom * (1.0 - inside);
  outColor = vec4(encodeSrgb(col) * inside + encodeSrgb(rimLight) * bloom * (1.0 - inside), alpha);
}`

/** Blends two photos in texture space (same square crop, same rows), into an sRGB target: linear in, encoded out. */
const COLLAPSE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPhotoA;
uniform sampler2D uPhotoB;
uniform float uHasA;
uniform float uHasB;
uniform float uMix;
void main() {
  vec3 a = texture(uPhotoA, vUv).rgb * uHasA;
  vec3 b = texture(uPhotoB, vUv).rgb * uHasB;
  outColor = vec4(mix(a, b, uMix), 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null
}

/**
 * Draws the glass orb on a canvas with WebGL2. Returns null when it cannot (no WebGL2, a shader that will not
 * compile), and the caller shows the CSS glass instead. Build it ahead of time (in idle time): compiling and linking
 * can take a while on some GPUs, and never on the frame the glass opens.
 */
export function createGlassRenderer(canvas: HTMLCanvasElement, options: GlassOptions = {}): GlassRenderer | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    })
  } catch {
    return null
  }
  if (!gl) return null
  const ctx = gl

  const vs = compile(ctx, ctx.VERTEX_SHADER, VERTEX)
  const fs = compile(ctx, ctx.FRAGMENT_SHADER, FRAGMENT)
  const cs = compile(ctx, ctx.FRAGMENT_SHADER, COLLAPSE)
  if (!vs || !fs || !cs) return null
  const program = link(ctx, vs, fs)
  const blend = link(ctx, vs, cs)
  if (!program || !blend) return null

  const locate = (p: WebGLProgram, names: readonly string[]) =>
    Object.fromEntries(names.map((n) => [n, ctx.getUniformLocation(p, n)])) as Record<string, WebGLUniformLocation | null>
  const u = locate(program, [
    "uPhotoA",
    "uPhotoB",
    "uHasA",
    "uHasB",
    "uLightA",
    "uLightB",
    "uTintA",
    "uTintB",
    "uMix",
    "uGlass",
    "uTime",
    "uWarp",
    "uGlow",
    "uRadius",
    "uAa",
    "uFog",
  ])
  const b = locate(blend, ["uPhotoA", "uPhotoB", "uHasA", "uHasB", "uMix"])

  // A voice has no photo: its slot samples one black texel.
  const black = ctx.createTexture()
  ctx.bindTexture(ctx.TEXTURE_2D, black)
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, 1, 1, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  // The GPU's anisotropy limit, asked once here (in idle time), never while uploading.
  const anisoExt = ctx.getExtension("EXT_texture_filter_anisotropic")
  const anisotropy = anisoExt ? Math.min(MAX_ANISOTROPY, Number(ctx.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1) : 0
  ctx.disable(ctx.BLEND)
  ctx.clearColor(0, 0, 0, 0)

  let radius = 1 / GLASS.canvasScale
  let aa = 0.004

  const bind = (unit: number, texture: WebGLTexture | null) => {
    ctx.activeTexture(ctx.TEXTURE0 + unit)
    ctx.bindTexture(ctx.TEXTURE_2D, texture ?? black)
  }

  const onLost = (event: Event) => {
    event.preventDefault()
    options.onLost?.()
  }
  canvas.addEventListener("webglcontextlost", onLost)

  return {
    texture: (source) => {
      try {
        return setupPhotoTexture(ctx, source, { anisotropy })
      } catch {
        // A tainted image (no CORS) cannot be read by WebGL: the caller keeps what it shows.
        return null
      }
    },
    release: (texture) => {
      if (texture) ctx.deleteTexture(texture)
    },
    collapse: (a, other, mix, size) => {
      const side = Math.max(1, Math.round(size))
      const target = ctx.createTexture()
      ctx.bindTexture(ctx.TEXTURE_2D, target)
      const levels = Math.floor(Math.log2(side)) + 1
      ctx.texStorage2D(ctx.TEXTURE_2D, levels, ctx.SRGB8_ALPHA8, side, side)
      const fbo = ctx.createFramebuffer()
      ctx.bindFramebuffer(ctx.FRAMEBUFFER, fbo)
      ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, target, 0)
      if (ctx.checkFramebufferStatus(ctx.FRAMEBUFFER) !== ctx.FRAMEBUFFER_COMPLETE) {
        ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
        ctx.deleteFramebuffer(fbo)
        ctx.deleteTexture(target)
        return null
      }
      ctx.useProgram(blend)
      bind(0, a.texture)
      bind(1, other.texture)
      ctx.uniform1i(b.uPhotoA, 0)
      ctx.uniform1i(b.uPhotoB, 1)
      ctx.uniform1f(b.uHasA, a.texture ? 1 : 0)
      ctx.uniform1f(b.uHasB, other.texture ? 1 : 0)
      ctx.uniform1f(b.uMix, mix)
      ctx.viewport(0, 0, side, side)
      ctx.drawArrays(ctx.TRIANGLES, 0, 3)
      ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
      ctx.deleteFramebuffer(fbo)
      ctx.bindTexture(ctx.TEXTURE_2D, target)
      ctx.generateMipmap(ctx.TEXTURE_2D)
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR_MIPMAP_LINEAR)
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR)
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE)
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE)
      return target
    },
    resize: (device, deviceDiameter) => {
      if (canvas.width !== device) canvas.width = device
      if (canvas.height !== device) canvas.height = device
      radius = deviceDiameter / device
      // About one and a quarter device pixels of soft edge, in sphere units.
      aa = 1.25 / Math.max(deviceDiameter / 2, 1)
    },
    clear: () => {
      ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
      ctx.viewport(0, 0, canvas.width, canvas.height)
      ctx.clear(ctx.COLOR_BUFFER_BIT)
    },
    draw: (a, other, frame) => {
      const next = other ?? a
      ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
      ctx.viewport(0, 0, canvas.width, canvas.height)
      ctx.clear(ctx.COLOR_BUFFER_BIT)
      ctx.useProgram(program)
      bind(0, a.texture)
      bind(1, next.texture)
      ctx.uniform1i(u.uPhotoA, 0)
      ctx.uniform1i(u.uPhotoB, 1)
      ctx.uniform1f(u.uHasA, a.texture ? 1 : 0)
      ctx.uniform1f(u.uHasB, next.texture ? 1 : 0)
      ctx.uniform4f(u.uLightA, a.light[0] * a.lightWeight, a.light[1] * a.lightWeight, a.light[2] * a.lightWeight, a.lightWeight)
      ctx.uniform4f(
        u.uLightB,
        next.light[0] * next.lightWeight,
        next.light[1] * next.lightWeight,
        next.light[2] * next.lightWeight,
        next.lightWeight,
      )
      ctx.uniform3f(u.uTintA, a.tint[0], a.tint[1], a.tint[2])
      ctx.uniform3f(u.uTintB, next.tint[0], next.tint[1], next.tint[2])
      ctx.uniform1f(u.uMix, other ? frame.mix : 0)
      ctx.uniform1f(u.uGlass, frame.glass)
      ctx.uniform1f(u.uTime, frame.time)
      ctx.uniform1f(u.uWarp, frame.warp)
      ctx.uniform1f(u.uGlow, frame.glow)
      ctx.uniform1f(u.uRadius, radius)
      ctx.uniform1f(u.uAa, aa)
      ctx.uniform1f(u.uFog, other ? (frame.fog ?? 0) : 0)
      ctx.drawArrays(ctx.TRIANGLES, 0, 3)
    },
    dispose: () => {
      canvas.removeEventListener("webglcontextlost", onLost)
      ctx.deleteTexture(black)
      ctx.deleteProgram(program)
      ctx.deleteProgram(blend)
      ctx.deleteShader(vs)
      ctx.deleteShader(fs)
      ctx.deleteShader(cs)
      // No loseContext(): the canvas stays mounted, and the next run asks it for the same context. A lost one would
      // fail to compile and drop the view to the CSS glass for good.
    },
  }
}
