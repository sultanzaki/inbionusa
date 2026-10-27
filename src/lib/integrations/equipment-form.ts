import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const cleaningHeaders = [
  "Timestamp",
  "Tanggal Pencucian",
  "Area Kerja",
  "Nama Alat",
  "Produk/Bahan/Sampel Terakhir Diproses Menggunakan Alat",
  `Batch Number Produksi (Jika Bukan Produk Inbionusa, Tuliskan "-")`,
  "Nama Petugas",
  "Waktu Mulai Pencucian",
  "Waktu Selesai Pencucian",
  "Jenis Potensi Najis",
  "Metode Pencucian (Sesuai SOP)",
  "Bahan Pembersih Yang Digunakan",
  "Apakah Pembilasan Telah Dilakukan Sesuai Prosedur?",
  "Apakah Terdapat Residu Produk Atau Bahan Setelah Pencucian?",
  "Kondisi Alat Setelah Pencucian",
  "Apakah Alat Sudah Dikeringkan Atau Ditangani Sesuai Prosedur Penyimpanan?",
  "Hasil Akhir Kegiatan Pencucian",
  "Jika Ditemukan Ketidaksesuaian, Tindakan Apa Yang Dilakukan?",
  "Nama Pemeriksa/Penanggung Jawab Verifikasi",
  "Apakah Alat Sudah Dinyatakan Siap Digunakan Kembali?",
  "Notes",
] as const;
export const formSchema = z
  .object({
    event_id: z.uuid(),
    source_id: z.string().min(1).max(200),
    started_at: z.iso.datetime({ offset: true }),
    finished_at: z.iso.datetime({ offset: true }),
    fields: z.preprocess(
      (value) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const fields = { ...value } as Record<string, unknown>;
          if (!(cleaningHeaders[5] in fields) && "Nomor Batch" in fields)
            fields[cleaningHeaders[5]] = fields["Nomor Batch"];
          return fields;
        }
        return value;
      },
      z.object(
        Object.fromEntries(
          cleaningHeaders.map((h) => [h, z.string().max(4000)]),
        ),
      ),
    ),
  })
  .strict();
export function validSignature(
  body: string,
  stamp: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  if (
    !/^\d{13}$/.test(stamp) ||
    Math.abs(now - Number(stamp)) > 300000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(stamp + "." + body)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export const approvedCleaningAnswers = {
  rinse: ["Ya, sesuai prosedur"],
  residue: ["Tidak ditemukan residu yang terlihat"],
  condition: ["Bersih secara visual"],
  dry: [
    "Sudah dikeringkan dan disimpan sesuai prosedur",
    "Sudah ditangani sesuai prosedur, tetapi belum disimpan",
  ],
  outcome: ["Selesai dan memenuhi kriteria pemeriksaan"],
  ready: ["Siap digunakan kembali"],
};
export function inspectionPassed(
  fields: Record<string, string>,
  rawConfig: string = JSON.stringify(approvedCleaningAnswers),
) {
  const config = z
    .object({
      rinse: z.array(z.string()).min(1),
      residue: z.array(z.string()).min(1),
      condition: z.array(z.string()).min(1),
      dry: z.array(z.string()).min(1),
      outcome: z.array(z.string()).min(1),
      ready: z.array(z.string()).min(1),
    })
    .parse(JSON.parse(rawConfig));
  const indexes = {
    rinse: "Apakah Pembilasan Telah Dilakukan Sesuai Prosedur?",
    residue: "Apakah Terdapat Residu Produk Atau Bahan Setelah Pencucian?",
    condition: "Kondisi Alat Setelah Pencucian",
    dry: "Apakah Alat Sudah Dikeringkan Atau Ditangani Sesuai Prosedur Penyimpanan?",
    outcome: "Hasil Akhir Kegiatan Pencucian",
    ready: "Apakah Alat Sudah Dinyatakan Siap Digunakan Kembali?",
  } as const;
  const methods: Record<string, string> = {
    Ringan: "Pencucian Najis Ringan (Air)",
    Sedang: "Pencucian Najis Sedang (Air + Sabun)",
    Berat: "Pencucian Najis Berat (Air + Tanah)",
  };
  if (
    !methods[fields["Jenis Potensi Najis"]?.trim()] ||
    methods[fields["Jenis Potensi Najis"].trim()] !==
      fields["Metode Pencucian (Sesuai SOP)"]?.trim()
  )
    return false;
  return Object.entries(indexes).every(([key, index]) =>
    config[key as keyof typeof config].some(
      (a) =>
        a.trim().toLocaleLowerCase("id") ===
        fields[index].trim().toLocaleLowerCase("id"),
    ),
  );
}
