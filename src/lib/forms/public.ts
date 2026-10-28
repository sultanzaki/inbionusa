import { cleaningTargets } from "./cleaning-template";
import { answerMeaning, type Template } from "./schema";
export type PublicForm = {
  template: Template;
  revision: number;
  areas?: { id: string; name: string; kind: string }[];
  equipment: {
    id: string;
    name: string;
    code?: string;
    area: string;
    state: string;
    batches?: string[];
  }[];
  staff: { id: string; name: string; username?: string }[];
};
export function resolvedTemplate(form: PublicForm): Template {
  return {
    ...form.template,
    fields: form.template.fields.map((original) => {
      const f =
        form.template.kind === "equipment_cleaning"
          ? original
          : { ...original, binding: undefined };
      return {
        ...f,
        options:
          f.type === "reference"
            ? f.options
            : f.binding === "Area Kerja"
              ? [
                  ...new Set(
                    form.areas
                      ? form.areas.map((a) => a.name)
                      : form.equipment.map((e) => e.area),
                  ),
                ]
              : f.binding === "Nama Alat"
                ? form.equipment
                    .filter((e) => e.state !== "in_use")
                    .map((e) => e.id)
                : [
                      "Nama Petugas",
                      "Nama Pemeriksa/Penanggung Jawab Verifikasi",
                    ].includes(f.binding || "")
                  ? form.staff.map((u) => u.id)
                  : f.options,
      };
    }),
  };
}
export function cleaningPayload(
  form: PublicForm,
  answers: Record<string, string>,
) {
  const fields: Record<string, string> = {
    Timestamp: new Date().toISOString(),
  };
  for (const f of form.template.fields)
    if (f.binding)
      fields[f.binding] = cleaningTargets.find(
        (target) => target.binding === f.binding,
      )?.options.length
        ? answerMeaning(f, answers[f.id] ?? "")
        : (answers[f.id] ?? "");
  const areaField = form.template.fields.find(
    (f) => f.binding === "Area Kerja",
  );
  if (areaField?.type === "reference")
    fields["Area Kerja"] =
      form.areas?.find((a) => a.id === fields["Area Kerja"])?.name || "";
  const equipment = form.equipment.find((e) => e.id === fields["Nama Alat"]),
    cleaner = form.staff.find((u) => u.id === fields["Nama Petugas"]),
    inspector = form.staff.find(
      (u) => u.id === fields["Nama Pemeriksa/Penanggung Jawab Verifikasi"],
    );
  if (
    !equipment ||
    !cleaner ||
    !inspector ||
    equipment.area !== fields["Area Kerja"]
  )
    throw Error("Choose equipment and staff from the available lists.");
  fields["Nama Alat"] = equipment.name;
  fields["Nama Petugas"] = cleaner.name;
  fields["Nama Pemeriksa/Penanggung Jawab Verifikasi"] = inspector.name;
  const day = fields["Tanggal Pencucian"];
  const stamp = (key: string) =>
    day +
    "T" +
    fields[key] +
    (fields[key].length === 5 ? ":00" : "") +
    "+07:00";
  const started = stamp("Waktu Mulai Pencucian"),
    finished = stamp("Waktu Selesai Pencucian");
  if (
    !Number.isFinite(Date.parse(started)) ||
    !Number.isFinite(Date.parse(finished)) ||
    Date.parse(started) > Date.parse(finished)
  )
    throw Error("Review cleaning date and times.");
  return {
    fields,
    started_at: started,
    finished_at: finished,
    equipment_id: equipment.id,
    cleaned_by_id: cleaner.id,
    inspected_by_id: inspector.id,
  };
}
