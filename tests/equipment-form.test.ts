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
    [11, "Ya"],
    [12, "Tidak"],
    [13, "Baik"],
    [14, "Ya"],
    [15, "Sesuai"],
    [18, "Ya"],
  ] as const)
    fields[cleaningHeaders[i]] = v;
  fields[cleaningHeaders[8]] = "Ringan";
  fields[cleaningHeaders[9]] = "Pencucian Najis Ringan (Air)";
  assert.ok(inspectionPassed(fields, config));
  fields[cleaningHeaders[12]] = "Ya";
  assert.equal(inspectionPassed(fields, config), false);
  fields[cleaningHeaders[12]] = "Tidak";
  fields[cleaningHeaders[18]] = "Belum";
  assert.equal(inspectionPassed(fields, config), false);
  assert.equal(cleaningHeaders.length, 21);
  assert.ok(cleaningHeaders.includes("Nomor Batch"));
  assert.equal(formSchema.safeParse({ fields }).success, false);
});

test("actual Google Form answers permit only complete checks and the matching cleaning method", () => {
  const fields = Object.fromEntries(cleaningHeaders.map((h) => [h, ""]));
  Object.assign(fields, {
    [cleaningHeaders[8]]: "Sedang",
    [cleaningHeaders[9]]: "Pencucian Najis Sedang (Air + Sabun)",
    [cleaningHeaders[11]]: "Ya, sesuai prosedur",
    [cleaningHeaders[12]]: "Tidak ditemukan residu yang terlihat",
    [cleaningHeaders[13]]: "Bersih secara visual",
    [cleaningHeaders[14]]:
      "Sudah ditangani sesuai prosedur, tetapi belum disimpan",
    [cleaningHeaders[15]]: "Selesai dan memenuhi kriteria pemeriksaan",
    [cleaningHeaders[18]]: "Siap digunakan kembali",
  });
  assert.equal(inspectionPassed(fields), true);
  fields[cleaningHeaders[11]] = "Tidak berlaku sesuai SOP";
  assert.equal(inspectionPassed(fields), false);
  fields[cleaningHeaders[11]] = "Ya, sesuai prosedur";
  fields[cleaningHeaders[9]] = "Pencucian Najis Ringan (Air)";
  assert.equal(inspectionPassed(fields), false);
});
