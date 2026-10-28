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
    "034_general_forms_references",
    "035_forms_delete",
    "036_forms_performance",
    "037_sites_rooms",
  ]) {
    const sql = await readFile(
      new URL("../src/lib/db/migrations/" + name + ".sql", import.meta.url),
      "utf8",
    );
    await db.query(sql);
    if (
      [
        "033_native_forms",
        "034_general_forms_references",
        "035_forms_delete",
        "036_forms_performance",
      ].includes(name)
    )
      await db.query(sql);
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

async function referenceFixture(source = "products") {
  const f = await fixture();
  const created = await admin(f.token, "create", null, {
    title: "Reference checklist",
    description: "",
    kind: "general",
    fields: [
      {
        id: "record",
        label: "ERP record",
        type: "reference",
        source,
        required: true,
        options: [],
      },
    ],
  });
  await admin(f.token, "publish", created.id, null, 1);
  const form = await admin(f.token, "detail", created.id);
  return { ...f, form };
}
test("every catalog source has a valid whitelisted identity projection", async () => {
  const { referenceSources } = await import("../src/lib/forms/references");
  const f = await referenceFixture();
  const owner = (
    await db.query("select owner_id from erp_forms where id=$1", [f.form.id])
  ).rows[0].owner_id;
  for (const source of referenceSources) {
    const result = (
      await db.query("select erp_form_reference_rows($1,$2) r", [
        owner,
        source.key,
      ])
    ).rows[0].r;
    assert.ok(Array.isArray(result.items), source.key);
    assert.ok(result.items.length <= 25, source.key);
    for (const row of result.items)
      assert.deepEqual(Object.keys(row).sort(), ["id", "label"]);
  }
});
test("general forms publish with Production disabled; only configured references are queryable", async () => {
  const f = await fixture();
  await db.query(
    "update erp_modules set state='disabled' where key='production'",
  );
  const created = await admin(f.token, "create", null, {
    title: "General",
    description: "",
    kind: "general",
    fields: [
      {
        id: "record",
        label: "Produk",
        type: "reference",
        source: "products",
        required: true,
        options: [],
      },
    ],
  });
  await admin(f.token, "publish", created.id, null, 1);
  const form = await admin(f.token, "detail", created.id);
  assert.equal(
    (await db.query("select erp_form_public($1) r", [form.public_token]))
      .rows[0].r.template.title,
    "General",
  );
  const page = (
    await db.query("select erp_form_references($1,'record',$2,0) r", [
      form.public_token,
      "INDOSTER",
    ])
  ).rows[0].r;
  assert.ok(page.items.some((p: { id: string }) => p.id === f.product));
  await db.query("savepoint invalid_reference");
  await assert.rejects(
    db.query("select erp_form_references($1,'users')", [form.public_token]),
    /insufficient_privilege/,
  );
  await db.query("rollback to savepoint invalid_reference");
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','erp_form_references(uuid,text,text,integer)','execute') a",
      )
    ).rows[0].a,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('service_role','erp_form_reference_rows(uuid,text,text,integer,uuid)','execute') a",
      )
    ).rows[0].a,
    false,
  );
});
test("reference submissions validate live IDs and retain labels and identities after master data rename", async () => {
  const f = await referenceFixture();
  const key = randomUUID();
  const submit = (id: string, request = key) =>
    db.query("select erp_form_submit($1,1,$2,$3,$4,'[]') r", [
      f.form.public_token,
      request,
      request,
      { record: id },
    ]);
  await db.query("savepoint bad_id");
  await assert.rejects(submit(randomUUID()), /no longer available/);
  await db.query("rollback to savepoint bad_id");
  const saved = (await submit(f.product)).rows[0].r;
  const row = (
    await db.query(
      "select answers,reference_data from erp_form_submissions where id=$1",
      [saved.id],
    )
  ).rows[0];
  assert.match(row.answers.record, /INDOSTER 01/);
  assert.equal(row.reference_data.record.id, f.product);
  assert.equal(row.reference_data.record.source, "products");
  await db.query("update master_produk set nama_produk='Renamed' where id=$1", [
    f.product,
  ]);
  assert.deepEqual(
    (
      await db.query(
        "select answers,reference_data from erp_form_submissions where id=$1",
        [saved.id],
      )
    ).rows[0],
    row,
  );
  assert.equal((await submit(f.product)).rows[0].r.duplicate, true);
});
test("public references honor module disablement and publisher deactivation", async () => {
  const f = await referenceFixture("equipment");
  await db.query(
    "update erp_modules set state='disabled' where key='production'",
  );
  await db.query("savepoint disabled_source");
  await assert.rejects(
    db.query("select erp_form_references($1,'record')", [f.form.public_token]),
    /Module unavailable/,
  );
  await db.query("rollback to savepoint disabled_source");
  await db.query(
    "update users set is_active=false where id=(select owner_id from erp_forms where id=$1)",
    [f.form.id],
  );
  await db.query("savepoint inactive_owner");
  await assert.rejects(
    db.query("select erp_form_public($1)", [f.form.public_token]),
    /insufficient_privilege/,
  );
  await db.query("rollback to savepoint inactive_owner");
});

test("reference search paginates deterministically and keeps published source isolated from draft edits", async () => {
  const f = await referenceFixture("products");
  const prefix = "REFPAGE-" + randomUUID();
  for (let i = 0; i < 31; i++)
    await db.query(
      "insert into master_produk(kode_produk,nama_produk,kategori,satuan,tipe_kemasan) values($1,$2,'Chemical','kg','Bag')",
      [randomUUID(), prefix + String(i).padStart(2, "0")],
    );
  const read = async (offset: number) =>
    (
      await db.query("select erp_form_references($1,'record',$2,$3) r", [
        f.form.public_token,
        prefix,
        offset,
      ])
    ).rows[0].r;
  const first = await read(0),
    second = await read(25);
  assert.equal(first.items.length, 25);
  assert.equal(first.has_more, true);
  assert.equal(second.items.length, 6);
  assert.equal(second.has_more, false);
  assert.equal(
    new Set([...first.items, ...second.items].map((r: { id: string }) => r.id))
      .size,
    31,
  );
  await admin(
    f.token,
    "save",
    f.form.id,
    {
      ...f.form.draft,
      fields: [{ ...f.form.draft.fields[0], source: "equipment" }],
    },
    f.form.version,
  );
  assert.deepEqual(await read(0), first);
});

test("deleting a published form revokes its link and administration access while preserving responses and files", async () => {
  const f = await referenceFixture();
  const request = randomUUID();
  const saved = (
    await db.query("select erp_form_submit($1,1,$2::uuid,$2::text,$3,$4) r", [
      f.form.public_token,
      request,
      { record: f.product },
      JSON.stringify([{ name: "evidence.pdf", path: "private/evidence.pdf" }]),
    ])
  ).rows[0].r;
  await admin(f.token, "delete", f.form.id, null, f.form.version);
  assert.equal(
    (await admin(f.token, "list")).some(
      (r: { id: string }) => r.id === f.form.id,
    ),
    false,
  );
  const stored = (
    await db.query(
      "select s.files,f.active,f.deleted_at from erp_form_submissions s join erp_forms f on f.id=s.form_id where s.id=$1",
      [saved.id],
    )
  ).rows[0];
  assert.equal(stored.active, false);
  assert.ok(stored.deleted_at);
  assert.equal(stored.files[0].name, "evidence.pdf");
  await db.query("savepoint deleted_link");
  await assert.rejects(
    db.query("select erp_form_public($1)", [f.form.public_token]),
    /no_data_found/,
  );
  await db.query("rollback to savepoint deleted_link");
  await db.query("savepoint deleted_detail");
  await assert.rejects(admin(f.token, "detail", f.form.id), /no_data_found/);
  await db.query("rollback to savepoint deleted_detail");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from erp_work_events where entity='forms' and record_id=$1 and action='delete'",
        [f.form.id],
      )
    ).rows[0].n,
    1,
  );
});
test("form deletion rejects stale versions and nonadministrators", async () => {
  const f = await referenceFixture();
  await db.query("savepoint stale_delete");
  await assert.rejects(admin(f.token, "delete", f.form.id, null, 1), /changed/);
  await db.query("rollback to savepoint stale_delete");
  await db.query(
    "update users set role='viewer' where id=(select owner_id from erp_forms where id=$1)",
    [f.form.id],
  );
  const viewerToken = randomUUID();
  await db.query(
    "insert into sessions(user_id,token,expires_at) select owner_id,$2,now()+interval '1 hour' from erp_forms where id=$1",
    [f.form.id, viewerToken],
  );
  await db.query("savepoint forbidden_delete");
  await assert.rejects(
    admin(viewerToken, "delete", f.form.id, null, f.form.version),
    /insufficient_privilege/,
  );
  await db.query("rollback to savepoint forbidden_delete");
  assert.equal(
    (await db.query("select active from erp_forms where id=$1", [f.form.id]))
      .rows[0].active,
    true,
  );
});

test("lean form guards never rebuild full public choices and retain private ACLs", async () => {
  const f = await referenceFixture();
  for (const name of [
    "erp_form_public_receipt",
    "erp_form_submit",
    "erp_form_references",
  ]) {
    const def = (
      await db.query(
        "select prosrc from pg_proc where pronamespace='public'::regnamespace and proname=$1",
        [name],
      )
    ).rows[0].prosrc as string;
    assert.ok(!def.includes("perform public.erp_form_public(p_link)"), name);
    assert.ok(def.includes("perform public.erp_form_guard(p_link)"), name);
  }
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('service_role','erp_form_guard(uuid)','execute') a",
      )
    ).rows[0].a,
    false,
  );
  const request = randomUUID();
  const prepared = (
    await db.query("select erp_form_prepare($1,$2,'test') r", [
      f.form.public_token,
      request,
    ])
  ).rows[0].r;
  assert.equal(prepared.form.template.title, "Reference checklist");
  await db.query("select erp_form_submit($1,1,$2,'test',$3,'[]')", [
    f.form.public_token,
    request,
    { record: f.product },
  ]);
  const replay = (
    await db.query("select erp_form_prepare($1,$2,'test') r", [
      f.form.public_token,
      request,
    ])
  ).rows[0].r;
  assert.equal(replay.receipt.duplicate, true);
  assert.equal(replay.form, undefined);
  const list = await admin(f.token, "list");
  const row = list.find((r: { id: string }) => r.id === f.form.id);
  assert.deepEqual(row.draft, { title: "Reference checklist" });
  assert.equal(row.published, undefined);
  await admin(f.token, "pause", f.form.id, null, f.form.version);
  await db.query("savepoint lean_paused");
  await assert.rejects(
    db.query("select erp_form_prepare($1,$2,'test')", [
      f.form.public_token,
      request,
    ]),
    /no_data_found/,
  );
  await db.query("rollback to savepoint lean_paused");
});
