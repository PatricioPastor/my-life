import type { SkyParams } from "./sky-params"

export type SkyUniformKind = "f" | "c"
export type SkyUniformSlot = readonly [key: keyof SkyParams, kind: SkyUniformKind]

/** The tunable params fed to the shader: `f` is a float, `c` a hex color sent as vec3. */
export const SKY_UNIFORM_SLOTS: readonly SkyUniformSlot[] = [
  ["pixel", "f"], ["dotMin", "f"], ["dotMax", "f"], ["levels", "f"],
  ["scale", "f"], ["warp", "f"], ["drift", "f"], ["density", "f"], ["threshold", "f"], ["softness", "f"],
  ["band", "f"], ["bandAngle", "f"], ["bandOffset", "f"], ["bandWidth", "f"], ["haze", "f"],
  ["stars", "f"], ["twinkle", "f"], ["starDrift", "f"], ["spikeWidth", "f"],
  ["parallax", "f"], ["lens", "f"], ["lensRadius", "f"], ["lensPush", "f"], ["rippleSpeed", "f"],
  ["vignette", "f"], ["grain", "f"],
  ["voidColor", "c"], ["hazeColor", "c"], ["duskColor", "c"], ["wineColor", "c"],
  ["crimsonColor", "c"], ["hotColor", "c"], ["starColor", "c"],
]

export const uniformName = (key: string) => "u" + key[0].toUpperCase() + key.slice(1)

// One oversized triangle covers the screen; no vertex buffer needed.
export const SKY_VERTEX = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export function buildSkyFragment(slots: readonly SkyUniformSlot[] = SKY_UNIFORM_SLOTS): string {
  const decl = slots
    .map(([key, kind]) => `uniform ${kind === "c" ? "vec3" : "float"} ${uniformName(key)};`)
    .join("\n")
  return `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerOn;
uniform vec2 uLook;
uniform int uSparkCount;
uniform vec4 uSpark[16];
uniform vec4 uSparkB[16];
uniform vec4 uRipple[4];
uniform vec4 uPlanet;
${decl}
out vec4 frag;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.96875;
}
float bayer4(vec2 c){
  vec2 m = mod(c, 4.0);
  int i = int(m.x) + int(m.y) * 4;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[i]) + 0.5) / 16.0;
}
vec3 ramp(float d, vec3 haze){
  vec3 c = mix(uVoidColor, haze, smoothstep(0.0, 0.22, d));
  c = mix(c, uWineColor, smoothstep(0.18, 0.44, d));
  c = mix(c, uCrimsonColor, smoothstep(0.42, 0.72, d));
  return mix(c, uHotColor, smoothstep(0.7, 0.96, d));
}
vec2 shift(float depth){
  return floor(uLook * uParallax * depth * 28.0);
}

vec3 field(vec2 pos, vec2 resCss){
  float minSide = min(resCss.x, resCss.y);
  vec2 uv = (pos - 0.5 * resCss) / minSide;
  vec2 p = uv * uScale + uLook * uParallax * 0.05;

  vec2 toP = pos - uPointer;
  float lamp = exp(-dot(toP, toP) / (uLensRadius * uLensRadius)) * uPointerOn;
  p += toP / minSide * lamp * uLensPush * uScale;

  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipple[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 2.4) continue;
    vec2 dv = pos - r.xy;
    float dist = length(dv);
    float w = 14.0 + age * 26.0;
    float q = (dist - age * uRippleSpeed) / w;
    float k = exp(-q * q) * (1.0 - age / 2.4) * r.w;
    ring += k;
    p += dv / max(dist, 1.0) * k * 0.12;
  }

  float t = uTime * uDrift;
  vec2 q2 = vec2(fbm(p + vec2(0.0, t * 0.7)), fbm(p + vec2(5.2, 1.3) - t * 0.5));
  float n = fbm(p + uWarp * q2 + vec2(t * 0.4, -t * 0.25));

  vec2 dir = vec2(cos(uBandAngle), sin(uBandAngle));
  float along = dot(uv, dir);
  float across = dot(uv, vec2(-dir.y, dir.x)) - uBandOffset - 0.22 * sin(along * 2.3 + t * 3.0) - (q2.x - 0.5) * 0.35;
  float river = exp(-across * across / (uBandWidth * uBandWidth));

  float raw = n + river * uBand * 0.5 + (uDensity - 0.5) * 0.5;
  float d = smoothstep(uThreshold, uThreshold + uSoftness, raw);
  d = clamp(d + lamp * uLens * 0.45 + ring * 0.55, 0.0, 1.0);

  for (int i = 0; i < 16; i++) {
    if (i >= uSparkCount) break;
    vec4 s = uSpark[i];
    vec4 b = uSparkB[i];
    float grow = smoothstep(0.0, 0.6, uTime - s.w);
    float dist = length(pos - s.xy - shift(1.2));
    d += exp(-dist / max(b.w * 2.2 * (1.0 + b.z * 0.6), 1.0)) * 0.55 * grow;
  }

  float hz = smoothstep(0.25, 0.75, n + river * 0.25) * uHaze;
  float tone = fbm(p * 0.45 + vec2(11.0, -3.0) + t * 0.2);
  return vec3(clamp(d, 0.0, 1.0), hz, tone);
}

void main(){
  vec2 resCss = uRes / uDpr;
  vec2 css = gl_FragCoord.xy / uDpr;
  float px = max(uPixel, 1.0);
  vec2 cell = floor(css / px);
  vec2 cellC = (cell + 0.5) * px;
  vec2 f = fract(css / px) - 0.5;
  float L = max(uLevels, 2.0);
  float dith = bayer4(cell);

  vec3 g = field(cellC, resCss);
  vec3 hazeCol = mix(uHazeColor, uDuskColor, smoothstep(0.38, 0.62, g.z));
  float dq = clamp(floor(g.x * L + dith) / L, 0.0, 1.0);
  float hq = floor(g.y * 3.0 + dith) / 3.0;
  vec3 bg = mix(uVoidColor, hazeCol, hq * 0.7);
  bg = mix(bg, ramp(dq * 0.7, hazeCol) * 0.42, smoothstep(0.0, 0.3, dq));
  float r = mix(uDotMin, uDotMax, sqrt(dq));
  float dotMask = step(length(f), r);
  vec3 dotCol = dq < 0.01 ? mix(uVoidColor, hazeCol, 0.35 + hq * 0.5) : ramp(min(dq + 0.1, 1.0), hazeCol);
  vec3 col = mix(bg, dotCol, dotMask);

  vec3 starAcc = vec3(0.0);
  float starA = 0.0;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float depth = 0.3 + fl * 0.4;
    float gpx = px * (l == 2 ? 2.0 : 1.0);
    vec2 sp = css + shift(depth) + vec2(0.0, floor(uTime * uStarDrift * depth));
    vec2 id = floor(sp / gpx);
    vec2 fr = fract(sp / gpx) - 0.5;
    float prob = uStars * (l == 0 ? 0.009 : l == 1 ? 0.014 : 0.01);
    float h = hash12(id + fl * 71.3);
    if (h > 1.0 - prob) {
      float h2 = hash12(id * 1.7 + 3.1 + fl);
      float tw = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * uTwinkle * (0.6 + h2 * 2.5) + h2 * 40.0));
      float rad = l == 2 ? 0.42 : 0.26 + h2 * 0.22;
      float m = step(length(fr), rad);
      vec3 sc = (l == 0 || h2 > 0.82) ? uStarColor : uHotColor;
      starAcc = max(starAcc, sc * m * tw);
      starA = max(starA, m * tw);
    }
  }
  col = mix(col, starAcc / max(starA, 1e-3), starA * (1.0 - g.x * 0.55));

  if (uPlanet.w > 0.5) {
    vec2 pc = uPlanet.xy + shift(0.8);
    float R = uPlanet.z;
    vec2 dc = cellC - pc;
    if (length(dc) < R) {
      vec2 n2 = dc / R;
      float z = sqrt(max(1.0 - dot(n2, n2), 0.0));
      float lit = clamp(dot(vec3(n2, z), normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
      float surf = fbm(vec2(n2.x * 1.4 + uTime * 0.015, n2.y * 4.2) * 1.6 + 9.0);
      float pd = clamp(lit * 1.05 - smoothstep(0.55, 0.75, surf) * 0.45 * (1.0 - lit * 0.5) + 0.05, 0.0, 1.0);
      float pq = floor(pd * L + dith) / L;
      vec3 pbg = mix(mix(uVoidColor, uWineColor, 0.35), uWineColor, pq);
      float pr = mix(0.2, 0.62, sqrt(pq));
      vec3 pdot = ramp(min(pq * 0.85 + 0.25, 1.0), hazeCol);
      col = mix(pbg, pdot, step(length(f), pr));
    }
  }

  vec2 sh = shift(1.2);
  for (int i = 0; i < 16; i++) {
    if (i >= uSparkCount) break;
    vec4 s = uSpark[i];
    vec4 b = uSparkB[i];
    float age = uTime - s.w;
    if (age < 0.0) continue;
    float grow = smoothstep(0.0, 0.55, age) * (1.0 + 0.3 * exp(-age * 3.0) * sin(age * 13.0));
    float tw = 0.84 + 0.16 * sin(uTime * uTwinkle * 1.7 + b.y);
    float fl = 1.0 + b.z * 0.6;
    float reach = s.z * grow * tw * fl;
    float core = b.w * grow * fl;
    vec3 tint = mix(uHotColor, uStarColor, b.x);
    vec2 c = s.xy + sh;
    vec2 d = css - c;
    float th = uSpikeWidth * 0.5 + 0.25;
    float hx = step(abs(d.y), th) * pow(max(1.0 - abs(d.x) / max(reach, 1.0), 0.0), 1.1);
    float vy = step(abs(d.x), th) * pow(max(1.0 - abs(d.y) / max(reach, 1.0), 0.0), 1.1);
    vec2 rd = vec2(d.x + d.y, d.x - d.y) * 0.7071;
    float diag = step(0.5, core / px - 1.5) * 0.45 * max(
      step(abs(rd.y), th) * pow(max(1.0 - abs(rd.x) / max(reach * 0.22, 1.0), 0.0), 2.0),
      step(abs(rd.x), th) * pow(max(1.0 - abs(rd.y) / max(reach * 0.22, 1.0), 0.0), 2.0));
    col = mix(col, tint, clamp(max(max(hx, vy), diag), 0.0, 1.0));
    float hp = px * 0.5;
    vec2 dcell = (floor(css / hp) + 0.5) * hp - (floor(c / hp) + 0.5) * hp;
    float disc = step(length(dcell), core);
    float glow = exp(-length(d) / max(core * 1.4, 1.0)) * (1.0 - disc);
    col += tint * glow * 0.35;
    col = mix(col, tint, disc);
    float crossMask = max(step(abs(d.y), th) * step(abs(d.x), core * 0.85),
                          step(abs(d.x), th) * step(abs(d.y), core * 0.85));
    col = mix(col, uStarColor, crossMask * disc * 0.9);
  }

  vec2 vu = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(vu * vec2(uRes.x / uRes.y, 1.0) * 1.1));
  col += (hash12(floor(css) + fract(uTime) * 91.0) - 0.5) * uGrain;
  frag = vec4(max(col, vec3(0.0)), 1.0);
}`
}
