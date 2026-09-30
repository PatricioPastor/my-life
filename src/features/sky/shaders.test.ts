import { describe, expect, it } from "vitest"
import { SKY_UNIFORM_SLOTS, SKY_VERTEX, buildSkyFragment, uniformName } from "./shaders"

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1

describe("uniformName", () => {
  it("prefixes with u and capitalizes", () => {
    expect(uniformName("dotMin")).toBe("uDotMin")
    expect(uniformName("hotColor")).toBe("uHotColor")
  })
})

describe("buildSkyFragment", () => {
  const src = buildSkyFragment(SKY_UNIFORM_SLOTS)

  it("is a GLSL ES 3.00 program with a main()", () => {
    expect(src.startsWith("#version 300 es")).toBe(true)
    expect(src).toContain("void main()")
    expect(SKY_VERTEX.startsWith("#version 300 es")).toBe(true)
  })

  it("declares every tunable uniform exactly once with the right type", () => {
    for (const [key, kind] of SKY_UNIFORM_SLOTS) {
      const decl = `uniform ${kind === "c" ? "vec3" : "float"} ${uniformName(key)};`
      expect(count(src, decl), decl).toBe(1)
    }
  })

  it("declares the fixed uniforms the renderer feeds", () => {
    const fixed = [
      "uRes",
      "uDpr",
      "uTime",
      "uPointer",
      "uPointerOn",
      "uLook",
      "uSparkCount",
      "uSpark",
      "uSparkB",
      "uRipple",
      "uPlanet",
    ]
    for (const u of fixed) {
      expect(src, u).toMatch(new RegExp(`uniform \\w+ ${u}(\\[\\d+\\])?;`))
    }
  })

  it("keeps the ripple falloff free of pow() on a negative base", () => {
    expect(src).toContain("exp(-q * q)")
    expect(src).toContain("crossMask")
  })

  it("picks the sparkle tint by exact palette index, never by blending", () => {
    expect(src).not.toContain("mix(uHotColor, uStarColor")
    expect(src).toContain("vec3 starTint(float idx)")
    expect(src).toContain("vec3 tint = starTint(b.x);")
  })

  it("feeds the four star tints as their own uniform array, decoupled from the gas ramp", () => {
    expect(src).toContain("uniform vec3 uStarTints[4];")
    const body = src.slice(src.indexOf("vec3 starTint(float idx)"), src.indexOf("vec2 shift("))
    expect(body).toContain("uStarTints[")
    expect(body).not.toContain("mix(")
    expect(body).not.toContain("uHotColor")
    expect(body).not.toContain("uCrimsonColor")
    expect(src).toContain("starTint(floor(h2 * 4.0))")
  })

  it("carves a dark halo around each sparkle instead of brightening the gas under it", () => {
    const field = src.slice(src.indexOf("vec3 field("), src.indexOf("void main()"))
    expect(field).not.toContain("d += exp(-dist")
    expect(field).toContain("d -= exp(-(dist * dist)")
    expect(field).toContain("clamp(d, 0.0, 1.0)")
  })

  it("draws the sparkle cores porcelain, with the facet tint on spikes and glow", () => {
    expect(src).toContain("col = mix(col, uStarColor, disc *")
    expect(src).not.toContain("col = mix(col, tint, disc);")
    expect(src).toContain("col += tint * glow")
  })

  it("takes the anchor count as a uniform instead of assuming the first four sparkles", () => {
    expect(src).toMatch(/uniform int uAnchorCount;/)
    expect(src).toContain("float anchor = i < uAnchorCount ? 1.0 : 0.0;")
    expect(src).not.toMatch(/i < 4/)
  })

  it("declares the focus uniforms", () => {
    expect(src).toMatch(/uniform int uFocusIndex;/)
    for (const u of ["uFocusAmount", "uFocusTime", "uFocusMotion"]) {
      expect(src, u).toMatch(new RegExp(`uniform float ${u};`))
    }
    expect(src).toMatch(/uniform vec4 uFocusFx;/)
    expect(src).toMatch(/uniform vec4 uFocusArms;/)
  })

  it("dims only the gas with the focus amount, leaving stars and sparkles alone", () => {
    const field = src.slice(src.indexOf("vec3 field("), src.indexOf("void main()"))
    expect(field).toContain("1.0 - 0.4 * uFocusAmount")
    expect(field.indexOf("gasDim")).toBeLessThan(field.indexOf("d -= exp(-(dist * dist)"))
    const main = src.slice(src.indexOf("void main()"))
    expect(main).not.toContain("gasDim")
  })

  it("reveals only the focused anchor, with orbiting particles driven by the focus clock", () => {
    const main = src.slice(src.indexOf("void main()"))
    expect(main).toContain("i == uFocusIndex")
    expect(main).toContain("uFocusTime")
    expect(main).toContain("uFocusMotion")
    expect(main).toContain("focusParticles(")
  })

  it("has no duplicate slot names", () => {
    const names = SKY_UNIFORM_SLOTS.map(([k]) => k)
    expect(new Set(names).size).toBe(names.length)
  })
})
