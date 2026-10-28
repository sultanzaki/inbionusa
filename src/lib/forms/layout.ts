import type { Template } from "./schema";
export function formSections(template: Template) {
  if (template.kind !== "equipment_cleaning") {
    const sections = [];
    for (let i = 0; i < template.fields.length; i += 8)
      sections.push({
        id: "section-" + (i / 8 + 1),
        title:
          template.fields.length <= 8
            ? "Pengisian form"
            : "Bagian " + (i / 8 + 1),
        fields: template.fields.slice(i, i + 8),
      });
    return sections;
  }
  const groups = [
    {
      title: "Identitas alat",
      bindings: [
        "Tanggal Pencucian",
        "Area Kerja",
        "Nama Alat",
        "Produk/Bahan/Sampel Terakhir Diproses Menggunakan Alat",
        "Batch Number Produksi",
        "Nama Petugas",
      ],
    },
    {
      title: "Pelaksanaan pencucian",
      bindings: [
        "Waktu Mulai Pencucian",
        "Waktu Selesai Pencucian",
        "Jenis Potensi Najis",
        "Metode Pencucian (Sesuai SOP)",
        "Bahan Pembersih Yang Digunakan",
      ],
    },
    {
      title: "Pemeriksaan hasil",
      bindings: [
        "Apakah Pembilasan",
        "Apakah Terdapat Residu",
        "Kondisi Alat Setelah",
        "Apakah Alat Sudah Dikeringkan",
        "Hasil Akhir",
        "Jika Ditemukan Ketidaksesuaian",
      ],
    },
    {
      title: "Verifikasi",
      bindings: ["Nama Pemeriksa", "Apakah Alat Sudah Dinyatakan", "Notes"],
    },
  ];
  const remaining = new Set(template.fields.map((f) => f.id));
  const sections = groups
    .map((group, i) => {
      const fields = template.fields.filter(
        (f) =>
          f.binding && group.bindings.some((b) => f.binding!.startsWith(b)),
      );
      fields.forEach((f) => remaining.delete(f.id));
      return { id: "section-" + (i + 1), title: group.title, fields };
    })
    .filter((g) => g.fields.length);
  if (remaining.size)
    sections.push({
      id: "section-additional",
      title: "Informasi tambahan",
      fields: template.fields.filter((f) => remaining.has(f.id)),
    });
  return sections;
}
