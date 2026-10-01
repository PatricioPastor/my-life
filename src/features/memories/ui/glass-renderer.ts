import { CANVAS_SCALE, type GlassMotion } from "./glass-mode"

/** What a frame of the glass needs: the voice (a ripple and a glow) and a clock that stands still under reduced motion. */
export interface GlassFrame extends GlassMotion {
  time: number
}

export interface GlassRenderer {
  /** The photo held in the glass (decoded and CORS-enabled), or null for an empty glass. */
  setPhoto: (image: HTMLImageElement | null) => void
  draw: (frame: GlassFrame) => void
  dispose: () => void
}

export interface GlassOptions {
  /** The memory's orb color, as 0..1 channels. */
  tint: [number, number, number]
  /** The GL context was lost, or the photo could not be uploaded (a tainted image): the caller falls back to CSS. */
  onLost?: () => void
}

const SPHERE_RADIUS = 1 / CANVAS_SCALE

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/**
 * A glass sphere in screen space. The normal of a sphere (z = sqrt(1 - r^2)) drives everything: the photo is looked up
 * through a ball lens (magnified in the middle, folding toward the rim) with a different scale per color channel, which
 * is the chromatic dispersion; a fresnel term lights the rim; two specular lobes sit on the glass; a thin shadow lines the
 * inside of the rim; and the memory's color tints the body and the halo. The voice (uWarp) sends rings through the
 * surface normal; uGlow lights the inner glow. An empty glass (no photo) holds only an inner light that becomes the voice.
 */
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPhoto;
uniform float uHasPhoto;
uniform float uPhotoAspect;
uniform vec3 uTint;
uniform float uTime;
uniform float uWarp;
uniform float uGlow;
const float R = ${SPHERE_RADIUS.toFixed(5)};

vec3 photoAt(vec2 uv) {
  vec2 s = uPhotoAspect > 1.0 ? vec2(1.0 / uPhotoAspect, 1.0) : vec2(1.0, uPhotoAspect);
  return texture(uPhoto, 0.5 + (clamp(uv, 0.0, 1.0) - 0.5) * s).rgb;
}

void main() {
  vec2 q = (vUv - 0.5) * 2.0 / R;
  float r = length(q);
  float aa = max(fwidth(r), 0.002) * 1.2;

  float halo = exp(-max(r - 1.0, 0.0) * 6.5) * (0.07 + 0.55 * uGlow);
  vec3 haloCol = uTint * halo;
  if (r >= 1.0 + aa) {
    outColor = vec4(haloCol, halo * 0.6);
    return;
  }

  float z = sqrt(max(1.0 - r * r, 0.0));
  // The voice sends rings out through the surface: they bend the normal.
  float ring = sin(r * 20.0 - uTime * 7.0) * exp(-r * 1.4);
  vec2 dir = q / max(r, 0.001);
  vec3 n = normalize(vec3(q + dir * ring * uWarp * 0.16, z + 0.0001));
  vec2 bend = n.xy - q;

  vec3 body;
  if (uHasPhoto > 0.5) {
    float k = 0.50 + 0.50 * r * r;
    vec2 base = q * k + bend * 1.4;
    float ca = 0.016 * r * r + 0.014 * uWarp * r;
    body = vec3(
      photoAt(0.5 + 0.5 * base * (1.0 - ca)).r,
      photoAt(0.5 + 0.5 * base).g,
      photoAt(0.5 + 0.5 * base * (1.0 + ca)).b
    );
    body *= 1.0 - 0.28 * r * r;
    body = mix(body, body * (0.6 + uTint), 0.14);
    body += uTint * uGlow * 0.10 * (1.0 - r);
  } else {
    float breath = 0.5 + 0.5 * sin(uTime * 1.3);
    float core = exp(-r * r * (3.0 - 1.6 * uGlow));
    float tight = exp(-r * r * 18.0);
    float waves = pow(0.5 + 0.5 * sin(r * 22.0 - uTime * 6.5), 2.5) * exp(-r * 1.6) * uWarp;
    vec3 light = uTint * (core * (0.30 + 0.08 * breath + 1.45 * uGlow) + waves * 2.6) + vec3(1.0) * tight * (0.14 + 0.85 * uGlow);
    body = vec3(0.012, 0.014, 0.026) + light;
  }

  float fres = pow(1.0 - z, 2.6);
  vec3 rim = fres * (vec3(0.80, 0.90, 1.0) * 0.50 + uTint * 0.70) * (1.0 + uGlow * 0.9);
  vec3 L = normalize(vec3(-0.5, 0.6, 0.62));
  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 120.0) * 1.1;
  float sheen = pow(max(dot(n, L), 0.0), 8.0) * 0.07;
  vec3 L2 = normalize(vec3(0.55, -0.6, 0.55));
  float spec2 = pow(max(dot(n, normalize(L2 + vec3(0.0, 0.0, 1.0))), 0.0), 50.0) * 0.18;
  float shadow = smoothstep(0.80, 1.0, r) * (0.30 + 0.20 * clamp(0.5 - q.y * 0.5, 0.0, 1.0));

  vec3 col = body * (1.0 - shadow) + rim + vec3(spec + spec2 + sheen);
  float a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  outColor = vec4(col * a + haloCol * (1.0 - a), max(a, halo * 0.6));
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

/**
 * Draws the glass orb on a canvas with WebGL2. Returns null when it cannot (no WebGL2, a shader that will not compile),
 * and the caller shows the CSS glass instead. The canvas size is the caller's: the viewport follows `canvas.width`.
 */
export function createGlassRenderer(canvas: HTMLCanvasElement, options: GlassOptions): GlassRenderer | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  } catch {
    return null
  }
  if (!gl) return null
  const ctx = gl

  const vs = compile(ctx, ctx.VERTEX_SHADER, VERTEX)
  const fs = compile(ctx, ctx.FRAGMENT_SHADER, FRAGMENT)
  const program = vs && fs ? ctx.createProgram() : null
  if (!program || !vs || !fs) return null
  ctx.attachShader(program, vs)
  ctx.attachShader(program, fs)
  ctx.linkProgram(program)
  if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) return null
  ctx.useProgram(program)

  const uniform = (name: string) => ctx.getUniformLocation(program, name)
  const u = {
    photo: uniform("uPhoto"),
    hasPhoto: uniform("uHasPhoto"),
    aspect: uniform("uPhotoAspect"),
    tint: uniform("uTint"),
    time: uniform("uTime"),
    warp: uniform("uWarp"),
    glow: uniform("uGlow"),
  }

  const texture = ctx.createTexture()
  ctx.activeTexture(ctx.TEXTURE0)
  ctx.bindTexture(ctx.TEXTURE_2D, texture)
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, 1, 1, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE)
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE)
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR)
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR)
  ctx.uniform1i(u.photo, 0)
  ctx.uniform3f(u.tint, options.tint[0], options.tint[1], options.tint[2])
  ctx.uniform1f(u.hasPhoto, 0)
  ctx.uniform1f(u.aspect, 1)
  ctx.enable(ctx.BLEND)
  ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_ALPHA)
  ctx.clearColor(0, 0, 0, 0)

  const onLost = (event: Event) => {
    event.preventDefault()
    options.onLost?.()
  }
  canvas.addEventListener("webglcontextlost", onLost)

  let hasPhoto = false
  return {
    setPhoto: (image) => {
      if (!image || !image.naturalWidth) {
        hasPhoto = false
        ctx.uniform1f(u.hasPhoto, 0)
        return
      }
      try {
        ctx.bindTexture(ctx.TEXTURE_2D, texture)
        ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, true)
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, image)
        ctx.generateMipmap(ctx.TEXTURE_2D)
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR_MIPMAP_LINEAR)
        hasPhoto = true
        ctx.uniform1f(u.hasPhoto, 1)
        ctx.uniform1f(u.aspect, image.naturalWidth / image.naturalHeight)
      } catch {
        // A tainted image (no CORS) cannot be read by WebGL: hand over to the CSS glass, which can show it.
        hasPhoto = false
        options.onLost?.()
      }
    },
    draw: (frame) => {
      ctx.viewport(0, 0, canvas.width, canvas.height)
      ctx.clear(ctx.COLOR_BUFFER_BIT)
      ctx.uniform1f(u.time, frame.time)
      ctx.uniform1f(u.warp, frame.warp)
      ctx.uniform1f(u.glow, frame.glow)
      ctx.uniform1f(u.hasPhoto, hasPhoto ? 1 : 0)
      ctx.drawArrays(ctx.TRIANGLES, 0, 3)
    },
    dispose: () => {
      canvas.removeEventListener("webglcontextlost", onLost)
      ctx.deleteTexture(texture)
      ctx.deleteProgram(program)
      ctx.deleteShader(vs)
      ctx.deleteShader(fs)
      ctx.getExtension("WEBGL_lose_context")?.loseContext()
    },
  }
}
