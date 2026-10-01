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
uniform vec3 uStarTints[4];
uniform int uAnchorCount;
uniform int uFocusIndex;
uniform float uFocusAmount;
uniform float uFocusTime;
uniform float uFocusMotion;
uniform vec4 uFocusFx;
uniform vec4 uFocusArms;
uniform vec4 uOrb;
uniform vec3 uOrbColor;
uniform float uOrbFringe;
uniform vec4 uOrbLens;
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
const int MAX_RIPPLES = 4;
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
// Sparkle color by exact index into the preset's four tints, never blended.
vec3 starTint(float idx){
  return uStarTints[int(clamp(floor(idx + 0.5), 0.0, 3.0))];
}
vec2 shift(float depth){
  return floor(uLook * uParallax * depth * 28.0);
}

vec3 field(vec2 pos, vec2 resCss){
  float minSide = min(resCss.x, resCss.y);
  vec2 uv = (pos - 0.5 * resCss) / minSide;
  vec2 p = uv * uScale + uLook * uParallax * 0.05;

  // A peeking orb holds the cursor light back around itself: the pointer sits on the orb while it is
  // captured, and that warm lamp would brighten the ember gas right behind it and dull its cool preview.
  vec2 toO = pos - uOrb.xy;
  float shield = uOrbLens.w * (1.0 - smoothstep(uOrbLens.y * 1.35, max(uOrbLens.z, uOrbLens.y * 1.35 + 1.0), length(toO)));
  vec2 toP = pos - uPointer;
  float lamp = exp(-dot(toP, toP) / (uLensRadius * uLensRadius)) * uPointerOn;
  lamp *= 1.0 - shield;
  p += toP / minSide * lamp * uLensPush * uScale;

  float ring = 0.0;
  for (int i = 0; i < MAX_RIPPLES; i++) {
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
  // Focusing a star dims the gas (not the stars) by up to 40%.
  // The gas also thins around a peeking orb, so the window reads against the dark.
  float gasDim = (1.0 - 0.4 * uFocusAmount) * (1.0 - 0.8 * shield);
  d *= gasDim;

  for (int i = 0; i < 16; i++) {
    if (i >= uSparkCount) break;
    vec4 s = uSpark[i];
    vec4 b = uSparkB[i];
    float grow = smoothstep(0.0, 0.6, uTime - s.w);
    float dist = length(pos - s.xy - shift(1.2));
    // A smooth clearing, not a glow: the gas thins around each star so it reads against it.
    float halo = max(b.w * 3.2 + s.z * 0.16, 10.0) * (1.0 + b.z * 0.6);
    d -= exp(-(dist * dist) / (halo * halo)) * 0.95 * grow;
  }

  float hz = smoothstep(0.25, 0.75, n + river * 0.25) * uHaze * gasDim;
  float tone = fbm(p * 0.45 + vec2(11.0, -3.0) + t * 0.2);
  return vec3(clamp(d, 0.0, 1.0), hz, tone);
}

// Erratic pixel motes around the focused star: they scatter, then converge and settle by about 1.2 s.
float focusParticles(vec2 css, vec2 c, float T, float px){
  float conv = smoothstep(0.1, 1.2, T);
  float hit = 0.0;
  for (int j = 0; j < 7; j++) {
    float fj = float(j);
    float h1 = hash12(vec2(fj, 3.7));
    float h2 = hash12(vec2(fj, 8.1));
    float h3 = hash12(vec2(fj, 1.3));
    // Speed, direction and radius change in hashed steps, so the orbit never feels mechanical.
    float seg = floor(T * (2.0 + 3.0 * h2));
    float kick = (hash12(vec2(fj + seg * 0.37, 5.5)) - 0.5) * 6.0 * (1.0 - conv);
    float ang = h1 * 6.283 + T * (2.5 + 5.0 * h2) * (h3 > 0.5 ? 1.0 : -1.0) + kick;
    float wander = 1.0 + 0.5 * sin(T * (5.0 + 7.0 * h3) + fj * 2.1) * (1.0 - conv);
    float r0 = (60.0 + 110.0 * h1) * wander;
    float rs = (40.0 + 24.0 * h2) * (1.0 + 0.08 * sin(T * (1.7 + h3) + fj));
    vec2 pp = c + vec2(cos(ang), sin(ang)) * mix(r0, rs, conv);
    vec2 dc = floor(pp / px) - floor(css / px);
    hit = max(hit, step(max(abs(dc.x), abs(dc.y)), 0.5));
  }
  return hit;
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
      // The far layer stays porcelain; nearer ones pick one of the four exact star tints.
      vec3 sc = l == 0 ? uStarColor : starTint(floor(h2 * 4.0));
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
    float anchor = i < uAnchorCount ? 1.0 : 0.0;
    // Only the focused anchor gets the entropic reveal; reduced motion leaves uFocusMotion at 0.
    float amt = i == uFocusIndex ? uFocusAmount : 0.0;
    float mot = uFocusMotion * smoothstep(0.0, 0.25, amt);
    float flick = mix(1.0, uFocusFx.x, mot);
    vec4 arms = mix(vec4(1.0), uFocusArms, mot);
    float reach = s.z * grow * tw * fl * (1.0 + 0.4 * mot);
    float core = b.w * grow * fl * (1.0 + 0.3 * anchor) * mix(1.0, uFocusFx.y, mot);
    vec3 tint = starTint(b.x);
    vec2 c = s.xy + sh;
    vec2 d = css - c;
    float th = uSpikeWidth * 0.5 + 0.25;
    float rx = reach * (d.x >= 0.0 ? arms.x : arms.y);
    float ry = reach * (d.y >= 0.0 ? arms.z : arms.w);
    float hx = step(abs(d.y), th) * pow(max(1.0 - abs(d.x) / max(rx, 1.0), 0.0), 1.1);
    float vy = step(abs(d.x), th) * pow(max(1.0 - abs(d.y) / max(ry, 1.0), 0.0), 1.1);
    vec2 rd = vec2(d.x + d.y, d.x - d.y) * 0.7071;
    float diag = step(0.5, core / px - 1.5) * 0.45 * max(
      step(abs(rd.y), th) * pow(max(1.0 - abs(rd.x) / max(reach * 0.22, 1.0), 0.0), 2.0),
      step(abs(rd.x), th) * pow(max(1.0 - abs(rd.y) / max(reach * 0.22, 1.0), 0.0), 2.0));
    col = mix(col, tint, clamp(max(max(hx, vy), diag) * (1.0 + 0.25 * anchor) * flick, 0.0, 1.0));
    float hp = px * 0.5;
    vec2 dcell = (floor(css / hp) + 0.5) * hp - (floor(c / hp) + 0.5) * hp;
    float disc = step(length(dcell), core);
    float glow = exp(-length(d) / max(core * 1.4, 1.0)) * (1.0 - disc);
    col += tint * glow * (0.35 + 0.25 * anchor) * flick;
    col = mix(col, uStarColor, disc * mix(1.0, 0.35 + 0.65 * flick, mot));
    float crossMask = max(step(abs(d.y), th) * step(abs(d.x), core * 0.85),
                          step(abs(d.x), th) * step(abs(d.y), core * 0.85));
    col = mix(col, uStarColor, crossMask * disc * 0.9);
    if (mot > 0.0) {
      float motes = focusParticles(css, c, uFocusTime, px);
      col = mix(col, mix(tint, uStarColor, 0.3), motes * mot * smoothstep(0.0, 0.2, uFocusTime));
    }
  }

  // The memory orb: a soft halftone glow. Each color channel falls off at its own radius, and a thin ring
  // splits the same way, which fringes the rim like a lens. Nothing here is a hard edge.
  if (uOrb.w > 0.001) {
    float od = length(css - uOrb.xy);
    float R = uOrb.z;
    if (od < R * 2.6) {
      vec3 x = vec3(od) / (R * vec3(1.0 - uOrbFringe, 1.0, 1.0 + uOrbFringe));
      vec3 halo = exp(-x * x * 2.4);
      // The same ordered dither and dot growth as the gas, so the glow shares the sky's texture.
      float oq = clamp(floor(halo.g * L + dith) / L, 0.0, 1.0);
      float oDot = step(length(f), mix(uDotMin, uDotMax, sqrt(oq))) * step(0.01, oq);
      float kc = od / (R * 0.38);
      float core = exp(-kc * kc);
      vec3 hot = mix(uOrbColor, uStarColor, 0.32);
      // Once the lens opens, the soft glow steps back and the lens takes over the middle.
      float pk = uOrbLens.x;
      col += halo * uOrbColor * (0.42 * uOrb.w) * (1.0 - 0.45 * pk);
      col = mix(col, mix(uOrbColor, hot, core), oDot * clamp(halo.g * 1.5, 0.0, 1.0) * 0.5 * uOrb.w);
      col += hot * core * (0.22 * uOrb.w) * (1.0 - pk);
      vec3 q = (vec3(od) - R * vec3(0.82, 0.875, 0.93)) / (R * 0.08);
      col += exp(-q * q) * mix(uOrbColor, vec3(1.0), 0.45) * (0.14 * uOrb.w) * (1.0 - pk);
    }

    // The lens: a smooth glass sphere onto the memories dimension, drawn over the halftone. Inside it is
    // the deep near-black void with a faint violet cast, a few round motes at three depths and two tiny
    // orbs in the orb's own colors, all seen through the sphere (fresnel rim, specular, chromatic fringe).
    // Nothing here is dithered: it reads as another, smoother world than the halftone around it.
    float Rl = uOrbLens.y;
    vec2 oc = css - uOrb.xy;
    float lr = length(oc) / max(Rl, 1.0);
    if (uOrbLens.x > 0.001 && Rl > 1.0 && lr < 1.1) {
      vec2 n2 = oc / Rl;
      float zz = sqrt(max(1.0 - dot(n2, n2), 0.0));
      // The glass bends the view toward the rim, so the world inside looks curved.
      vec2 view = n2 * (1.0 + 0.45 * (1.0 - zz));
      vec3 lensCol = vec3(0.016, 0.012, 0.036);
      lensCol += vec3(0.34, 0.29, 0.67) * 0.14 * (1.0 - smoothstep(0.0, 1.25, length(view - vec2(0.05, -0.12))));
      // Round dust motes: three layers, deeper ones smaller, dimmer and slower, with a hint of parallax.
      float motes = 0.0;
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float depth = 0.35 + 0.325 * fk;
        vec2 pq = view * (2.3 + 1.2 * fk) + uLook * (0.35 * depth) + vec2(uTime * (0.05 + 0.035 * fk), -uTime * (0.03 + 0.02 * fk)) + fk * 7.3;
        vec2 cellId = floor(pq);
        vec2 fr = fract(pq);
        float h0 = hash12(cellId + fk * 31.0);
        float h1 = hash12(cellId * 1.3 + 4.7 + fk);
        float h2 = hash12(cellId * 0.7 + 9.1 + fk);
        vec2 mc = 0.3 + 0.4 * vec2(h1, h2) + 0.06 * vec2(sin(uTime * 0.6 + h0 * 6.283), cos(uTime * 0.5 + h1 * 6.283));
        float mr = (0.05 + 0.05 * h2) * (0.55 + 0.75 * depth);
        float md = length(fr - mc);
        motes += step(0.42, h0) * exp(-(md * md) / (mr * mr)) * (0.2 + 0.55 * depth);
      }
      lensCol += vec3(0.78, 0.82, 1.0) * motes * 0.6;
      // Two tiny orbs in the orb palette drift through the dimension.
      vec3 tiny = vec3(0.0);
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float ang = uTime * (0.23 + 0.11 * fk) + fk * 3.1;
        vec2 oc2 = vec2(cos(ang), sin(ang * 1.3 + fk)) * (0.36 + 0.14 * fk) + uLook * (0.05 * (1.0 + fk));
        float r2 = 0.085 - 0.025 * fk;
        vec2 dv = view - oc2;
        float dd2 = dot(dv, dv);
        vec3 tc = k == 0 ? uOrbColor : uOrbColor.gbr;
        float body = 1.0 - smoothstep(r2 * 0.55, r2, sqrt(dd2));
        tiny += tc * (body * 0.9 + exp(-dd2 / (r2 * r2 * 5.0)) * 0.35) + vec3(1.0) * exp(-dd2 / (r2 * r2 * 0.25)) * 0.22;
      }
      lensCol += tiny;
      // Fresnel: the glass brightens toward its rim, in the orb's own light.
      float fresnel = pow(1.0 - zz, 3.0);
      lensCol += mix(uOrbColor, vec3(1.0), 0.3) * fresnel * 0.42;
      // Chromatic fringe: the rim splits into three rings, one per channel, just like the glow's.
      vec3 rc = vec3(0.975) - vec3(1.3, 0.65, 0.0) * uOrbFringe;
      vec3 rq = (vec3(lr) - rc) / 0.055;
      lensCol += exp(-rq * rq) * mix(uOrbColor, vec3(1.0), 0.4) * 0.3;
      // Specular: a soft highlight up and to the left, and a faint bounce light opposite.
      vec2 hv = n2 - vec2(-0.36, 0.4);
      vec2 bv = n2 - vec2(0.44, -0.44);
      lensCol += vec3(1.0) * (exp(-dot(hv, hv) / 0.01) * 0.55 + exp(-dot(hv, hv) / 0.14) * 0.07);
      lensCol += uOrbColor * exp(-dot(bv, bv) / 0.03) * 0.14;
      float lensMask = (1.0 - smoothstep(0.93, 1.0, lr)) * clamp(uOrbLens.x * uOrb.w, 0.0, 1.0);
      col = mix(col, lensCol, lensMask);
    }
  }

  vec2 vu = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - uVignette * (1.0 + 0.35 * uFocusAmount) * smoothstep(0.35, 0.95, length(vu * vec2(uRes.x / uRes.y, 1.0) * 1.1));
  col += (hash12(floor(css) + fract(uTime) * 91.0) - 0.5) * uGrain;
  frag = vec4(max(col, vec3(0.0)), 1.0);
}`
}
