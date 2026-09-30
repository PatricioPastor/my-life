import type { PhrasingContent, Root, RootContent } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { parse as parseYaml } from "yaml"
import type { Block, InlineRun, Story, StoryMeta } from "./types"

/** A readable failure: which construct is not allowed (or which frontmatter field is wrong) and where. */
export class StoryParseError extends Error {
  constructor(
    message: string,
    readonly construct: string,
    readonly line: number,
  ) {
    super(message)
    this.name = "StoryParseError"
  }
}

const ALLOWED = "paragraphs, *em*, **strong**, > quote, --- and ## subheading"

// GFM is enabled only so that its extras (tables, strikethrough, autolinks, task lists, footnotes) are recognised and
// rejected by name instead of slipping through as plain text.
const processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkGfm)

function lineOf(node: { position?: { start: { line: number } } | undefined }): number {
  return node.position?.start.line ?? 1
}

function unsupported(construct: string, line: number): StoryParseError {
  return new StoryParseError(`Unsupported Markdown construct at line ${line}: ${construct}. Allowed: ${ALLOWED}.`, construct, line)
}

function frontmatterError(detail: string, line: number): StoryParseError {
  return new StoryParseError(`Invalid frontmatter: ${detail}`, "frontmatter", line)
}

/** Human name of a node type that is not part of the subset. */
function constructName(node: RootContent | PhrasingContent): string {
  switch (node.type) {
    case "heading":
      return `heading level ${node.depth}`
    case "code":
      return "code block"
    case "inlineCode":
      return "inline code"
    case "html":
      return "HTML"
    case "break":
      return "hard line break"
    case "link":
    case "linkReference":
      return "link"
    case "image":
    case "imageReference":
      return "image"
    case "delete":
      return "strikethrough"
    case "footnoteDefinition":
    case "footnoteReference":
      return "footnote"
    case "yaml":
      return "frontmatter block in the body"
    default:
      return node.type
  }
}

/** Collapse spaces, tabs and line breaks to one space. Non-breaking spaces are content and stay. */
function collapse(text: string): string {
  return text.replace(/[ \t\r\n]+/g, " ")
}

/** Merge neighbouring runs of one kind, drop empty ones, and trim the outer edges of the paragraph. */
function tidy(runs: InlineRun[]): InlineRun[] {
  const merged: InlineRun[] = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && last.kind === "text" && run.kind === "text") last.text += run.text
    else merged.push({ ...run })
  }
  const first = merged[0]
  if (first) first.text = first.text.replace(/^ +/, "")
  const last = merged[merged.length - 1]
  if (last) last.text = last.text.replace(/ +$/, "")
  return merged.filter((run) => run.text !== "")
}

function plainText(children: PhrasingContent[], inSubheading = false): string {
  let out = ""
  for (const child of children) {
    if (child.type !== "text") {
      const emphasis = child.type === "emphasis" || child.type === "strong"
      throw unsupported(
        emphasis ? (inSubheading ? "emphasis in a subheading" : "nested emphasis") : constructName(child),
        lineOf(child),
      )
    }
    out += child.value
  }
  return collapse(out)
}

function inlineRuns(children: PhrasingContent[]): InlineRun[] {
  const runs: InlineRun[] = []
  for (const child of children) {
    if (child.type === "text") runs.push({ kind: "text", text: collapse(child.value) })
    else if (child.type === "emphasis") runs.push({ kind: "em", text: plainText(child.children) })
    else if (child.type === "strong") runs.push({ kind: "strong", text: plainText(child.children) })
    else throw unsupported(constructName(child), lineOf(child))
  }
  return tidy(runs)
}

/** A standalone `<!-- ... -->` is the format guide for the author: it never renders. */
function isStandaloneComment(value: string): boolean {
  const v = value.trim()
  return v.startsWith("<!--") && v.endsWith("-->") && v.indexOf("-->") === v.length - 3
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function readMeta(tree: Root): StoryMeta {
  const node = tree.children[0]
  if (!node || node.type !== "yaml") {
    throw new StoryParseError(
      "Missing frontmatter: the file must start with a --- block holding title and updated.",
      "frontmatter",
      1,
    )
  }
  const line = lineOf(node)
  let data: unknown
  try {
    data = parseYaml(node.value)
  } catch (e) {
    throw frontmatterError(`the YAML could not be read (${e instanceof Error ? e.message.split("\n")[0] : "unknown error"}).`, line)
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw frontmatterError('expected key/value fields ("title" and "updated").', line)
  }
  const { title, updated } = data as Record<string, unknown>
  if (typeof title !== "string" || title.trim() === "") throw frontmatterError('"title" is required and must be a non-empty string.', line)
  if (updated === undefined) throw frontmatterError('"updated" is required (an ISO date, YYYY-MM-DD).', line)
  if (typeof updated !== "string" || !isIsoDate(updated)) {
    throw frontmatterError(`"updated" must be an ISO date (YYYY-MM-DD), got ${JSON.stringify(updated)}.`, line)
  }
  return { title: collapse(title).trim(), updated }
}

function toBlock(node: RootContent): Block | null {
  switch (node.type) {
    case "paragraph": {
      const runs = inlineRuns(node.children)
      return runs.length === 0 ? null : { type: "paragraph", runs }
    }
    case "blockquote": {
      if (node.children.length !== 1) {
        throw unsupported("blockquote with more than one paragraph", lineOf(node))
      }
      const only = node.children[0]!
      if (only.type !== "paragraph") throw unsupported(`${constructName(only)} inside a blockquote`, lineOf(only))
      const runs = inlineRuns(only.children)
      return runs.length === 0 ? null : { type: "quote", runs }
    }
    case "heading": {
      if (node.depth !== 2) throw unsupported(constructName(node), lineOf(node))
      const text = plainText(node.children, true).trim()
      return text === "" ? null : { type: "subheading", text }
    }
    case "thematicBreak":
      return { type: "break" }
    case "html":
      if (isStandaloneComment(node.value)) return null
      throw unsupported(constructName(node), lineOf(node))
    default:
      throw unsupported(constructName(node), lineOf(node))
  }
}

/**
 * Parse a story file: YAML frontmatter plus a strict Markdown subset, into typed blocks.
 * Anything outside the subset throws a {@link StoryParseError} naming the construct and its line.
 */
export function parseStory(markdown: string): Story {
  const source = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  const tree = processor.parse(source)
  const meta = readMeta(tree)
  const blocks: Block[] = []
  for (const node of tree.children.slice(1)) {
    const block = toBlock(node)
    if (block) blocks.push(block)
  }
  return { meta, blocks }
}
