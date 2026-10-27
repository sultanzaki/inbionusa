import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const cleaningHeaders = [
  "Timestamp",
  "Tanggal Pencucian",
  "Area Kerja",
  "Nama Alat",
  "Produk/Bahan/Sampel Terakhir Diproses Menggunakan Alat",
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
  "Nomor Batch",
  "Notes",
] as const;
export const formSchema = z
  .object({
    event_id: z.uuid(),
    source_id: z.string().min(1).max(200),
    started_at: z.iso.datetime({ offset: true }),
    finished_at: z.iso.datetime({ offset: true }),
    fields: z.object(
      Object.fromEntries(cleaningHeaders.map((h) => [h, z.string().max(4000)])),
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
    rinse: 11,
    residue: 12,
    condition: 13,
    dry: 14,
    outcome: 15,
    ready: 18,
  } as const;
  const methods: Record<string, string> = {
    Ringan: "Pencucian Najis Ringan (Air)",
    Sedang: "Pencucian Najis Sedang (Air + Sabun)",
    Berat: "Pencucian Najis Berat (Air + Tanah)",
  };
  if (
    !methods[fields[cleaningHeaders[8]]?.trim()] ||
    methods[fields[cleaningHeaders[8]].trim()] !==
      fields[cleaningHeaders[9]]?.trim()
  )
    return false;
  return Object.entries(indexes).every(([key, index]) =>
    config[key as keyof typeof config].some(
      (a) =>
        a.trim().toLocaleLowerCase("id") ===
        fields[cleaningHeaders[index]].trim().toLocaleLowerCase("id"),
    ),
  );
}
