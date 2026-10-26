import { before, after, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const db = new Client({
  connectionString:
    "postgres://postgres:local-test-only@127.0.0.1:55432/postgres",
});
const password = "BOM-only private password 2026";
before(async () => {
  await db.connect();
  const sql = await readFile(
    new URL(
      "../src/lib/db/migrations/028_confidential_bom.sql",
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
async function user() {
  const id = await insert(
    "insert into users(username,password_hash,role,nama_lengkap) values($1,'test','administrator inbionusa','BOM security test')",
    [randomUUID()],
  );
  const token = randomUUID();
  await db.query(
    "insert into sessions(user_id,token,expires_at) values($1,$2,now()+interval '1 hour')",
    [id, token],
  );
  return { id, token };
}
async function rpc(
  token: string,
  action: string,
  formula: string,
  secret: string | null = null,
  target: string | null = null,
  reason = "",
) {
  return (
    await db.query("select erp_bom_security($1,$2,$3,$4,$5,$6) data", [
      token,
      action,
      formula,
      secret,
      target,
      reason,
    ])
  ).rows[0].data;
}
async function read(
  token: string,
  entity: string,
  query: Record<string, unknown> = {},
) {
  return (
    await db.query("select erp_work_read($1,$2,$3) data", [
      token,
      entity,
      query,
    ])
  ).rows[0].data;
}
async function mutate(
  token: string,
  action: string,
  p: Record<string, unknown>,
) {
  return (
    await db.query("select erp_work_mutate($1,$2,$3) data", [
      token,
      action,
      { request_key: randomUUID(), ...p },
    ])
  ).rows[0].data;
}
async function denied(
  fn: () => Promise<unknown>,
  pattern: RegExp = /locked|permission|privilege/i,
) {
  await db.query("savepoint expected_failure");
  try {
    await assert.rejects(fn, pattern);
  } finally {
    await db.query("rollback to savepoint expected_failure");
    await db.query("release savepoint expected_failure");
  }
}
async function fixture() {
  await db.query(
    "update erp_modules set state='active';update erp_operating_policy set dual_approval=false,locked_through=null,backdate_days=365",
  );
  const owner = await user(),
    other = await user();
  const code = randomUUID().slice(0, 8);
  const unit = await insert(
    "insert into erp_units(code,name) values($1,'kg')",
    [code],
  );
  const product = await insert(
    "insert into master_produk(kode_produk,nama_produk,kategori,satuan,status_halal,tipe_kemasan) values($1,'BOM product','Chemical','kg','Halal','Bag')",
    [code],
  );
  await db.query(
    "insert into erp_product_units(product_id,unit_id,factor,is_base) values($1,$2,1,true)",
    [product, unit],
  );
  const material = await insert(
    "insert into erp_materials(code,name,unit_id) values($1,'CONFIDENTIAL-INGREDIENT',$2)",
    [code, unit],
  );
  const warehouse = await insert(
    "insert into erp_warehouses(code,name) values($1,'Test warehouse')",
    [code],
  );
  const location = await insert(
    "insert into erp_locations(code,name,warehouse_id) values($1,'Test bin',$2)",
    [code, warehouse],
  );
  const today = (await db.query("select erp_today()::text d")).rows[0].d;
  const payload = {
    request_key: randomUUID(),
    product_id: product,
    title: "Protected BOM",
    unit_id: unit,
    output_quantity: "100",
    effective_date: today,
    notes: "CONFIDENTIAL-NOTES",
    lines: [
      {
        material_id: material,
        quantity: "17.25",
        role: "ingredient",
        tolerance_percent: "0",
      },
    ],
  };
  const created = (
    await db.query("select erp_bom_create($1,$2,$3) data", [
      owner.token,
      payload,
      password,
    ])
  ).rows[0].data;
  return {
    owner,
    other,
    unit,
    product,
    material,
    location,
    today,
    payload,
    formula: created.id as string,
  };
}
async function order(f: Awaited<ReturnType<typeof fixture>>) {
  await mutate(f.owner.token, "approve_formula", {
    id: f.formula,
    version: 1,
    reason: "Formula approved for controlled test",
  });
  const mo = await mutate(f.owner.token, "create_manufacturing_order", {
    formula_id: f.formula,
    target_quantity: "100",
    planned_date: f.today,
    location_id: f.location,
    notes: "Private production context",
  });
  return mo.id as string;
}
test("BOM creation requires a separate strong password; no plaintext secret enters replay/audit records", async () => {
  const f = await fixture();
  await denied(
    () =>
      mutate(f.owner.token, "save_formula", {
        ...f.payload,
        request_key: randomUUID(),
      }),
    /Set a BOM password/,
  );
  await denied(
    () =>
      db.query("select erp_bom_create($1,$2,'short')", [
        f.owner.token,
        { ...f.payload, request_key: randomUUID() },
      ]),
    /at least 16/,
  );
  const state = await rpc(f.owner.token, "status", f.formula);
  assert.equal(state.owner, true);
  assert.equal(state.unlocked, true);
  const rows = (await read(f.owner.token, "formulas", { id: f.formula })).rows;
  assert.equal(rows[0].lines[0].quantity, "17.25");
  const logged = (
    await db.query(
      "select payload::text from erp_work_requests where request_key=$1",
      [f.payload.request_key],
    )
  ).rows[0].payload;
  assert.ok(!logged.includes(password));
  const hash = (
    await db.query(
      "select password_hash from erp_bom_security where root_id=$1",
      [state.root_id],
    )
  ).rows[0].password_hash;
  assert.match(hash, /^\$2[aby]\$/);
  assert.notEqual(hash, password);
  assert.ok(!JSON.stringify(state).includes(hash));
  const events = (
    await db.query(
      "select jsonb_agg(to_jsonb(a))::text data from audit_log a where referensi=$1",
      [state.root_id],
    )
  ).rows[0].data;
  assert.ok(!events.includes(password));
});
test("an uninvited administrator cannot read composition, unlock with the right password, or mutate a formula", async () => {
  const f = await fixture();
  const result = (await read(f.other.token, "formulas", { id: f.formula }))
    .rows[0];
  assert.equal(result.bom_allowed, false);
  assert.equal(result.bom_unlocked, false);
  assert.equal(result.lines, undefined);
  assert.equal(result.notes, undefined);
  assert.ok(!JSON.stringify(result).includes("CONFIDENTIAL-INGREDIENT"));
  await denied(() => rpc(f.other.token, "unlock", f.formula, password));
  await denied(() =>
    mutate(f.other.token, "approve_formula", {
      id: f.formula,
      version: 1,
      reason: "Try bypass",
    }),
  );
  await denied(() =>
    mutate(f.other.token, "save_formula", {
      ...f.payload,
      id: f.formula,
      version: 1,
    }),
  );
});
test("a grant alone does not unlock; grants and unlocks are scoped to the exact login session", async () => {
  const f = await fixture();
  await rpc(f.owner.token, "grant", f.formula, null, f.other.id);
  assert.equal((await rpc(f.other.token, "status", f.formula)).unlocked, false);
  assert.equal(
    (await rpc(f.other.token, "unlock", f.formula, "wrong password")).error,
    "Incorrect BOM password.",
  );
  assert.equal(
    (await rpc(f.other.token, "unlock", f.formula, password)).unlocked,
    true,
  );
  const token = randomUUID();
  await db.query(
    "insert into sessions(user_id,token,expires_at) values($1,$2,now()+interval '1 hour')",
    [f.other.id, token],
  );
  assert.equal((await rpc(token, "status", f.formula)).unlocked, false);
  assert.ok(
    (await read(f.other.token, "formulas", { id: f.formula })).rows[0].lines,
  );
  assert.equal(
    (await read(token, "formulas", { id: f.formula })).rows[0].lines,
    undefined,
  );
});
test("revocation removes access immediately; a grantee cannot grant access or change the password", async () => {
  const f = await fixture();
  await rpc(f.owner.token, "grant", f.formula, null, f.other.id);
  await rpc(f.other.token, "unlock", f.formula, password);
  await denied(() => rpc(f.other.token, "grant", f.formula, null, f.owner.id));
  await denied(() =>
    rpc(f.other.token, "rotate", f.formula, "Another long secret password"),
  );
  await rpc(f.owner.token, "revoke", f.formula, null, f.other.id);
  assert.equal(
    (await read(f.other.token, "formulas", { id: f.formula })).rows[0].lines,
    undefined,
  );
  await denied(() => rpc(f.other.token, "unlock", f.formula, password));
});
test("expired sessions, expired unlocks and disabled users cannot reuse protected access", async () => {
  const f = await fixture();
  await db.query(
    "update erp_bom_unlocks set expires_at=now()-interval '1 second' where session_token=$1",
    [f.owner.token],
  );
  assert.equal(
    (await read(f.owner.token, "formulas", { id: f.formula })).rows[0].lines,
    undefined,
  );
  await denied(() =>
    mutate(f.owner.token, "approve_formula", {
      id: f.formula,
      version: 1,
      reason: "Expired access",
    }),
  );
  await rpc(f.owner.token, "unlock", f.formula, password);
  await db.query("update users set is_active=false where id=$1", [f.owner.id]);
  await denied(
    () => rpc(f.owner.token, "status", f.formula),
    /Session expired/,
  );
});
test("BOM password attempts are limited per user/family, including across login sessions", async () => {
  const f = await fixture();
  await rpc(f.owner.token, "lock", f.formula);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await rpc(f.owner.token, "unlock", f.formula, "wrong")).status,
      422,
    );
  assert.equal(
    (await rpc(f.owner.token, "unlock", f.formula, password)).status,
    429,
  );
  const token = randomUUID();
  await db.query(
    "insert into sessions(user_id,token,expires_at) values($1,$2,now()+interval '1 hour')",
    [f.owner.id, token],
  );
  assert.equal((await rpc(token, "unlock", f.formula, password)).status, 429);
  await db.query(
    "update erp_bom_attempts set reset_at=now()-interval '1 second'",
  );
  assert.equal(
    (await rpc(token, "unlock", f.formula, password)).unlocked,
    true,
  );
});
test("rotation invalidates all other unlocks; administrator recovery reveals no secret and requires the owner to initialize", async () => {
  const f = await fixture();
  await rpc(f.owner.token, "grant", f.formula, null, f.other.id);
  await rpc(f.other.token, "unlock", f.formula, password);
  const changed = "Replacement secret for private BOM";
  await rpc(f.owner.token, "rotate", f.formula, changed);
  assert.equal((await rpc(f.other.token, "status", f.formula)).unlocked, false);
  assert.equal(
    (await rpc(f.other.token, "unlock", f.formula, password)).status,
    422,
  );
  await rpc(
    f.other.token,
    "recover",
    f.formula,
    null,
    null,
    "Owner requested recovery",
  );
  assert.equal(
    (await rpc(f.other.token, "status", f.formula)).initialized,
    false,
  );
  await denied(() => rpc(f.other.token, "setup", f.formula, changed));
  assert.equal(
    (await rpc(f.owner.token, "setup", f.formula, password)).unlocked,
    true,
  );
});
test("production snapshots, history, filters and batch PDFs do not expose a locked BOM", async () => {
  const f = await fixture();
  const mo = await order(f);
  const clear = (await read(f.owner.token, "manufacturing_orders", { id: mo }))
    .rows[0];
  assert.ok(clear.formula_snapshot.requirements.length);
  const locked = (await read(f.other.token, "manufacturing_orders", { id: mo }))
    .rows[0];
  for (const key of [
    "formula_snapshot",
    "material_usage",
    "reservations",
    "inputs",
    "notes",
    "deviations",
  ])
    assert.equal(locked[key], undefined, key);
  const history = await read(f.other.token, "history", {
    id: mo,
    source: "manufacturing_orders",
  });
  assert.ok(!JSON.stringify(history).includes("CONFIDENTIAL-INGREDIENT"));
  await denied(() =>
    db.query("select erp_work_document($1,'manufacturing_orders',$2)", [
      f.other.token,
      mo,
    ]),
  );
  const filtered = await read(f.other.token, "formulas", {
    grid: {
      filters: [
        { field: "notes", op: "contains", value: "CONFIDENTIAL", type: "text" },
      ],
    },
  });
  assert.equal(filtered.total, 0);
  await denied(() =>
    mutate(f.other.token, "create_manufacturing_order", {
      formula_id: f.formula,
      target_quantity: "100",
      planned_date: f.today,
      location_id: f.location,
    }),
  );
});
test("formula revisions inherit owner, password, grants and revocation from the revision family", async () => {
  const f = await fixture();
  await mutate(f.owner.token, "approve_formula", {
    id: f.formula,
    version: 1,
    reason: "Test approval",
  });
  await rpc(f.owner.token, "grant", f.formula, null, f.other.id);
  await rpc(f.other.token, "unlock", f.formula, password);
  const revised = await mutate(f.other.token, "revise_formula", {
    id: f.formula,
    version: 2,
    reason: "New controlled revision",
  });
  assert.equal((await rpc(f.other.token, "status", revised.id)).owner, false);
  assert.equal((await rpc(f.other.token, "status", revised.id)).unlocked, true);
  await rpc(f.owner.token, "revoke", f.formula, null, f.other.id);
  assert.equal(
    (await read(f.other.token, "formulas", { id: revised.id })).rows[0].lines,
    undefined,
  );
});
test("production-linked material ledger, genealogy and global audit details respect BOM confidentiality", async () => {
  const f = await fixture();
  const mo = await order(f);
  const supplier = await insert(
    "insert into erp_suppliers(name) values('BOM test supplier')",
  );
  const lot = await insert(
    "insert into erp_material_lots(material_id,number,supplier_id,expiry_date) values($1,$2,$3,erp_today()+365)",
    [f.material, randomUUID(), supplier],
  );
  const tx = await insert(
    "insert into erp_material_transactions(request_key,number,kind,date,reason,created_by) values($1,$2,'issue',erp_today(),'Private consumption',$3)",
    [randomUUID(), randomUUID(), f.owner.id],
  );
  const ledgerId = await insert(
    "insert into erp_material_ledger(transaction_id,lot_id,location_id,delta) values($1,$2,$3,-17.25)",
    [tx, lot, f.location],
  );
  await db.query(
    "insert into erp_manufacturing_inputs(manufacturing_order_id,transaction_id,lot_id,location_id,quantity,kind,measured_by,reason) values($1,$2,$3,$4,17.25,'consume',$5,'Weighed use')",
    [mo, tx, lot, f.location, f.owner.id],
  );
  const data = (
    await db.query(
      "select erp_table_read($1,'material_ledger','{}','','',1,$2) data",
      [f.other.token, ledgerId],
    )
  ).rows[0].data;
  assert.equal(data.rows.length, 0);
  const visible = (
    await db.query(
      "select erp_table_read($1,'material_ledger','{}','','',1,$2) data",
      [f.owner.token, String(ledgerId)],
    )
  ).rows[0].data;
  assert.equal(
    visible.rows.length,
    1,
    "an unlocked owner can read the actual ledger row",
  );
  const listed = (
    await db.query(
      "select erp_table_read($1,'material_ledger','{}',$2,'',1,null) data",
      [f.other.token, tx],
    )
  ).rows[0].data;
  assert.equal(
    listed.total,
    0,
    "filtering and totals cannot reveal protected consumption",
  );
  const genealogy = await read(f.other.token, "genealogy", { id: lot });
  assert.ok(!JSON.stringify(genealogy).includes("CONFIDENTIAL-INGREDIENT"));
  const audit = await insert(
    "insert into audit_log(user_name,aksi,referensi,after_data) select 'Test','insert_erp_manufacturing_orders',id::text,to_jsonb(m) from erp_manufacturing_orders m where id=$1",
    [mo],
  );
  const hidden = (
    await db.query("select erp_bom_audit($1,$2) data", [f.other.token, audit])
  ).rows[0].data;
  assert.equal(hidden.after_data.confidential, true);
});
test("private helpers and tables cannot be read through the service role or anonymous REST paths", async () => {
  await db.query("savepoint role_test");
  try {
    await db.query("set local role service_role");
    await assert.rejects(
      db.query("select * from erp_bom_security"),
      /permission denied/,
    );
  } finally {
    await db.query("rollback to savepoint role_test");
  }
  for (const role of ["service_role", "anon", "authenticated"]) {
    await db.query("savepoint helper_test");
    try {
      await db.query("set local role " + role);
      await assert.rejects(
        db.query("select * from bom_records_base(null,'formulas')"),
        /permission denied/,
      );
    } finally {
      await db.query("rollback to savepoint helper_test");
    }
  }
});

test("replaying creation returns identity without unlocking or bypassing password attempt limits", async () => {
  const f = await fixture();
  await rpc(f.owner.token, "lock", f.formula);
  const replay = (
    await db.query("select erp_bom_create($1,$2,$3) data", [
      f.owner.token,
      f.payload,
      "Wrong but long replacement password",
    ])
  ).rows[0].data;
  assert.equal(replay.id, f.formula);
  assert.equal((await rpc(f.owner.token, "status", f.formula)).unlocked, false);
  const same = (
    await db.query(
      "select count(*)::int n from erp_formulas where root_id=(select root_id from erp_formulas where id=$1)",
      [f.formula],
    )
  ).rows[0].n;
  assert.equal(same, 1);
});

test("a frozen closed-batch snapshot is still protected by the current BOM grant and password", async () => {
  const f = await fixture();
  const mo = await order(f);
  await db.query(
    "update erp_manufacturing_orders set state='closed' where id=$1",
    [mo],
  );
  const frozen = (
    await db.query(
      "select batch_snapshot from erp_manufacturing_orders where id=$1",
      [mo],
    )
  ).rows[0].batch_snapshot;
  assert.ok(frozen.formula_snapshot.requirements.length);
  await denied(() =>
    db.query("select erp_work_document($1,'manufacturing_orders',$2)", [
      f.other.token,
      mo,
    ]),
  );
  const allowed = (
    await db.query(
      "select erp_work_document($1,'manufacturing_orders',$2) data",
      [f.owner.token, mo],
    )
  ).rows[0].data;
  assert.equal(
    allowed.formula_snapshot.requirements[0].material,
    "CONFIDENTIAL-INGREDIENT",
  );
  await rpc(f.owner.token, "lock", f.formula);
  await denied(() =>
    db.query("select erp_work_document($1,'manufacturing_orders',$2)", [
      f.owner.token,
      mo,
    ]),
  );
});
test("logging out cascades away BOM unlocks without affecting the formula or its grants", async () => {
  const f = await fixture();
  await rpc(f.owner.token, "grant", f.formula, null, f.other.id);
  await db.query("delete from sessions where token=$1", [f.owner.token]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from erp_bom_unlocks where session_token=$1",
        [f.owner.token],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query("select count(*)::int n from erp_formulas where id=$1", [
        f.formula,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from erp_bom_grants where user_id=$1",
        [f.other.id],
      )
    ).rows[0].n,
    1,
  );
  await denied(
    () => rpc(f.owner.token, "status", f.formula),
    /Session expired/,
  );
});

test("disabling Production also blocks recipe access through the global audit endpoint", async () => {
  const f = await fixture();
  const audit = await insert(
    "insert into audit_log(user_name,aksi,referensi,after_data) select 'Test','insert_erp_formulas',id::text,to_jsonb(f) from erp_formulas f where id=$1",
    [f.formula],
  );
  await db.query(
    "update erp_modules set state='disabled' where key='production'",
  );
  const data = (
    await db.query("select erp_bom_audit($1,$2) data", [f.owner.token, audit])
  ).rows[0].data;
  assert.equal(data.after_data.confidential, true);
});

test("Quality users cannot write or read a BOM-linked investigation without the same BOM unlock", async () => {
  const f = await fixture();
  const mo = await order(f);
  const payload = {
    manufacturing_order_id: mo,
    title: "Controlled deviation",
    description: "Recipe context remains private",
    due_date: f.today,
    investigation: "CONFIDENTIAL-INGREDIENT",
    disposition: "Review controlled formula",
  };
  await denied(() => mutate(f.other.token, "save_deviation", payload));
  const deviation = await mutate(f.owner.token, "save_deviation", payload);
  const locked = (await read(f.other.token, "deviations", { id: deviation.id }))
    .rows[0];
  assert.equal(locked.bom_unlocked, false);
  assert.equal(locked.investigation, undefined);
  assert.equal(locked.description, undefined);
  const visible = (
    await read(f.owner.token, "deviations", { id: deviation.id })
  ).rows;
  assert.equal(visible.length, 1);
  await denied(() =>
    mutate(f.other.token, "save_deviation", {
      ...payload,
      id: deviation.id,
      version: 1,
    }),
  );
});

test("a linked CAPA is password protected in its detail and history", async () => {
  const f = await fixture();
  const mo = await order(f);
  const deviation = await mutate(f.owner.token, "save_deviation", {
    manufacturing_order_id: mo,
    title: "Private deviation",
    description: "Protected investigation",
    due_date: f.today,
  });
  const data = {
    deviation_id: deviation.id,
    title: "Private CAPA",
    kind: "corrective",
    action: "CONFIDENTIAL-INGREDIENT adjustment",
    assignee: f.owner.id,
    due_date: f.today,
    evidence: "Private evidence",
  };
  await denied(() => mutate(f.other.token, "save_capa", data));
  const capa = await mutate(f.owner.token, "save_capa", data);
  const locked = (await read(f.other.token, "capas", { id: capa.id })).rows[0];
  assert.equal(locked.action, undefined);
  assert.equal(locked.evidence, undefined);
  assert.equal(locked.bom_unlocked, false);
  const history = await read(f.other.token, "history", {
    id: capa.id,
    source: "capas",
  });
  assert.ok(!JSON.stringify(history).includes("CONFIDENTIAL-INGREDIENT"));
  const visible = (await read(f.owner.token, "capas", { id: capa.id })).rows[0];
  assert.equal(visible.action, data.action);
});
