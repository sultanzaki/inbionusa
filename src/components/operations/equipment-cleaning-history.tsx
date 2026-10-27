"use client";
import { Localized } from "@/components/i18n/locale-provider";
import type { WorkRow } from "@/lib/operations/catalog";
export function EquipmentCleaningHistory({ rows }: { rows: WorkRow[] }) {
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="font-semibold">
        <Localized>Cleaning records</Localized>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          <Localized>No records</Localized>
        </p>
      ) : (
        rows.map((row) => (
          <details key={row.id} className="min-w-0 rounded-lg border p-4">
            <summary className="cursor-pointer break-words text-sm font-medium">
              {row.finished_at
                ? new Date(String(row.finished_at)).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })
                : "—"}{" "}
              · {String(row.cleaner || row.cleaned_by || "")} ·{" "}
              {String(row.result || "")}
            </summary>
            <dl className="mt-4 grid min-w-0 gap-3 text-sm">
              {Object.entries(
                (row.form_data as Record<string, string>) || {
                  Method: row.method,
                  Condition: row.condition,
                  Inspector: row.inspector,
                },
              ).map(([label, value]) => (
                <div key={label} className="grid min-w-0 gap-1 sm:grid-cols-2">
                  <dt className="break-words text-muted">{label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {String(value || "—")}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))
      )}
    </section>
  );
}
