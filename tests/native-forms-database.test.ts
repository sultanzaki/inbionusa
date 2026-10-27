import { before, after, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
const db = new Client({
  connectionString:
    "postgres://postgres:local-test-only@127.0.0.1:55432/postgres",
});
before(async () => {
  await db.connect();
  for (const name of [
    "030_equipment_cleaning",
    "031_equipment_form_import",
    "032_equipment_form_batch_field",
    "033_native_forms",
  ]) {
    const sql = await readFile(
      new URL("../src/lib/db/migrations/" + name + ".sql", import.meta.url),
      "utf8",
    );
    await db.query(sql);
    if (name === "033_native_forms") await db.query(sql);
  }
});
after(() => db.end());
beforeEach(() => db.query("begin"));
afterEach(() => db.query("rollback"));
async function insert(sql: string, args: unknown[] = []) {
  return (await db.query(sql + " returning id", args)).rows[0].id as string;
}
async function fixture() {
  const owner = await insert(
    "insert into users(username,password_hash,role,nama_lengkap) values($1,'test','administrator inbionusa','Packaging test')",
    [randomUUID()],
  );
  const token = randomUUID();
  await db.query(
    "insert into sessions(user_id,token,expires_at) values($1,$2,now()+interval '1 hour')",
    [owner, token],
  );
  await db.query("update erp_modules set state='active'");
  const unit = await insert(
    "insert into erp_units(code,name) values($1,'kg')",
    [randomUUID().slice(0, 8)],
  );
  const wh = await insert(
    "insert into erp_warehouses(code,name) values($1,'Batch test')",
    [randomUUID().slice(0, 8)],
  );
  const location = await insert(
    "insert into erp_locations(code,name,warehouse_id) values($1,'Batch bin',$2)",
    [randomUUID().slice(0, 8), wh],
  );
  const product = await insert(
    "insert into master_produk(kode_produk,nama_produk,kategori,satuan,tipe_kemasan) values($1,'INDOSTER 01','Chemical','kg','Bulk bag')",
    [randomUUID()],
  );
  await db.query(
    "insert into erp_product_units(product_id,unit_id,factor,is_base) values($1,$2,1,true)",
    [product, unit],
  );
  const series = String(BigInt("0x" + randomUUID().replaceAll("-", ""))).slice(
    0,
    18,
  );
  await db.query(
    "insert into erp_product_series(product_id,series) values($1,$2)",
    [product, series],
  );
  return { token, product, unit, location, series };
}

async function admin(
  token: string,
  action: string,
  id: string | null = null,
  template: unknown = null,
  version: number | null = null,
) {
  return (
    await db.query("select erp_forms_admin($1,$2,$3,$4,$5) r", [
      token,
      action,
      id,
      template,
      version,
    ])
  ).rows[0].r;
}
test("published forms preserve answer versions, handle replay and stop accepting paused links", async () => {
  const f = await fixture(),
    template = {
      title: "Checklist",
      kind: "general",
      description: "",
      fields: [
        {
          id: "name",
          type: "text",
          label: "Name",
          required: true,
          options: [],
        },
      ],
    };
  const created = await admin(f.token, "create", null, template);
  let row = await admin(f.token, "detail", created.id);
  await admin(f.token, "publish", created.id, null, row.version);
  row = await admin(f.token, "detail", created.id);
  const key = randomUUID(),
    hash = "a".repeat(64);
  const submit = () =>
    db.query("select erp_form_submit($1,1,$2,$3,$4,'[]') r", [
      row.public_token,
      key,
      hash,
      { name: "Operator" },
    ]);
  assert.equal((await submit()).rows[0].r.duplicate, false);
  assert.equal((await submit()).rows[0].r.duplicate, true);
  await admin(
    f.token,
    "save",
    created.id,
    { ...template, title: "Draft changed" },
    row.version,
  );
  assert.equal(
    (await db.query("select erp_form_public($1) r", [row.public_token])).rows[0]
      .r.template.title,
    "Checklist",
  );
  row = await admin(f.token, "detail", created.id);
  await admin(f.token, "publish", created.id, null, row.version);
  row = await admin(f.token, "detail", created.id);
  await db.query("savepoint outdated");
  await assert.rejects(
    () =>
      db.query("select erp_form_submit($1,1,$2,$3,'{}','[]')", [
        row.public_token,
        randomUUID(),
        hash,
      ]),
    /updated/,
  );
  await db.query("rollback to savepoint outdated");
  assert.equal(row.submissions[0].template.title, "Checklist");
  await admin(f.token, "pause", created.id, null, row.version);
  await db.query("savepoint paused");
  await assert.rejects(() =>
    db.query("select erp_form_public($1)", [row.public_token]),
  );
  await db.query("rollback to savepoint paused");
  assert.equal(
    (
      await db.query(
        "select has_table_privilege('service_role','erp_form_submissions','select') a",
      )
    ).rows[0].a,
    false,
  );
  await db.query("savepoint anon");
  await db.query("set local role anon");
  await assert.rejects(() =>
    db.query("select erp_form_public($1)", [row.public_token]),
  );
  await db.query("rollback to savepoint anon");
});
test("native equipment and staff IDs disambiguate duplicate names", async () => {
  const f = await fixture();
  const actor = (
    await db.query("select user_id from sessions where token=$1", [f.token])
  ).rows[0].user_id;
  const name = randomUUID();
  await db.query("update users set nama_lengkap=$1 where id=$2", [name, actor]);
  await insert(
    "insert into users(username,password_hash,role,nama_lengkap) values($1,'test','administrator inbionusa',$2)",
    [randomUUID(), name],
  );
  const asset = await insert(
    "insert into erp_equipment(code,name,location_id) values($1,$2,$3)",
    [randomUUID(), name, f.location],
  );
  await insert(
    "insert into erp_equipment(code,name,location_id) values($1,$2,$3)",
    [randomUUID(), name, f.location],
  );
  const fields = {
    "Nama Alat": name,
    "Area Kerja": "Batch bin",
    "Nama Petugas": name,
    "Nama Pemeriksa/Penanggung Jawab Verifikasi": name,
    "Metode Pencucian (Sesuai SOP)": "Wash",
    "Kondisi Alat Setelah Pencucian": "Clean",
    'Batch Number Produksi (Jika Bukan Produk Inbionusa, Tuliskan "-")': "-",
    "Produk/Bahan/Sampel Terakhir Diproses Menggunakan Alat": "Solvent",
  };
  const payload = {
    event_id: randomUUID(),
    source_id: "native-test",
    fields,
    started_at: new Date(Date.now() - 120000).toISOString(),
    finished_at: new Date(Date.now() - 60000).toISOString(),
    equipment_id: asset,
    cleaned_by_id: actor,
    inspected_by_id: actor,
  };
  const result = (
    await db.query("select erp_import_equipment_cleaning($1,$2,true,$3) r", [
      actor,
      payload,
      "b".repeat(64),
    ])
  ).rows[0].r;
  assert.equal(result.result, "pass");
  assert.equal(
    (await db.query("select state from erp_equipment where id=$1", [asset]))
      .rows[0].state,
    "ready",
  );
});
