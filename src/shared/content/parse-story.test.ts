import { describe, expect, it } from "vitest"
import { parseContent, parseStory, StoryParseError } from "./parse-story"

const FM = `---\ntitle: "¿por qué creé esto?"\nupdated: 2026-09-30\n---\n`
const doc = (body: string) => `${FM}\n${body}\n`

function failure(markdown: string): StoryParseError {
  try {
    parseStory(markdown)
  } catch (e) {
    expect(e).toBeInstanceOf(StoryParseError)
    return e as StoryParseError
  }
  throw new Error("expected parseStory to throw")
}

describe("parseStory: allowed constructs", () => {
  it("reads the frontmatter", () => {
    const { meta, blocks } = parseStory(doc("Hola."))
    expect(meta).toEqual({ title: "¿por qué creé esto?", updated: "2026-09-30" })
    expect(blocks).toHaveLength(1)
  })

  it("reads a plain paragraph", () => {
    expect(parseStory(doc("Un párrafo simple.")).blocks).toEqual([
      { type: "paragraph", runs: [{ kind: "text", text: "Un párrafo simple." }] },
    ])
  })

  it("reads emphasis and strong as runs, keeping the spaces around them", () => {
    expect(parseStory(doc("Esto es *muy* importante y **clave** hoy.")).blocks).toEqual([
      {
        type: "paragraph",
        runs: [
          { kind: "text", text: "Esto es " },
          { kind: "em", text: "muy" },
          { kind: "text", text: " importante y " },
          { kind: "strong", text: "clave" },
          { kind: "text", text: " hoy." },
        ],
      },
    ])
  })

  it("reads a blockquote as a quote with inline runs", () => {
    expect(parseStory(doc("> Lo *dijo* ella.")).blocks).toEqual([
      {
        type: "quote",
        runs: [
          { kind: "text", text: "Lo " },
          { kind: "em", text: "dijo" },
          { kind: "text", text: " ella." },
        ],
      },
    ])
  })

  it("reads ## as a subheading and --- as a break", () => {
    expect(parseStory(doc("## Un apartado\n\n---\n\nFin.")).blocks).toEqual([
      { type: "subheading", text: "Un apartado" },
      { type: "break" },
      { type: "paragraph", runs: [{ kind: "text", text: "Fin." }] },
    ])
  })

  it("keeps blocks in document order", () => {
    const types = parseStory(doc("Uno.\n\n> Dos.\n\n---\n\n## Tres\n\nCuatro.")).blocks.map((b) => b.type)
    expect(types).toEqual(["paragraph", "quote", "break", "subheading", "paragraph"])
  })

  it("returns no blocks for an empty body", () => {
    expect(parseStory(FM).blocks).toEqual([])
  })
})

describe("parseStory: whitespace and text", () => {
  it("collapses runs of spaces and soft line breaks, and trims the paragraph ends", () => {
    const { blocks } = parseStory(doc("Una   línea\ncon salto   suave.  "))
    expect(blocks).toEqual([{ type: "paragraph", runs: [{ kind: "text", text: "Una línea con salto suave." }] }])
  })

  it("handles CRLF line endings and a BOM", () => {
    const crlf = "﻿" + doc("Hola\nmundo.").replace(/\n/g, "\r\n")
    const { meta, blocks } = parseStory(crlf)
    expect(meta.title).toBe("¿por qué creé esto?")
    expect(blocks).toEqual([{ type: "paragraph", runs: [{ kind: "text", text: "Hola mundo." }] }])
  })

  it("preserves Spanish punctuation, accents and non-breaking spaces", () => {
    const text = "¿Qué será, ñandú? ¡Sí! «Comillas» — raya… café frío."
    const { blocks } = parseStory(doc(text))
    expect(blocks).toEqual([{ type: "paragraph", runs: [{ kind: "text", text }] }])
  })

  it("does not leave a stray space when emphasis touches the paragraph edge", () => {
    const { blocks } = parseStory(doc("*Empieza* y termina **así** "))
    expect(blocks).toEqual([
      {
        type: "paragraph",
        runs: [
          { kind: "em", text: "Empieza" },
          { kind: "text", text: " y termina " },
          { kind: "strong", text: "así" },
        ],
      },
    ])
  })
})

describe("parseStory: HTML comment guide", () => {
  it("ignores an HTML comment between the frontmatter and the text", () => {
    const md = `${FM}\n<!--\n  Formato permitido:\n  - párrafos\n-->\n\nHola.\n`
    expect(parseStory(md).blocks).toEqual([{ type: "paragraph", runs: [{ kind: "text", text: "Hola." }] }])
  })

  it("ignores comments anywhere between blocks", () => {
    const md = doc("Uno.\n\n<!-- nota -->\n\nDos.")
    expect(parseStory(md).blocks).toHaveLength(2)
  })

  it("reports the right line of a rejected construct that follows a comment", () => {
    const md = `${FM}\n<!--\n  guía\n-->\n\n- item\n`
    expect(failure(md).line).toBe(10)
  })
})

describe("parseStory: frontmatter validation", () => {
  it("requires frontmatter", () => {
    expect(failure("Hola.").message).toMatch(/frontmatter/i)
  })

  it("requires a title", () => {
    expect(failure("---\nupdated: 2026-09-30\n---\n\nHola.").message).toMatch(/title/)
  })

  it("rejects a blank or non-string title", () => {
    expect(failure('---\ntitle: "  "\nupdated: 2026-09-30\n---\n').message).toMatch(/title/)
    expect(failure("---\ntitle: 42\nupdated: 2026-09-30\n---\n").message).toMatch(/title/)
  })

  it("requires updated", () => {
    expect(failure("---\ntitle: Hola\n---\n").message).toMatch(/updated/)
  })

  it("requires updated to be an ISO date", () => {
    expect(failure("---\ntitle: Hola\nupdated: 30/09/2026\n---\n").message).toMatch(/updated.*ISO/)
    expect(failure("---\ntitle: Hola\nupdated: 2026-02-31\n---\n").message).toMatch(/updated.*ISO/)
  })

  it("rejects invalid YAML with a readable message", () => {
    expect(failure("---\ntitle: [oops\n---\n").message).toMatch(/frontmatter/i)
  })

  it("accepts a quoted date", () => {
    expect(parseStory('---\ntitle: Hola\nupdated: "2026-09-30"\n---\n').meta.updated).toBe("2026-09-30")
  })
})

describe("parseContent: a story with more fields", () => {
  it("returns the story plus every frontmatter field as written, for the caller to validate", () => {
    const { meta, blocks, fields } = parseContent("---\ntitle: Hola\nupdated: 2026-09-30\nrole: Autor\nstack: [a, b]\n---\n\nHola.")
    expect(meta).toEqual({ title: "Hola", updated: "2026-09-30" })
    expect(blocks).toEqual([{ type: "paragraph", runs: [{ kind: "text", text: "Hola." }] }])
    expect(fields).toEqual({ title: "Hola", updated: "2026-09-30", role: "Autor", stack: ["a", "b"] })
  })

  it("validates title and updated like a story", () => {
    expect(() => parseContent("---\nrole: Autor\n---\n")).toThrow(/title/)
  })

  it("keeps parseStory to the story alone", () => {
    expect(Object.keys(parseStory("---\ntitle: Hola\nupdated: 2026-09-30\nrole: Autor\n---\n"))).toEqual(["meta", "blocks"])
  })
})

describe("parseStory: rejected constructs", () => {
  const cases: Array<[string, string, string, number]> = [
    ["unordered list", "- uno\n- dos", "list", 6],
    ["ordered list", "1. uno\n2. dos", "list", 6],
    ["link", "Mira [esto](https://x.org).", "link", 6],
    ["image", "![alt](a.png)", "image", 6],
    ["inline code", "Usa `code` aquí.", "inline code", 6],
    ["code block", "```\ncodigo\n```", "code block", 6],
    ["raw html", "<div>hola</div>", "HTML", 6],
    ["inline html", "Hola <b>mundo</b>.", "HTML", 6],
    ["heading 1", "# Uno", "heading level 1", 6],
    ["heading 3", "### Tres", "heading level 3", 6],
    ["table", "| a | b |\n|---|---|\n| 1 | 2 |", "table", 6],
    ["hard line break", "Uno  \ndos", "hard line break", 6],
    ["nested emphasis", "**a *b* c**", "nested", 6],
    ["emphasis in a subheading", "## Un *apartado*", "emphasis in a subheading", 6],
    ["multi-paragraph quote", "> Uno.\n>\n> Dos.", "blockquote", 6],
    ["quote holding a list", "> - uno", "blockquote", 6],
    ["footnote-style definition", "[x]: https://x.org", "definition", 6],
  ]

  it.each(cases)("rejects %s", (_name, body, expected, line) => {
    const err = failure(doc(body))
    if (expected) expect(err.message.toLowerCase()).toContain(expected.toLowerCase())
    expect(err.line).toBe(line)
    expect(err.message).toContain(`line ${line}`)
  })

  it("names the construct and the line in the message", () => {
    const err = failure(doc("Uno.\n\n- dos"))
    expect(err.message).toBe(
      "Unsupported Markdown construct at line 8: list. Allowed: paragraphs, *em*, **strong**, > quote, --- and ## subheading.",
    )
    expect(err.construct).toBe("list")
  })

  it("rejects an HTML comment that is not standalone", () => {
    expect(failure(doc("Hola <!-- nota --> mundo.")).message).toMatch(/HTML/)
  })
})
