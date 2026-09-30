/** One styled stretch of text inside a paragraph or quote. Plain strings only: nothing here is ever rendered as HTML. */
export type InlineRun =
  | { kind: "text"; text: string }
  | { kind: "em"; text: string }
  | { kind: "strong"; text: string }

export type Block =
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "quote"; runs: InlineRun[] }
  | { type: "subheading"; text: string }
  | { type: "break" }

export interface StoryMeta {
  title: string
  /** ISO calendar date, `YYYY-MM-DD`. */
  updated: string
}

export interface Story {
  meta: StoryMeta
  blocks: Block[]
}
