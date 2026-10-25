import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import {
  workCollections,
  workCommands,
  workHref,
} from "../src/lib/operations/catalog";
import { commandPayload } from "../src/lib/operations/validation";
import { renderOperationDocument } from "../src/lib/operations/pdf";
test("every workspace command and route resolves; canonical numbers never accept localized transport", () => {
  for (const [entity, definition] of Object.entries(workCollections)) {
    assert.match(workHref(entity), /^\/dashboard\//, entity);
    for (const command of [
      definition.create,
      ...(definition.actions || []),
    ].filter(Boolean))
      assert.ok(workCommands[command!], command);
  }
  const data = {
    request_key: randomUUID(),
    id: randomUUID(),
    version: 1,
    reservation_id: randomUUID(),
    quantity: "1200.5",
    reason: "Actual weighed use",
  };
  assert.equal(commandPayload("consume_material", data).quantity, "1200.5");
  assert.throws(() =>
    commandPayload("consume_material", { ...data, quantity: "1.200,5" }),
  );
  assert.throws(() =>
    commandPayload("consume_material", { ...data, quantity: "1,200.5" }),
  );
  assert.throws(() =>
    commandPayload("repack_pallet", {
      ...data,
      content_id: randomUUID(),
      destination_pallet: randomUUID(),
    }),
  );
});
test("formal work documents paginate long identities and results without remote assets", async () => {
  const record = {
    id: randomUUID(),
    number: "MO-2026-00001",
    state: "closed",
    version: 7,
    product: "STEARATE 800",
    unit: "kg",
    target_quantity: "100",
    actual_quantity: "100",
    scrap_quantity: "0",
    yield_percent: "100",
    formula_snapshot: {
      number: "BOM-001",
      revision: 1,
      requirements: [
        {
          material: "Stearic acid",
          required_quantity: "100",
          unit: "kg",
          tolerance_percent: "0",
        },
      ],
    },
    inputs: Array.from({ length: 100 }, (_, i) => ({
      material: "Stearic acid",
      lot: "LOT-" + i + "-".repeat(150),
      quantity: "1.000000",
      unit: "kg",
      kind: "consume",
      operator: "Warehouse operator",
      location: "Main storage",
    })),
    outputs: [],
  };
  const pdf = await PDFDocument.load(
    await renderOperationDocument(record, "batch"),
  );
  assert.match(pdf.getTitle() || "", /BATCH MANUFACTURING RECORD/);
  assert.ok(pdf.getPageCount() > 2);
  for (const kind of ["materials", "incoming", "transfer"]) {
    const doc = await PDFDocument.load(
      await renderOperationDocument({ ...record, state: "draft" }, kind),
    );
    assert.ok(doc.getPageCount() >= 1);
  }
});

test("navigation preserves every destination and selects only the current tab", async () => {
  const { navigationSections, workspaceLinkActive } =
    await import("../src/lib/workspace/navigation");
  const links = [
    "Stock",
    "Stock counts",
    "Pallet tracking",
    "Warehouse transfers",
    "Stock ledger",
    "Warehouses",
    "Storage locations",
  ].map((name, i) => [name, "/" + i]);
  const sections = navigationSections("Warehouse", links);
  assert.equal(sections.length, 5);
  assert.deepEqual(
    sections
      .find((section) => section.name === "Pallets")
      ?.links.map((link) => link[0]),
    ["Pallet tracking"],
  );
  assert.deepEqual(sections.flatMap((s) => s.links).sort(), [...links].sort());
  assert.equal(
    workspaceLinkActive("/dashboard/finance", "/dashboard/finance", "payments"),
    false,
  );
  assert.equal(
    workspaceLinkActive(
      "/dashboard/finance?view=payments",
      "/dashboard/finance",
      "payments",
    ),
    true,
  );
  assert.equal(
    workspaceLinkActive(
      "/dashboard/sales?view=quotes",
      "/dashboard/sales",
      null,
    ),
    true,
  );
  assert.equal(
    workspaceLinkActive("/dashboard", "/dashboard/finance", null),
    false,
  );
});
test("issued and draft operation PDFs omit internal signature stamps", async () => {
  for (const state of ["pass", "draft"]) {
    const pdf = await renderOperationDocument(
      { id: randomUUID(), number: "IN-251", state, results: [] },
      "incoming",
    );
    const doc = await PDFDocument.load(pdf);
    assert.ok(doc.getPageCount() > 0);
    assert.doesNotMatch(doc.getKeywords() || "", /Internal approval|WORK-/);
  }
});

test("changing a reference source clears scoped choices without changing quantities", async () => {
  const { clearDependentReferences } =
    await import("../src/lib/operations/form-state");
  const values = {
    from_location: "a",
    to_location: "b",
    lines: [{ lot_id: "lot-a", quantity: "12" }],
    pallet_ids: [{ id: "pallet-a" }],
  };
  const result = clearDependentReferences(
    workCommands.create_warehouse_transfer.fields,
    values,
    "from_location",
  );
  assert.deepEqual(result.lines, [{ lot_id: "", quantity: "12" }]);
  assert.deepEqual(result.pallet_ids, [{ id: "" }]);
  assert.equal(result.to_location, "b");
  assert.equal(
    values.lines[0].lot_id,
    "lot-a",
    "previous state must not be mutated",
  );
  const reservation = clearDependentReferences(
    workCommands.reserve_manufacturing_material.fields,
    { lot_id: "old-lot", quantity: "7" },
    "material_id",
  );
  assert.equal(reservation.lot_id, "");
  assert.equal(reservation.quantity, "7");
});

test("save feedback distinguishes rejection from an unconfirmed outcome without retrying", async () => {
  const { saveRequest, SaveRequestError } =
    await import("../src/lib/save-request");
  const original = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async () => {
      requests++;
      return new Response(
        JSON.stringify({
          message: "Choose a location.",
          fields: [{ path: "location_id", message: "Choose a location." }],
        }),
        { status: 400 },
      );
    };
    await assert.rejects(
      saveRequest("/test", {}),
      (error: unknown) =>
        error instanceof SaveRequestError &&
        !error.uncertain &&
        error.fields[0].path === "location_id",
    );
    assert.equal(requests, 1);
    globalThis.fetch = async () => {
      requests++;
      throw new TypeError("network failed");
    };
    await assert.rejects(
      saveRequest("/test", {}),
      (error: unknown) => error instanceof SaveRequestError && error.uncertain,
    );
    assert.equal(requests, 2);
    globalThis.fetch = async () => {
      requests++;
      return new Response(JSON.stringify({ message: "Gateway unavailable" }), {
        status: 502,
      });
    };
    await assert.rejects(
      saveRequest("/test", {}),
      (error: unknown) => error instanceof SaveRequestError && error.uncertain,
    );
    assert.equal(requests, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test("transfer preflight identifies duplicate receipt lines, zero receipts and identical locations", async () => {
  const { commandSchema } = await import("../src/lib/operations/validation");
  const id = randomUUID(),
    key = randomUUID();
  const receipt = {
    id,
    version: 1,
    request_key: key,
    reason: "Actual receiving",
    lines: [
      { line_id: id, quantity: "1", lost_quantity: "0" },
      { line_id: id, quantity: "2", lost_quantity: "0" },
    ],
  };
  const duplicate = commandSchema("receive_warehouse_transfer").safeParse(
    receipt,
  );
  assert.equal(duplicate.success, false);
  if (!duplicate.success)
    assert.ok(
      duplicate.error.issues.some(
        (issue) => issue.path.join(".") === "lines.1.line_id",
      ),
    );
  const zero = commandSchema("receive_warehouse_transfer").safeParse({
    ...receipt,
    lines: [{ line_id: id, quantity: "0", lost_quantity: "0" }],
  });
  assert.equal(zero.success, false);
  assert.equal(
    commandSchema("receive_warehouse_transfer").safeParse({
      ...receipt,
      lines: [receipt.lines[0]],
    }).success,
    true,
  );
  const transfer = commandSchema("create_warehouse_transfer").safeParse({
    request_key: key,
    from_location: id,
    to_location: id,
    date: "2026-10-25",
    reason: "Transfer request",
    lines: [],
    pallet_ids: [{ id }],
  });
  assert.equal(transfer.success, false);
  if (!transfer.success)
    assert.ok(
      transfer.error.issues.some(
        (issue) => issue.path.join(".") === "to_location",
      ),
    );
});

test("formula preflight highlights repeated materials while preserving valid formula quantities", async () => {
  const { commandSchema } = await import("../src/lib/operations/validation");
  const material = randomUUID();
  const line = {
    material_id: material,
    quantity: "10.5",
    role: "ingredient",
    tolerance_percent: "0",
  };
  const data = {
    request_key: randomUUID(),
    title: "Stearate formula",
    product_id: randomUUID(),
    unit_id: randomUUID(),
    output_quantity: "20",
    effective_date: "2026-10-25",
    lines: [line, { ...line, quantity: "9.5" }],
    notes: "",
  };
  const result = commandSchema("save_formula").safeParse(data);
  assert.equal(result.success, false);
  if (!result.success)
    assert.ok(
      result.error.issues.some(
        (issue) => issue.path.join(".") === "lines.1.material_id",
      ),
    );
  assert.equal(
    commandSchema("save_formula").safeParse({
      ...data,
      lines: [{ ...line, quantity: "20" }],
    }).success,
    true,
  );
});

test("locale translation preserves canonical/user values and unknown keys", async () => {
  const { translate } = await import("../src/components/i18n/locale-provider");
  assert.equal(translate("Save", "id"), "Simpan");
  assert.equal(translate("Save", "en"), "Save");
  assert.equal(translate("Step 2 of 3", "id"), "Langkah 2 dari 3");
  assert.equal(
    translate("Search pallet location…", "id"),
    "Cari Lokasi palet…",
  );
  for (const value of [
    "INBIOSAN 200",
    "200.01.21102026.2027",
    "1000.50",
    "constructor",
    "__proto__",
  ])
    assert.equal(translate(value, "id"), value);
});
