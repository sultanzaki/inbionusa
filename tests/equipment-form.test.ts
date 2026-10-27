import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  cleaningHeaders,
  formSchema,
  inspectionPassed,
  validSignature,
} from "../src/lib/integrations/equipment-form";
test("signed form requests reject tampering, expired timestamps and malformed signatures", () => {
  const body = '{"example":"pencucian"}',
    secret = "private integration secret 32 chars",
    now = Date.now(),
    stamp = String(now);
  const signature = createHmac("sha256", secret)
    .update(stamp + "." + body)
    .digest("hex");
  assert.ok(validSignature(body, stamp, signature, secret, now));
  assert.equal(
    validSignature(body + " ", stamp, signature, secret, now),
    false,
  );
  assert.equal(
    validSignature(body, stamp, signature, secret, now + 300001),
    false,
  );
  assert.equal(validSignature(body, stamp, "bad", secret, now), false);
});
test("all six safety answers must match the explicitly configured approved values", () => {
  const fields = Object.fromEntries(cleaningHeaders.map((h) => [h, ""]));
  const config = JSON.stringify({
    rinse: ["Ya"],
    residue: ["Tidak"],
    condition: ["Baik"],
    dry: ["Ya"],
    outcome: ["Sesuai"],
    ready: ["Ya"],
  });
  for (const [i, v] of [
    [12, "Ya"],
    [13, "Tidak"],
    [14, "Baik"],
    [15, "Ya"],
    [16, "Sesuai"],
    [19, "Ya"],
  ] as const)
    fields[cleaningHeaders[i]] = v;
  fields[cleaningHeaders[9]] = "Ringan";
  fields[cleaningHeaders[10]] = "Pencucian Najis Ringan (Air)";
  assert.ok(inspectionPassed(fields, config));
  fields[cleaningHeaders[13]] = "Ya";
  assert.equal(inspectionPassed(fields, config), false);
  fields[cleaningHeaders[13]] = "Tidak";
  fields[cleaningHeaders[19]] = "Belum";
  assert.equal(inspectionPassed(fields, config), false);
  assert.equal(cleaningHeaders.length, 21);
  assert.ok(
    cleaningHeaders.includes(
      'Batch Number Produksi (Jika Bukan Produk Inbionusa, Tuliskan "-")',
    ),
  );
  assert.equal(formSchema.safeParse({ fields }).success, false);
});

test("actual Google Form answers permit only complete checks and the matching cleaning method", () => {
  const fields = Object.fromEntries(cleaningHeaders.map((h) => [h, ""]));
  Object.assign(fields, {
    [cleaningHeaders[9]]: "Sedang",
    [cleaningHeaders[10]]: "Pencucian Najis Sedang (Air + Sabun)",
    [cleaningHeaders[12]]: "Ya, sesuai prosedur",
    [cleaningHeaders[13]]: "Tidak ditemukan residu yang terlihat",
    [cleaningHeaders[14]]: "Bersih secara visual",
    [cleaningHeaders[15]]:
      "Sudah ditangani sesuai prosedur, tetapi belum disimpan",
    [cleaningHeaders[16]]: "Selesai dan memenuhi kriteria pemeriksaan",
    [cleaningHeaders[19]]: "Siap digunakan kembali",
  });
  assert.equal(inspectionPassed(fields), true);
  fields[cleaningHeaders[12]] = "Tidak berlaku sesuai SOP";
  assert.equal(inspectionPassed(fields), false);
  fields[cleaningHeaders[12]] = "Ya, sesuai prosedur";
  fields[cleaningHeaders[10]] = "Pencucian Najis Ringan (Air)";
  assert.equal(inspectionPassed(fields), false);
});

test("legacy queued payloads retain their batch mapping while the latest header follows form order", () => {
  const fields = Object.fromEntries(cleaningHeaders.map((h) => [h, "test"]));
  delete fields[cleaningHeaders[5]];
  fields["Nomor Batch"] = "200.01.27102026.27";
  const value = formSchema.parse({
    event_id: "12345678-1234-4234-8234-123456789abc",
    source_id: "source",
    started_at: "2026-10-27T01:00:00Z",
    finished_at: "2026-10-27T02:00:00Z",
    fields,
  });
  assert.equal(value.fields[cleaningHeaders[5]], fields["Nomor Batch"]);
  assert.equal(cleaningHeaders[6], "Nama Petugas");
});
