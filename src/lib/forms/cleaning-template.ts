import type { Template } from "./schema";
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
export function assertCleaningBindings(template: Template) {
  if (template.kind !== "equipment_cleaning") return;
  for (const f of cleaningTemplate.fields) {
    const match = template.fields.filter((x) => x.binding === f.binding);
    if (match.length !== 1 || match[0].type !== f.type || !match[0].required)
      throw Error("Keep the required cleaning field: " + f.label);
  }
}
