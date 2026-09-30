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

  it("has no duplicate slot names", () => {
    const names = SKY_UNIFORM_SLOTS.map(([k]) => k)
    expect(new Set(names).size).toBe(names.length)
  })
})
