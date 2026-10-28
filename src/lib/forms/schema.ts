import { z } from "zod";
import { referenceKeys } from "./references";
export const fieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
  label: z.string().trim().min(1).max(300),
  type: z.enum([
    "text",
    "textarea",
    "number",
    "date",
    "time",
    "select",
    "file",
    "reference",
  ]),
  required: z.boolean(),
  options: z
    .preprocess(
      (value) =>
        Array.isArray(value)
          ? value.filter((v) => typeof v !== "string" || v.trim() !== "")
          : value,
      z.array(z.string().trim().min(1).max(300)).max(50),
    )
    .default([]),
  source: z.enum(referenceKeys).optional(),
  binding: z.string().max(200).optional(),
  value_map: z
    .record(z.string().trim().max(300), z.string().max(300))
    .optional(),
});
export const templateSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().max(1000),
    kind: z.enum(["general", "equipment_cleaning"]),
    fields: z.array(fieldSchema).min(1).max(50),
  })
  .superRefine((v, c) => {
    if (new Set(v.fields.map((f) => f.id)).size !== v.fields.length)
      c.addIssue({ code: "custom", message: "Field IDs must be unique." });
    if (v.fields.filter((f) => f.type === "file").length > 3)
      c.addIssue({ code: "custom", message: "Maximum three upload fields." });
    if (JSON.stringify(v).length > 60000)
      c.addIssue({
        code: "custom",
        message:
          "The form is too large. Reduce the number or length of options.",
      });
    for (const f of v.fields) {
      if (f.type === "reference" && !f.source)
        c.addIssue({
          code: "custom",
          path: ["fields", v.fields.indexOf(f), "source"],
          message: "Select an ERP data source for " + f.label,
        });
      if (f.type === "select" && new Set(f.options).size !== f.options.length)
        c.addIssue({
          code: "custom",
          path: ["fields", v.fields.indexOf(f), "options"],
          message: "Use distinct options for " + f.label,
        });
      if (f.type === "select" && f.options.length === 0)
        c.addIssue({
          code: "custom",
          path: ["fields", v.fields.indexOf(f), "options"],
          message: "Add choices for " + f.label,
        });
    }
  });
export type Template = z.infer<typeof templateSchema>;
export type FormField = Template["fields"][number];
export function answerMeaning(field: FormField, value: string): string {
  return field.value_map && Object.hasOwn(field.value_map, value)
    ? field.value_map[value]
    : value;
}
export function validateAnswers(
  template: Template,
  raw: Record<string, unknown>,
  fileIds: string[],
) {
  const errors: Record<string, string> = {},
    answers: Record<string, string> = {};
  for (const f of template.fields) {
    const value = typeof raw[f.id] === "string" ? String(raw[f.id]).trim() : "";
    answers[f.id] = value;
    if (f.type === "file") {
      if (f.required && !fileIds.includes(f.id))
        errors[f.id] = "Upload a file.";
      continue;
    }
    if (f.required && !value) errors[f.id] = "Required.";
    else if (value) {
      if (value.length > 4000) errors[f.id] = "Maximum 4,000 characters.";
      if (f.type === "select" && !f.options.includes(value))
        errors[f.id] = "Choose an available option.";
      if (f.type === "reference" && !z.uuid().safeParse(value).success)
        errors[f.id] = "Choose an available ERP record.";
      if (f.type === "number" && !/^-?\d+(\.\d+)?$/.test(value))
        errors[f.id] = "Enter a valid number.";
      if (f.type === "date" && !z.iso.date().safeParse(value).success)
        errors[f.id] = "Enter a valid date.";
      if (
        f.type === "time" &&
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
      )
        errors[f.id] = "Enter a valid time.";
    }
  }
  return { answers, errors };
}
export function uploadType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
  )
    return { ext: "png", mime: "image/png" };
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return { ext: "jpg", mime: "image/jpeg" };
  if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-")
    return { ext: "pdf", mime: "application/pdf" };
  return null;
}
