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
  cleaningIntegrationIssues,
  cleaningTargets,
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
test("cleaning mappings survive renamed labels and are validated at publication", () => {
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

test("cleaning sections preserve every field, including additional uploads and renamed labels", async () => {
  const { formSections } = await import("../src/lib/forms/layout");
  const template = {
    ...cleaningTemplate,
    fields: [
      ...cleaningTemplate.fields.map((f) => ({
        ...f,
        label: "Renamed " + f.label,
      })),
      {
        id: "evidence",
        label: "Evidence",
        type: "file" as const,
        required: false,
        options: [],
      },
    ],
  };
  const sections = formSections(template);
  const ids = sections.flatMap((s) => s.fields.map((f) => f.id));
  assert.equal(sections.length, 3);
  assert.equal(new Set(ids).size, template.fields.length);
  assert.deepEqual([...ids].sort(), template.fields.map((f) => f.id).sort());
  assert.deepEqual(
    ids,
    template.fields.map((f) => f.id),
  );
});

test("single-choice validation identifies empty or repeated options at the affected field", () => {
  const check = (options: string[]) =>
    templateSchema.safeParse({
      title: "Checklist",
      description: "",
      kind: "general",
      fields: [
        {
          id: "choice",
          label: "Condition",
          type: "select",
          required: true,
          options,
        },
      ],
    });
  for (const options of [[], ["Ready", " Ready "]]) {
    const result = check(options);
    assert.equal(result.success, false);
    if (!result.success)
      assert.ok(
        result.error.issues.some(
          (i) => i.path.join(".") === "fields.0.options",
        ),
      );
  }
});
test("oversized forms are rejected before a save request", () => {
  const result = templateSchema.safeParse({
    title: "Large",
    description: "",
    kind: "general",
    fields: Array.from({ length: 20 }, (_, i) => ({
      id: "f" + i,
      label: "Question",
      type: "select",
      required: false,
      options: Array.from(
        { length: 30 },
        (_, j) => String(j) + "x".repeat(200),
      ),
    })),
  });
  assert.equal(result.success, false);
});

test("cleaning drafts allow deleting, changing types and making questions optional; publishing checks mappings", () => {
  const draft = {
    ...cleaningTemplate,
    fields: cleaningTemplate.fields
      .filter((f) => f.binding !== "Tanggal Pencucian")
      .map((f) => ({ ...f, required: false })),
  };
  assert.equal(templateSchema.safeParse(draft).success, true);
  assert.ok(
    cleaningIntegrationIssues(draft).some((i) =>
      i.message.includes("Cleaning date"),
    ),
  );
  const minimal = {
    ...cleaningTemplate,
    fields: cleaningTemplate.fields.filter(
      (f) => cleaningTargets.find((t) => t.binding === f.binding)?.required,
    ),
  };
  assert.doesNotThrow(() => assertCleaningBindings(minimal));
});
test("custom cleaning answer labels retain pass and fail semantics and cannot publish unmapped answers", async () => {
  const ready = cleaningTemplate.fields.find(
    (f) => f.binding === "Apakah Alat Sudah Dinyatakan Siap Digunakan Kembali?",
  )!;
  const field = {
    ...ready,
    id: "release_check",
    label: "Release this equipment?",
    options: ["Approved", "Hold"],
    value_map: {
      Approved: "Siap digunakan kembali",
      Hold: "Belum siap digunakan kembali",
    },
  };
  const template = {
    ...cleaningTemplate,
    fields: cleaningTemplate.fields.map((f) => (f.id === ready.id ? field : f)),
  };
  assert.doesNotThrow(() => assertCleaningBindings(template));
  assert.ok(
    cleaningIntegrationIssues({
      ...template,
      fields: template.fields.map((f) =>
        f.id === field.id
          ? { ...field, options: ["Approved"], value_map: field.value_map }
          : f,
      ),
    }).some((i) => i.message.includes("passing and failing")),
  );
  assert.ok(
    cleaningIntegrationIssues({
      ...template,
      fields: template.fields.map((f) =>
        f.id === field.id ? { ...field, value_map: {} } : f,
      ),
    }).some((i) => i.message.includes("meaning")),
  );
  const { inspectionPassed } =
    await import("../src/lib/integrations/equipment-form");
  const form: PublicForm = {
    template,
    revision: 1,
    areas: [{ id: "area", name: "KBI/Lab", kind: "laboratory" }],
    equipment: [
      { id: "asset", name: "Mixer", area: "KBI/Lab", state: "dirty" },
    ],
    staff: [{ id: "staff", name: "Operator" }],
  };
  const answers = Object.fromEntries(
    template.fields.map((f) => [f.id, f.options[0] || "Recorded"]),
  );
  for (const f of template.fields) {
    if (f.binding === "Nama Alat") answers[f.id] = "asset";
    if (f.binding === "Area Kerja") answers[f.id] = "KBI/Lab";
    if (
      ["Nama Petugas", "Nama Pemeriksa/Penanggung Jawab Verifikasi"].includes(
        f.binding || "",
      )
    )
      answers[f.id] = "staff";
    if (f.type === "date") answers[f.id] = "2026-10-28";
    if (f.type === "time") answers[f.id] = "09:00";
  }
  assert.equal(inspectionPassed(cleaningPayload(form, answers).fields), true);
  answers.release_check = "Hold";
  assert.equal(inspectionPassed(cleaningPayload(form, answers).fields), false);
});
test("mapped ERP identities use the standard reference type and general forms ignore cleaning automation metadata", () => {
  const template = {
    ...cleaningTemplate,
    fields: cleaningTemplate.fields.map((f) => {
      const t = cleaningTargets.find((t) => t.binding === f.binding);
      return t?.source
        ? { ...f, type: "reference" as const, source: t.source, options: [] }
        : f;
    }),
  };
  assert.doesNotThrow(() => assertCleaningBindings(template));
  const invalid = {
    ...template,
    fields: template.fields.map((f) =>
      f.binding === "Nama Alat" ? { ...f, source: "products" as const } : f,
    ),
  };
  assert.ok(
    cleaningIntegrationIssues(invalid).some(
      (i) =>
        i.fieldId ===
        template.fields.find((f) => f.binding === "Nama Alat")!.id,
    ),
  );
  const form: PublicForm = {
    template: { ...template, kind: "general" },
    revision: 1,
    equipment: [],
    staff: [],
  };
  assert.ok(
    resolvedTemplate(form).fields.every((f) => f.binding === undefined),
  );
});
