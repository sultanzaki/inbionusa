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
  const integrationSql = await readFile(
    new URL(
      "../src/lib/db/migrations/031_equipment_form_import.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.query(integrationSql);
  await db.query(integrationSql);
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

test("form imports preserve answers, reject mismatches and replay without duplicating cleaning", async () => {
  const f = await fixture();
  const actor = (
    await db.query("select user_id from sessions where token=$1", [f.token])
  ).rows[0].user_id;
  await db.query("update users set nama_lengkap=$1 where id=$2", [
    actor,
    actor,
  ]);
  const code = randomUUID();
  const e = await insert(
    "insert into erp_equipment(code,name,location_id) values($1,$1,$2)",
    [code, f.location],
  );
  const fields = {
    "Nama Alat": code,
    "Area Kerja": "Batch bin",
    "Nama Petugas": actor,
    "Nama Pemeriksa/Penanggung Jawab Verifikasi": actor,
    "Metode Pencucian (Sesuai SOP)": "Wash",
    "Kondisi Alat Setelah Pencucian": "Intact",
    Notes: "Saved exactly",
    "Nomor Batch": "",
  };
  const now = (
    await db.query(
      "select (now()-interval '2 minutes')::text a,(now()-interval '1 minute')::text b",
    )
  ).rows[0];
  const payload = {
    source_id: "test-sheet",
    event_id: randomUUID(),
    fields,
    started_at: now.a,
    finished_at: now.b,
  };
  async function run(p = payload, hash = "a".repeat(64)) {
    return (
      await db.query("select erp_import_equipment_cleaning($1,$2,true,$3) r", [
        actor,
        p,
        hash,
      ])
    ).rows[0].r;
  }
  const imported = await run();
  assert.equal(imported.duplicate, false);
  assert.equal((await run()).duplicate, true);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from erp_equipment_cleaning where equipment_id=$1",
        [e],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select form_data from erp_equipment_cleaning where id=$1",
        [imported.id],
      )
    ).rows[0].form_data.Notes,
    "Saved exactly",
  );
  await db.query("savepoint rejected");
  await assert.rejects(
    () => run(payload, "b".repeat(64)),
    /different contents/,
  );
  await db.query("rollback to savepoint rejected");
  await db.query("savepoint stale");
  await assert.rejects(
    () => run({ ...payload, event_id: randomUUID() }),
    /newer cleaning/,
  );
  await db.query("rollback to savepoint stale");
  await db.query("savepoint denied");
  await db.query("set local role authenticated");
  await assert.rejects(() => run());
  await db.query("rollback to savepoint denied");
  const date = (await db.query("select erp_today()::text d")).rows[0].d;
  const movement = (
    await db.query("select erp_mutate($1,'save_move',$2) r", [
      f.token,
      {
        kind: "production",
        date,
        to_location: f.location,
        reason: "Integration batch",
        lines: [
          {
            product_id: f.product,
            unit_id: f.unit,
            quantity: "1",
            mfg_date: date,
          },
        ],
      },
    ])
  ).rows[0].r;
  const number = (
    await db.query("select number from erp_movements where id=$1", [
      movement.id,
    ])
  ).rows[0].number;
  await db.query(
    "insert into erp_equipment_uses(equipment_id,movement_id,operator_id,started_at,finished_at) values($1,$2,$3,now()-interval '10 minutes',now()-interval '5 minutes')",
    [e, movement.id, actor],
  );
  const next = {
    ...payload,
    event_id: randomUUID(),
    finished_at: (
      await db.query("select (now()-interval '30 seconds')::text t")
    ).rows[0].t,
    fields: { ...fields, "Nomor Batch": "WRONG" },
  };
  await db.query("savepoint batch");
  await assert.rejects(() => run(next), /does not match/);
  await db.query("rollback to savepoint batch");
  next.fields["Nomor Batch"] = number;
  assert.equal((await run(next)).result, "pass");
});
