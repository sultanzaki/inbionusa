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
      "../src/lib/db/migrations/030_equipment_cleaning.sql",
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

test("equipment starts dirty and the same operator may clean and inspect it", async () => {
  const f = await fixture();
  const actor = (
    await db.query("select user_id from sessions where token=$1", [f.token])
  ).rows[0].user_id;
  async function command(action: string, p: Record<string, unknown>) {
    return (
      await db.query("select erp_work_mutate($1,$2,$3) r", [
        f.token,
        action,
        { request_key: randomUUID(), ...p },
      ])
    ).rows[0].r;
  }
  const r = await command("save_equipment", {
    code: randomUUID(),
    name: "Mixer",
    location_id: f.location,
  });
  assert.equal(
    (await db.query("select state from erp_equipment where id=$1", [r.id]))
      .rows[0].state,
    "dirty",
  );
  await command("start_equipment_cleaning", {
    id: r.id,
    version: 1,
    reason: "Initial cleaning",
  });
  await command("finish_equipment_cleaning", {
    id: r.id,
    version: 2,
    cleaned_by: actor,
    inspected_by: actor,
    method: "Wash and rinse",
    condition: "Clean and intact",
    result: "pass",
    reason: "Checked before use",
  });
  assert.equal(
    (await db.query("select state from erp_equipment where id=$1", [r.id]))
      .rows[0].state,
    "ready",
  );
  const records = (
    await db.query("select erp_work_read($1,'equipment',$2) r", [
      f.token,
      { id: r.id },
    ])
  ).rows[0].r;
  assert.equal(records.rows[0].cleaning.length, 1);
  await db.query("savepoint denied");
  await assert.rejects(() =>
    command("use_equipment", { id: r.id, version: 3, reason: "Missing batch" }),
  );
  await db.query("rollback to savepoint denied");
  assert.equal(
    (
      await db.query(
        "select has_table_privilege('service_role','erp_equipment','select') a",
      )
    ).rows[0].a,
    false,
  );
  const today = (await db.query("select erp_today()::text d")).rows[0].d;
  const draft = (
    await db.query("select erp_mutate($1,'save_move',$2) r", [
      f.token,
      {
        kind: "production",
        date: today,
        to_location: f.location,
        reason: "Equipment test",
        lines: [
          {
            product_id: f.product,
            unit_id: f.unit,
            quantity: "1",
            mfg_date: today,
          },
        ],
      },
    ])
  ).rows[0].r;
  await db.query("savepoint blocked");
  await assert.rejects(
    () => db.query("select erp_mutate($1,'post_move',$2)", [f.token, draft]),
    /equipment/,
  );
  await db.query("rollback to savepoint blocked");
  await command("use_equipment", {
    id: r.id,
    version: 3,
    movement_id: draft.id,
    reason: "Batch equipment",
  });
  await db.query("select erp_mutate($1,'post_move',$2)", [f.token, draft]);
  assert.equal(
    (await db.query("select state from erp_equipment where id=$1", [r.id]))
      .rows[0].state,
    "dirty",
  );
  await db.query("savepoint reuse");
  await assert.rejects(
    () =>
      command("use_equipment", {
        id: r.id,
        version: 5,
        movement_id: draft.id,
        reason: "Unsafe reuse",
      }),
    /clean/,
  );
  await db.query("rollback to savepoint reuse");
});
