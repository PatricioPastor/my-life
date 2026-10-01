/**
 * Static rules for `schema.prisma`, enforced by `schema-lint.test.ts`: the database is
 * snake_case, TypeScript stays camelCase, so every model and enum needs `@@map`, every
 * camelCase scalar field needs `@map`, and every mapped name must be snake_case.
 */

const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

interface Block {
  kind: "model" | "enum"
  name: string
  lines: string[]
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = []
  let current: Block | undefined
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim()
    const open = /^(model|enum)\s+(\w+)\s*\{$/.exec(line)
    if (open) {
      current = { kind: open[1] as Block["kind"], name: open[2], lines: [] }
    } else if (line === "}" && current) {
      blocks.push(current)
      current = undefined
    } else if (current && line) {
      current.lines.push(line)
    }
  }
  return blocks
}

/** Returns the list of rule violations in a Prisma schema; empty means compliant. */
export function lintPrismaSchema(source: string): string[] {
  const problems: string[] = []
  const blocks = parseBlocks(source)
  const modelNames = new Set(blocks.filter((b) => b.kind === "model").map((b) => b.name))
  const enumNames = new Set(blocks.filter((b) => b.kind === "enum").map((b) => b.name))

  for (const block of blocks) {
    const blockMap = block.lines
      .map((l) => /^@@map\("([^"]*)"\)/.exec(l)?.[1])
      .find((v) => v !== undefined)
    if (blockMap === undefined) problems.push(`${block.kind} ${block.name} has no @@map`)
    else if (!SNAKE_CASE.test(blockMap)) {
      problems.push(`${block.kind} ${block.name}: @@map "${blockMap}" is not snake_case`)
    }

    for (const line of block.lines) {
      if (line.startsWith("@@")) continue
      const mapped = /@map\("([^"]*)"\)/.exec(line)?.[1]
      const name = /^(\w+)/.exec(line)?.[1]
      if (!name) continue

      if (block.kind === "enum") {
        if (mapped === undefined && !SNAKE_CASE.test(name)) {
          problems.push(`enum ${block.name}: value ${name} needs a snake_case @map`)
        }
      } else {
        const type = /^\w+\s+(\w+)/.exec(line)?.[1] ?? ""
        // A field typed as another model is a relation: it has no column of its own.
        if (modelNames.has(type) && !enumNames.has(type)) continue
        if (mapped === undefined && !SNAKE_CASE.test(name)) {
          problems.push(`model ${block.name}: field ${name} needs a snake_case @map`)
        }
      }
      if (mapped !== undefined && !SNAKE_CASE.test(mapped)) {
        problems.push(`${block.kind} ${block.name}: @map "${mapped}" is not snake_case`)
      }
    }
  }

  return problems
}
