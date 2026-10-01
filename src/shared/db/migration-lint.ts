/**
 * Static rules for SQL migrations, enforced by `migration-lint.test.ts`:
 *  - every created table has ENABLE and FORCE ROW LEVEL SECURITY and at least one policy;
 *  - every created identifier (table, column, type, index) is snake_case.
 * `_prisma_migrations` is created by Prisma itself and is exempt from the table rules.
 */

export const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

const PRISMA_TABLE = "_prisma_migrations"
const IDENT = String.raw`(?:public\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?`

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "")
}

/** Body of a `CREATE TABLE name ( ... );` block: the text between the outer parentheses. */
function tableBody(sql: string, from: number): string {
  const open = sql.indexOf("(", from)
  let depth = 0
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") depth++
    else if (sql[i] === ")" && --depth === 0) return sql.slice(open + 1, i)
  }
  return sql.slice(open + 1)
}

/** Splits a table body on top-level commas. */
function splitDefinitions(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const ch of body) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      parts.push(current)
      current = ""
    } else current += ch
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

function checkSnake(kind: string, name: string, problems: string[]) {
  if (!SNAKE_CASE.test(name)) problems.push(`${kind} "${name}" is not snake_case`)
}

/** Returns the list of rule violations in a migration; empty means compliant. */
export function lintMigration(rawSql: string): string[] {
  const sql = stripComments(rawSql)
  const problems: string[] = []

  for (const m of sql.matchAll(new RegExp(String.raw`CREATE\s+TYPE\s+${IDENT}`, "gi"))) {
    checkSnake("type", m[1], problems)
  }

  for (const m of sql.matchAll(
    new RegExp(String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?${IDENT}`, "gi"),
  )) {
    checkSnake("index", m[1], problems)
  }

  for (const m of sql.matchAll(
    new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${IDENT}`, "gi"),
  )) {
    const table = m[1]
    if (table === PRISMA_TABLE) continue

    checkSnake("table", table, problems)

    for (const def of splitDefinitions(tableBody(sql, m.index + m[0].length - 1))) {
      if (/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(def)) continue
      const column = /^"?([A-Za-z_][A-Za-z0-9_]*)"?/.exec(def)?.[1]
      if (column) checkSnake(`column of ${table}`, column, problems)
    }

    const on = String.raw`ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?"?${table}"?\s+`
    for (const action of ["ENABLE", "FORCE"]) {
      if (!new RegExp(`${on}${action}\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(sql)) {
        problems.push(`table "${table}" is missing ${action} ROW LEVEL SECURITY`)
      }
    }
    if (!new RegExp(String.raw`CREATE\s+POLICY\s+\S+\s+ON\s+(?:public\.)?"?${table}"?\s`, "i").test(sql)) {
      problems.push(`table "${table}" has no CREATE POLICY`)
    }
  }

  return problems
}
