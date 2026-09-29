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

  it("has no duplicate slot names", () => {
    const names = SKY_UNIFORM_SLOTS.map(([k]) => k)
    expect(new Set(names).size).toBe(names.length)
  })
})
