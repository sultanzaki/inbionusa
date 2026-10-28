import { test } from "node:test";
import assert from "node:assert/strict";
import {
  templateSchema,
  validateAnswers,
  uploadType,
} from "../src/lib/forms/schema";
import {
  cleaningTemplate,
  assertCleaningBindings,
} from "../src/lib/forms/cleaning-template";
import {
  cleaningPayload,
  resolvedTemplate,
  type PublicForm,
} from "../src/lib/forms/public";
test("form validation highlights required fields, invalid choices and missing attachments", () => {
  const template = templateSchema.parse({
    title: "Checklist",
    description: "",
    kind: "general",
    fields: [
      {
        id: "qty",
        label: "Quantity",
        type: "number",
        required: true,
        options: [],
      },
      {
        id: "photo",
        label: "Evidence",
        type: "file",
        required: true,
        options: [],
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        required: true,
        options: ["Ready"],
      },
    ],
  });
  assert.deepEqual(
    Object.keys(
      validateAnswers(template, { qty: "bad", status: "Other" }, []).errors,
    ).sort(),
    ["photo", "qty", "status"],
  );
  assert.deepEqual(
    validateAnswers(template, { qty: "12.5", status: "Ready" }, ["photo"])
      .errors,
    {},
  );
  assert.equal(
    uploadType(new TextEncoder().encode("<html>unsafe</html>")),
    null,
  );
  assert.equal(uploadType(new TextEncoder().encode("%PDF-1.7"))?.ext, "pdf");
});
test("cleaning bindings survive renamed labels but cannot be removed", () => {
  assert.doesNotThrow(() =>
    assertCleaningBindings({
      ...cleaningTemplate,
      fields: cleaningTemplate.fields.map((f) => ({
        ...f,
        label: "Renamed " + f.label,
      })),
    }),
  );
  assert.throws(() =>
    assertCleaningBindings({
      ...cleaningTemplate,
      fields: cleaningTemplate.fields.slice(1),
    }),
  );
  assert.equal(
    templateSchema.safeParse({
      ...cleaningTemplate,
      fields: [...cleaningTemplate.fields, cleaningTemplate.fields[0]],
    }).success,
    false,
  );
});
test("native cleaning choices use ERP IDs and resolve the selected asset and staff", () => {
  const form: PublicForm = {
    template: cleaningTemplate,
    revision: 1,
    equipment: [
      {
        id: "asset",
        name: "Mixer",
        area: "Production",
        state: "dirty",
        batches: ["PRD-1"],
      },
    ],
    staff: [{ id: "operator", name: "Operator" }],
  };
  const answers = Object.fromEntries(
    cleaningTemplate.fields.map((f) => [f.id, "value"]),
  );
  for (const f of cleaningTemplate.fields) {
    if (f.binding === "Nama Alat") answers[f.id] = "asset";
    if (f.binding === "Area Kerja") answers[f.id] = "Production";
    if (
      f.binding === "Nama Petugas" ||
      f.binding === "Nama Pemeriksa/Penanggung Jawab Verifikasi"
    )
      answers[f.id] = "operator";
    if (f.binding === "Tanggal Pencucian") answers[f.id] = "2026-10-27";
    if (f.type === "time") answers[f.id] = "09:30";
  }
  const result = cleaningPayload(form, answers);
  assert.equal(result.equipment_id, "asset");
  assert.equal(result.fields["Nama Alat"], "Mixer");
  assert.equal(result.cleaned_by_id, "operator");
  assert.ok(
    resolvedTemplate(form)
      .fields.find((f) => f.binding === "Nama Alat")
      ?.options.includes("asset"),
  );
});

test("form choices tolerate a trailing empty line from the editor", () => {
  const result = templateSchema.parse({
    title: "Test",
    description: "",
    kind: "general",
    fields: [
      {
        id: "choice",
        label: "Choice",
        type: "select",
        required: true,
        options: ["Yes", "  ", "No", ""],
      },
    ],
  });
  assert.deepEqual(result.fields[0].options, ["Yes", "No"]);
});

test("ERP reference fields require a known source and valid UUID choices", () => {
  const field = {
    id: "batch",
    label: "Batch",
    type: "reference",
    required: true,
    options: [],
  };
  const template = {
    title: "General",
    description: "",
    kind: "general",
    fields: [field],
  };
  assert.equal(templateSchema.safeParse(template).success, false);
  assert.equal(
    templateSchema.safeParse({
      ...template,
      fields: [{ ...field, source: "sessions" }],
    }).success,
    false,
  );
  const parsed = templateSchema.parse({
    ...template,
    fields: [{ ...field, source: "lots" }],
  });
  assert.ok(validateAnswers(parsed, { batch: "fake" }, []).errors.batch);
  assert.deepEqual(
    validateAnswers(
      parsed,
      { batch: "01823b1f-ec3a-4b0c-b30b-5491564d972b" },
      [],
    ).errors,
    {},
  );
});
