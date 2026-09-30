import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { STORY } from "./story-fixture"
import { StoryBlocks } from "./story-blocks"

afterEach(cleanup)

describe("StoryBlocks", () => {
  it("renders each block kind with its own element, in order", () => {
    const { container } = render(<StoryBlocks blocks={STORY.blocks} delayMs={(i) => i * 100} />)
    const tags = Array.from(container.children).map((el) => el.tagName.toLowerCase())
    expect(tags).toEqual(["p", "p", "blockquote", "hr", "h3", "p"])
  })

  it("renders em and strong runs as elements", () => {
    const { container } = render(<StoryBlocks blocks={STORY.blocks} delayMs={() => 0} />)
    expect(container.querySelector("em")?.textContent).toBe("énfasis")
    expect(container.querySelector("strong")?.textContent).toBe("fuerza")
  })

  it("staggers the entrance by block index", () => {
    const { container } = render(<StoryBlocks blocks={STORY.blocks} delayMs={(i) => 600 + i * 140} />)
    expect((container.children[2] as HTMLElement).style.animationDelay).toBe("880ms")
  })

  it("never turns text into markup", () => {
    const { container } = render(
      <StoryBlocks blocks={[{ type: "paragraph", runs: [{ kind: "text", text: "<img src=x onerror=alert(1)>" }] }]} delayMs={() => 0} />,
    )
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toBe("<img src=x onerror=alert(1)>")
  })
})
