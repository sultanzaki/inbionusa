"use client";
import { Localized } from "@/components/i18n/locale-provider";

import { RecordSkeleton } from "@/components/workspace/record-loading";
import { useERPPage } from "./data";
import { ERPActionButton } from "./shared";
export function AccessPreview({
  role,
  userId,
}: {
  role: string;
  userId?: string;
}) {
  const result = useERPPage(
    userId ? "effective_access" : "role_access",
    role,
    "",
    1,
    userId,
  );
  return (
    <details className="access-preview">
      <summary>
        {userId ? (
          <Localized>{"View effective access"}</Localized>
        ) : (
          <Localized>{"View role defaults"}</Localized>
        )}
      </summary>
      <p>
        <Localized>
          {
            " Explicit exceptions replace role defaults. Module mode can further restrict access. "
          }
        </Localized>
      </p>
      {result.error ? (
        <p role="alert"><Localized>{result.error}</Localized></p>
      ) : result.loading ? (
        <RecordSkeleton compact label="Loading access…" />
      ) : (
        <div className="access-preview-rows">
          {result.data.rows.map((r) => (
            <div key={r.id}>
              <strong>{r.name}</strong>
              <span>
                <Localized>{" Read "}</Localized>
                {r.can_read ? "✓" : "—"} <Localized>{" · Write "}</Localized>
                {r.can_write ? "✓" : "—"} <Localized>{" · Approve "}</Localized>
                {r.can_approve ? "✓" : "—"}
              </span>
              <small>
                {r.source} · {r.state}
              </small>
              {userId && r.source === "User override" && (
                <ERPActionButton
                  action="reset_access"
                  payload={{ user_id: userId, module: r.id }}
                  onDone={() => result.refresh()}
                >
                  <Localized>{" Restore role default "}</Localized>
                </ERPActionButton>
              )}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
