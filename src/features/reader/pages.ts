import type { Block } from "@/shared/content"

/** What the Reader shows at once. */
export type ReaderPage = readonly Block[]

/**
 * An entry's text cut into pages at its breaks (`---`): the author decides where a page turns. A break is the turn itself,
 * so it never shows on a page, and breaks at either end or in a row leave no blank page.
 */
export function pagesOf(blocks: readonly Block[]): ReaderPage[] {
  const pages: Block[][] = [[]]
  for (const block of blocks) {
    if (block.type === "break") pages.push([])
    else pages[pages.length - 1]!.push(block)
  }
  return pages.filter((page) => page.length > 0)
}
