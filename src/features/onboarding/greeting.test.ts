import { describe, expect, it } from "vitest"
import { greetingFor } from "./greeting"

const at = (h: number, m: number) => new Date(2026, 0, 15, h, m)

describe("greetingFor", () => {
  it("greets the day from 6:00 to 19:59", () => {
    expect(greetingFor(at(6, 0))).toBe("buenoniaa")
    expect(greetingFor(at(12, 30))).toBe("buenoniaa")
    expect(greetingFor(at(19, 59))).toBe("buenoniaa")
  })

  it("greets the night from 20:00 to 5:59", () => {
    expect(greetingFor(at(20, 0))).toBe("buenanochee")
    expect(greetingFor(at(0, 0))).toBe("buenanochee")
    expect(greetingFor(at(5, 59))).toBe("buenanochee")
  })
})
