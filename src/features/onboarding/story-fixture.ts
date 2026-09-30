import type { Story } from "@/shared/content"

/** A small parsed story for component tests: one block of each kind. */
export const STORY: Story = {
  meta: { title: "¿por qué creé esto?", updated: "2026-09-30" },
  blocks: [
    { type: "paragraph", runs: [{ kind: "text", text: "Primer párrafo de prueba." }] },
    {
      type: "paragraph",
      runs: [
        { kind: "text", text: "Con " },
        { kind: "em", text: "énfasis" },
        { kind: "text", text: " y " },
        { kind: "strong", text: "fuerza" },
        { kind: "text", text: "." },
      ],
    },
    { type: "quote", runs: [{ kind: "text", text: "Una cita." }] },
    { type: "break" },
    { type: "subheading", text: "un apartado" },
    { type: "paragraph", runs: [{ kind: "text", text: "Último párrafo." }] },
  ],
}
