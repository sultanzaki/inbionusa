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
  const sql = await readFile(
    new URL(
      "../src/lib/db/migrations/029_packaging_batch_year.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.query(sql);
  await db.query(sql);
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
async function rpc(token: string, action: string, payload: unknown) {
  return (
    await db.query("select erp_mutate($1,$2,$3) r", [token, action, payload])
  ).rows[0].r;
}
async function preview(f: Awaited<ReturnType<typeof fixture>>, date: string) {
  return (
    await db.query("select erp_batch_preview($1,$2,$3) r", [
      f.token,
      f.product,
      date,
    ])
  ).rows[0].r.rows[0];
}
async function post(f: Awaited<ReturnType<typeof fixture>>, date: string) {
  const draft = await rpc(f.token, "save_move", {
    kind: "production",
    date,
    to_location: f.location,
    reason: "Batch format test",
    lines: [
      { product_id: f.product, unit_id: f.unit, quantity: "1", mfg_date: date },
    ],
  });
  await rpc(f.token, "post_move", draft);
  return (
    await db.query(
      "select l.* from erp_lots l join erp_movements m on (m.lines->0->>'lot_id')::uuid=l.id where m.id=$1",
      [draft.id],
    )
  ).rows[0];
}
test("new production batch and preview use a two-digit expiry year while preserving full dates and annual counters", async () => {
  const f = await fixture();
  assert.equal(
    (await preview(f, "2026-10-21")).number,
    f.series + ".01.21102026.27",
  );
  const first = await post(f, "2026-10-21");
  assert.equal(first.number, f.series + ".01.21102026.27");
  assert.equal(first.batch_year, 2026);
  assert.equal(first.batch_number, 1);
  const date = (
    await db.query("select expiry_date::text e from erp_lots where id=$1", [
      first.id,
    ])
  ).rows[0].e;
  assert.equal(date, "2027-10-21");
  assert.equal(
    (await post(f, "2026-10-22")).number,
    f.series + ".02.22102026.27",
  );
  assert.equal(
    (await preview(f, "2027-01-01")).number,
    f.series + ".01.01012027.28",
  );
  const leap = await preview(f, "2028-02-29");
  assert.equal(leap.number, f.series + ".01.29022028.29");
  assert.equal(leap.expiry_date, "2029-02-28");
});
test("adopting mixed historical batch formats advances the counter without changing either identity", async () => {
  const f = await fixture();
  const old = f.series + ".07.01012026.2027",
    short = f.series + ".09.02012026.27";
  await db.query(
    "insert into erp_lots(product_id,number,mfg_date,expiry_date) values($1,$2,'2026-01-01','2027-01-01'),($1,$3,'2026-01-02','2027-01-02')",
    [f.product, old, short],
  );
  await db.query("select erp_seed_batch_counter($1,$2)", [f.product, f.series]);
  assert.equal(
    (await post(f, "2026-02-01")).number,
    f.series + ".10.01022026.27",
  );
  const historical = (
    await db.query(
      "select number from erp_lots where product_id=$1 and batch_number is null order by number",
      [f.product],
    )
  ).rows.map((r) => r.number);
  assert.deepEqual(historical, [old, short]);
});
test("packaging suggestions reuse distinct saved custom types and require an editor session", async () => {
  const f = await fixture(),
    name = "Custom liner " + randomUUID();
  await db.query("update master_produk set tipe_kemasan=$1 where id=$2", [
    name,
    f.product,
  ]);
  const options = (
    await db.query("select erp_packaging_options($1) r", [f.token])
  ).rows[0].r;
  assert.ok(options.includes(name));
  assert.equal(options.filter((s: string) => s === name).length, 1);
  await db.query("savepoint denied");
  await assert.rejects(
    () => db.query("select erp_packaging_options('invalid')"),
    { code: "42501" },
  );
  await db.query("rollback to savepoint denied");
  const viewer = await insert(
    "insert into users(username,password_hash,role,nama_lengkap) values($1,'test','viewer','Viewer')",
    [randomUUID()],
  );
  const vt = randomUUID();
  await db.query(
    "insert into sessions(user_id,token,expires_at) values($1,$2,now()+interval '1 hour')",
    [viewer, vt],
  );
  await db.query("savepoint denied");
  await assert.rejects(
    () => db.query("select erp_packaging_options($1)", [vt]),
    { code: "42501" },
  );
  await db.query("rollback to savepoint denied");
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','erp_packaging_options(text)','execute') a",
      )
    ).rows[0].a,
    false,
  );
});
