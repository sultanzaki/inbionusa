import type { ReferenceSource } from "./references";
import { answerMeaning, type Template, type FormField } from "./schema";
// Bindings are stable even when the administrator changes question labels.
const questions = [
  ["Tanggal Pencucian", "date"],
  ["Area Kerja", "select"],
  ["Nama Alat", "select"],
  ["Produk/Bahan/Sampel Terakhir Diproses Menggunakan Alat", "text"],
  ['Batch Number Produksi (Jika Bukan Produk Inbionusa, Tuliskan "-")', "text"],
  ["Nama Petugas", "select"],
  ["Waktu Mulai Pencucian", "time"],
  ["Waktu Selesai Pencucian", "time"],
  ["Jenis Potensi Najis", "select", ["Ringan", "Sedang", "Berat"]],
  [
    "Metode Pencucian (Sesuai SOP)",
    "select",
    [
      "Pencucian Najis Ringan (Air)",
      "Pencucian Najis Sedang (Air + Sabun)",
      "Pencucian Najis Berat (Air + Tanah)",
    ],
  ],
  ["Bahan Pembersih Yang Digunakan", "text"],
  [
    "Apakah Pembilasan Telah Dilakukan Sesuai Prosedur?",
    "select",
    ["Ya, sesuai prosedur", "Tidak", "Tidak berlaku sesuai SOP"],
  ],
  [
    "Apakah Terdapat Residu Produk Atau Bahan Setelah Pencucian?",
    "select",
    [
      "Tidak ditemukan residu yang terlihat",
      "Ditemukan residu",
      "Belum dapat dipastikan",
    ],
  ],
  [
    "Kondisi Alat Setelah Pencucian",
    "select",
    [
      "Bersih secara visual",
      "Belum bersih",
      "Terdapat kondisi tidak normal atau kerusakan",
    ],
  ],
  [
    "Apakah Alat Sudah Dikeringkan Atau Ditangani Sesuai Prosedur Penyimpanan?",
    "select",
    [
      "Sudah dikeringkan dan disimpan sesuai prosedur",
      "Sudah ditangani sesuai prosedur, tetapi belum disimpan",
      "Belum selesai ditangani",
    ],
  ],
  [
    "Hasil Akhir Kegiatan Pencucian",
    "select",
    [
      "Selesai dan memenuhi kriteria pemeriksaan",
      "Selesai, tetapi memerlukan tindakan lanjutan",
      "Belum selesai",
    ],
  ],
  ["Jika Ditemukan Ketidaksesuaian, Tindakan Apa Yang Dilakukan?", "textarea"],
  ["Nama Pemeriksa/Penanggung Jawab Verifikasi", "select"],
  [
    "Apakah Alat Sudah Dinyatakan Siap Digunakan Kembali?",
    "select",
    ["Siap digunakan kembali", "Belum siap digunakan kembali"],
  ],
  ["Notes", "textarea"],
] as const;
export const cleaningTemplate: Template = {
  title: "Form Pencucian Alat",
  description: "Catat pencucian dan pemeriksaan kelayakan alat.",
  kind: "equipment_cleaning",
  fields: questions.map((q, i) => ({
    id: "q" + i,
    label: q[0],
    binding: q[0],
    type: q[1],
    required: true,
    options: q[2]
      ? [...q[2]]
      : [
            "Area Kerja",
            "Nama Alat",
            "Nama Petugas",
            "Nama Pemeriksa/Penanggung Jawab Verifikasi",
          ].includes(q[0])
        ? ["ERP"]
        : [],
  })),
};
// The importer keys remain stable; labels, field IDs and displayed answers are editable.
const labels = [
  "Cleaning date",
  "Work area",
  "Equipment",
  "Last processed product or material",
  "Production batch",
  "Cleaning operator",
  "Start time",
  "Finish time",
  "Contamination category",
  "Cleaning method",
  "Cleaning agent",
  "Rinsing",
  "Residue",
  "Equipment condition",
  "Drying and storage",
  "Cleaning outcome",
  "Corrective action",
  "Inspector",
  "Ready for reuse",
  "Notes",
];
const sources: Record<number, ReferenceSource> = {
  1: "locations",
  2: "equipment",
  5: "staff",
  17: "staff",
};
type CleaningTarget = {
  binding: string;
  label: string;
  required: boolean;
  types: FormField["type"][];
  source?: ReferenceSource;
  options: readonly string[];
  passOptions: readonly string[];
};
export const cleaningTargets: CleaningTarget[] = questions.map((q, i) => ({
  binding: q[0],
  label: labels[i],
  required: ![10, 16, 19].includes(i),
  types: sources[i]
    ? ["reference", "select"]
    : q[1] === "text" || q[1] === "textarea"
      ? ["text", "textarea"]
      : [q[1]],
  source: sources[i],
  options: q[2] ? [...q[2]] : [],
  passOptions:
    [11, 12, 13, 14, 15, 18].includes(i) && q[2]
      ? i === 14
        ? [...q[2]].slice(0, 2)
        : [...q[2]].slice(0, 1)
      : [],
}));
export type IntegrationIssue = { fieldId?: string; message: string };
export function cleaningIntegrationIssues(
  template: Template,
): IntegrationIssue[] {
  if (template.kind !== "equipment_cleaning") return [];
  const issues: IntegrationIssue[] = [];
  for (const field of template.fields) {
    if (
      field.binding &&
      !cleaningTargets.some((t) => t.binding === field.binding)
    )
      issues.push({
        fieldId: field.id,
        message: "Choose a supported cleaning target for " + field.label + ".",
      });
  }
  for (const target of cleaningTargets) {
    const fields = template.fields.filter((f) => f.binding === target.binding);
    if (!fields.length) {
      if (target.required)
        issues.push({ message: "Map a question to " + target.label + "." });
      continue;
    }
    if (fields.length > 1) {
      fields.forEach((f) =>
        issues.push({
          fieldId: f.id,
          message: "Map only one question to " + target.label + ".",
        }),
      );
      continue;
    }
    const f = fields[0];
    if (
      !target.types.includes(f.type) ||
      (f.type === "reference" && f.source !== target.source) ||
      (Boolean(target.source) &&
        f.type === "select" &&
        (f.options.length !== 1 || f.options[0] !== "ERP"))
    )
      issues.push({
        fieldId: f.id,
        message:
          "Use " +
          (target.source
            ? "an ERP reference to " + target.source
            : target.types.join(" or ")) +
          " for " +
          target.label +
          ".",
      });
    if (
      !target.options.length &&
      f.value_map &&
      Object.keys(f.value_map).length
    )
      issues.push({
        fieldId: f.id,
        message: "Answer meanings apply only to single-choice cleaning checks.",
      });
    if (target.required && !f.required)
      issues.push({
        fieldId: f.id,
        message: "Make " + target.label + " required for cleaning automation.",
      });
    if (target.options.length && f.type === "select") {
      for (const option of f.options) {
        const meaning = answerMeaning(f, option);
        if (!target.options.includes(meaning))
          issues.push({
            fieldId: f.id,
            message:
              "Map the meaning of “" + option + "” for " + target.label + ".",
          });
      }
      if (target.passOptions.length) {
        const meanings = f.options.map((o) => answerMeaning(f, o));
        if (
          !meanings.some((o) => target.passOptions.includes(o)) ||
          !meanings.some(
            (o) =>
              target.options.includes(o) && !target.passOptions.includes(o),
          )
        )
          issues.push({
            fieldId: f.id,
            message:
              "Include passing and failing answers for " + target.label + ".",
          });
      }
    }
  }
  return issues;
}
export function assertCleaningBindings(template: Template) {
  const issues = cleaningIntegrationIssues(template);
  if (issues.length) throw Error(issues[0].message);
}

export const cleaningAnswerLabels: Record<string, string> = {
  Ringan: "Light",
  Sedang: "Moderate",
  Berat: "Heavy",
  "Pencucian Najis Ringan (Air)": "Water",
  "Pencucian Najis Sedang (Air + Sabun)": "Water and soap",
  "Pencucian Najis Berat (Air + Tanah)": "Water and soil",
  "Ya, sesuai prosedur": "Rinsed according to SOP",
  Tidak: "Not performed",
  "Tidak berlaku sesuai SOP": "Not applicable under SOP",
  "Tidak ditemukan residu yang terlihat": "No visible residue",
  "Ditemukan residu": "Residue found",
  "Belum dapat dipastikan": "Not yet confirmed",
  "Bersih secara visual": "Visually clean",
  "Belum bersih": "Not clean",
  "Terdapat kondisi tidak normal atau kerusakan":
    "Abnormal condition or damage",
  "Sudah dikeringkan dan disimpan sesuai prosedur":
    "Dried and stored according to SOP",
  "Sudah ditangani sesuai prosedur, tetapi belum disimpan":
    "Handled according to SOP; not yet stored",
  "Belum selesai ditangani": "Handling incomplete",
  "Selesai dan memenuhi kriteria pemeriksaan":
    "Complete; inspection criteria met",
  "Selesai, tetapi memerlukan tindakan lanjutan":
    "Complete; follow-up required",
  "Belum selesai": "Incomplete",
  "Siap digunakan kembali": "Ready for reuse",
  "Belum siap digunakan kembali": "Not ready for reuse",
};
