import type { Project } from "./parse-project"

/** A small parsed case study for component tests: two pages (a break between them), one block of each kind. */
export const PROJECT: Project = {
  meta: {
    slug: "consola",
    title: "Consola de prueba",
    updated: "2026-10-06",
    role: "Diseño y desarrollo",
    period: "2026",
    summary: "Una consola de prueba.",
    stack: ["Next.js 16", "React 19"],
    order: 1,
  },
  blocks: [
    {
      type: "paragraph",
      runs: [
        { kind: "text", text: "Primera página, " },
        { kind: "em", text: "con énfasis" },
        { kind: "text", text: "." },
      ],
    },
    { type: "quote", runs: [{ kind: "text", text: "Una cita." }] },
    { type: "break" },
    { type: "subheading", text: "Cómo está hecho" },
    {
      type: "paragraph",
      runs: [
        { kind: "text", text: "Segunda página, " },
        { kind: "strong", text: "con fuerza" },
        { kind: "text", text: "." },
      ],
    },
  ],
}
