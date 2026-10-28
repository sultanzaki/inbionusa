import type { Template } from "./schema";
// Every form respects the editor's question order and uses the same section layout.
export function formSections(template: Template) {
  const sections = [];
  for (let i = 0; i < template.fields.length; i += 8)
    sections.push({
      id: "section-" + (i / 8 + 1),
      title:
        template.fields.length <= 8
          ? "Complete the form"
          : "Section " + (i / 8 + 1),
      fields: template.fields.slice(i, i + 8),
    });
  return sections;
}
