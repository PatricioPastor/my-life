import { describe, expect, it } from "vitest"
import { titleHidden } from "./title-motion"

// The title's timing, states and FLIP are the shared place title's (src/shared/ui/place-title/title-motion.test.ts).
describe("when the title is hidden", () => {
  it("hides while the camera flies to a memory, the glass is open or it moves to another", () => {
    expect(titleHidden("flying")).toBe(true)
    expect(titleHidden("open")).toBe(true)
    expect(titleHidden("switching")).toBe(true)
  })

  it("comes back as the camera flies home, and on the overview", () => {
    expect(titleHidden("leaving")).toBe(false)
    expect(titleHidden("idle")).toBe(false)
  })
})
