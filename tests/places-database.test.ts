import { before, after, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
const db = new Client({
  connectionString:
    "postgres://postgres:local-test-only@127.0.0.1:55432/postgres",
});
before(async () => {
  await db.connect();
  const dir = new URL("../src/lib/db/migrations/", import.meta.url);
  for (const file of (await readdir(dir))
    .filter((f) => /^0(3[0-7])_.*\.sql$/.test(f))
    .sort())
    await db.query(await readFile(new URL(file, dir), "utf8"));
  await db.query(await readFile(new URL("037_sites_rooms.sql", dir), "utf8"));
});
after(() => db.end());
beforeEach(() => db.query("begin"));
afterEach(() => db.query("rollback"));
async function fixture(role = "administrator inbionusa") {
  const actor = (
    await db.query(
      "insert into users(username,password_hash,role,nama_lengkap) values($1,'test',$2,'Places test') returning id",
      [randomUUID(), role],
    )
  ).rows[0].id;
  const token = randomUUID();
  await db.query(
    "insert into sessions(user_id,token,expires_at) values($1,$2,now()+interval '1 hour')",
    [actor, token],
  );
  return { actor, token };
}
async function save(token: string, action: string, p: Record<string, unknown>) {
  return (
    await db.query("select erp_places_admin($1,$2,$3) r", [
      token,
      action,
      { request_key: randomUUID(), active: true, ...p },
    ])
  ).rows[0].r;
}
async function list(token: string) {
  return (await db.query("select erp_places_admin($1,'list') r", [token]))
    .rows[0].r;
}
async function create(token: string) {
  const name = "KBI " + randomUUID().slice(0, 8);
  const site = await save(token, "save_warehouse", { name });
  const room = await save(token, "save_warehouse_location", {
    warehouse_id: site.id,
    room_name: "Lab",
    room_kind: "laboratory",
  });
  return { name, site, room };
}
test("sites and typed rooms require names only, keep unique identity and work with Warehouse disabled", async () => {
  const f = await fixture();
  await db.query(
    "update erp_modules set state='disabled' where key='warehouse'",
  );
  const { name, site, room } = await create(f.token);
  const data = await list(f.token);
  const lab = data.rooms.find((r: { id: string }) => r.id === room.id);
  assert.equal(lab.name, name + "/Lab");
  assert.equal(lab.room_kind, "laboratory");
  assert.equal(lab.warehouse_id, site.id);
  assert.equal(
    (
      await db.query(
        "select code is not null generated from erp_locations where id=$1",
        [room.id],
      )
    ).rows[0].generated,
    true,
  );
  await db.query("savepoint duplicate_room");
  await assert.rejects(
    save(f.token, "save_warehouse_location", {
      warehouse_id: site.id,
      room_name: " lab ",
      room_kind: "warehouse",
    }),
    /duplicate key/,
  );
  await db.query("rollback to savepoint duplicate_room");
  const other = await create(f.token);
  assert.notEqual(other.room.id, room.id);
});
test("site and room renames retain equipment, stock foreign keys and reject stale edits", async () => {
  const f = await fixture(),
    { site, room } = await create(f.token);
  const asset = (
    await db.query(
      "insert into erp_equipment(code,name,location_id) values($1,'Mixer',$2) returning id",
      [randomUUID(), room.id],
    )
  ).rows[0].id;
  const product = (
    await db.query(
      "insert into master_produk(kode_produk,nama_produk,kategori,satuan,tipe_kemasan) values($1,'INDOSTER 01','Chemical','kg','Bag') returning id",
      [randomUUID()],
    )
  ).rows[0].id;
  const lot = (
    await db.query(
      "insert into erp_lots(product_id,number) values($1,$2) returning id",
      [product, randomUUID()],
    )
  ).rows[0].id;
  await db.query(
    "insert into erp_balances(lot_id,location_id,quantity) values($1,$2,12.5)",
    [lot, room.id],
  );
  await save(f.token, "save_warehouse", {
    id: site.id,
    version: 1,
    name: "KBI renamed " + site.id.slice(0, 6),
  });
  const current = (
    await db.query("select * from erp_locations where id=$1", [room.id])
  ).rows[0];
  await save(f.token, "save_warehouse_location", {
    id: room.id,
    version: current.version,
    warehouse_id: site.id,
    room_name: "Lab QC",
    room_kind: "laboratory",
  });
  const updated = (
    await db.query("select * from erp_locations where id=$1", [room.id])
  ).rows[0];
  assert.ok(updated.name.endsWith("/Lab QC"));
  assert.equal(
    (
      await db.query("select location_id from erp_equipment where id=$1", [
        asset,
      ])
    ).rows[0].location_id,
    room.id,
  );
  assert.equal(
    Number(
      (
        await db.query(
          "select quantity from erp_balances where lot_id=$1 and location_id=$2",
          [lot, room.id],
        )
      ).rows[0].quantity,
    ),
    12.5,
  );
  await db.query("savepoint stale_room");
  await assert.rejects(
    save(f.token, "save_warehouse_location", {
      id: room.id,
      version: current.version,
      warehouse_id: site.id,
      room_name: "Old",
      room_kind: "warehouse",
    }),
    /berubah/,
  );
  await db.query("rollback to savepoint stale_room");
});
test("active rooms without equipment appear in public cleaning forms; inactive rooms are excluded", async () => {
  const f = await fixture(),
    { site, room, name } = await create(f.token);
  await db.query(
    "update erp_modules set state='active' where key='production'",
  );
  const { cleaningTemplate } =
    await import("../src/lib/forms/cleaning-template");
  const form = (
    await db.query("select erp_forms_admin($1,'create',null,$2) r", [
      f.token,
      cleaningTemplate,
    ])
  ).rows[0].r;
  await db.query("select erp_forms_admin($1,'publish',$2,null,1)", [
    f.token,
    form.id,
  ]);
  const link = (
    await db.query("select public_token from erp_forms where id=$1", [form.id])
  ).rows[0].public_token;
  const first = (await db.query("select erp_form_public($1) r", [link])).rows[0]
    .r;
  assert.ok(
    first.areas.some(
      (r: { id: string; name: string }) =>
        r.id === room.id && r.name === name + "/Lab",
    ),
  );
  assert.equal(
    first.equipment.some((r: { area: string }) => r.area === name + "/Lab"),
    false,
  );
  await save(f.token, "save_warehouse_location", {
    id: room.id,
    version: 1,
    warehouse_id: site.id,
    room_name: "Lab",
    room_kind: "laboratory",
    active: false,
  });
  assert.equal(
    (
      await db.query("select erp_form_public($1) r", [link])
    ).rows[0].r.areas.some((r: { id: string }) => r.id === room.id),
    false,
  );
});
test("busy rooms and their parent sites cannot be deactivated; nonadmins cannot manage places", async () => {
  const f = await fixture(),
    { site, room } = await create(f.token);
  await db.query(
    "insert into erp_equipment(code,name,location_id,state) values($1,'Mixer',$2,'cleaning')",
    [randomUUID(), room.id],
  );
  await db.query("savepoint busy_room");
  await assert.rejects(
    save(f.token, "save_warehouse_location", {
      id: room.id,
      version: 1,
      warehouse_id: site.id,
      room_name: "Lab",
      active: false,
    }),
    /kegiatan aktif/,
  );
  await db.query("rollback to savepoint busy_room");
  await db.query("savepoint busy_site");
  await assert.rejects(
    save(f.token, "save_warehouse", {
      id: site.id,
      version: 1,
      name: "Closed",
      active: false,
    }),
    /kegiatan aktif/,
  );
  await db.query("rollback to savepoint busy_site");
  const viewer = await fixture("viewer");
  await db.query("savepoint denied");
  await assert.rejects(list(viewer.token), /insufficient_privilege/);
  await db.query("rollback to savepoint denied");
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('service_role','places_save(uuid,text,jsonb)','execute') a",
      )
    ).rows[0].a,
    false,
  );
});
test("room references expose paths without internal codes and site access is retained", async () => {
  const f = await fixture(),
    { site, room, name } = await create(f.token);
  await db.query("update erp_modules set state='active'");
  const result = (
    await db.query("select erp_form_reference_rows($1,'locations',$2) r", [
      f.actor,
      name + "/Lab",
    ])
  ).rows[0].r;
  assert.deepEqual(result.items, [{ id: room.id, label: name + "/Lab" }]);
  const viewer = await fixture("production_operator");
  await db.query(
    "insert into erp_warehouse_scopes(user_id,restricted) values($1,true)",
    [viewer.actor],
  );
  assert.equal(
    (
      await db.query("select work_location_allowed($1,$2) a", [
        viewer.actor,
        room.id,
      ])
    ).rows[0].a,
    false,
  );
  await db.query(
    "insert into erp_warehouse_access(user_id,warehouse_id,can_read) values($1,$2,true)",
    [viewer.actor, site.id],
  );
  assert.equal(
    (
      await db.query("select work_location_allowed($1,$2) a", [
        viewer.actor,
        room.id,
      ])
    ).rows[0].a,
    true,
  );
});
