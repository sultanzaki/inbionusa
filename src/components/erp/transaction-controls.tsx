"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { RecordSkeleton } from "@/components/workspace/record-loading";
import { useState } from "react";
import { useERPPage } from "./data";
import { useERP } from "./context";
import { ERPModal, ERPForm, ERPField, ERPActionButton } from "./shared";
import { Button } from "@/components/ui/button";
import { humanLabel, displayNumber, money } from "@/lib/erp/ux";
type Line = {
  id: string;
  product: string;
  unit: string;
  ordered: string;
  actual: string;
  closing: string;
  reserved?: string;
};
type Closure = {
  reason: string;
  approver: string;
  created_at: string;
  lines: Line[];
};
type Preview = {
  source_type: "order" | "purchase";
  source_id: string;
  number: string;
  version?: number;
  can_close: boolean;
  review_token: string;
  blockers: string[];
  lines: Line[];
  financial?: { actual_value: string; advance_requested: string };
};
type MatchLine = {
  id: string;
  product: string;
  unit: string;
  ordered: string;
  received: string;
  billed_elsewhere: string;
  bill_quantity: string;
  agreed_price: string;
  bill_price: string;
  price_variance: string;
  quantity_valid: boolean;
};
type Matching = {
  purchase_number: string;
  quantity_valid: boolean;
  has_variance: boolean;
  review_token: string;
  lines: MatchLine[];
};
type Event = {
  id: string;
  action: string;
  actor: string;
  reason: string;
  created_at: string;
  changes: {
    table: string;
    row_id: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }[];
};
type Control = {
  kind: string;
  closure_preview: Preview | null;
  closure: Closure | null;
  matching: Matching | null;
  variance_review: {
    current: boolean;
    reviewer: string;
    reason: string;
    created_at: string;
  } | null;
  history: Event[];
  amendments: {
    id: string;
    reason: string;
    actor: string;
    created_at: string;
  }[];
};
const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const eventTitle = (action: string) =>
  humanLabel(action.replace(/^(erp_|fin_|ops_)/, ""));
function QuantityReview({ lines }: { lines: Line[] }) {
  return (
    <div className="control-lines">
      {lines.map((line) => (
        <article key={line.id}>
          <strong>{line.product}</strong>
          <p>
            <Localized>{" Ordered "}</Localized>
            {displayNumber(line.ordered)} ·{" "}
            {"received" in line ? (
              <Localized>{"Actual"}</Localized>
            ) : (
              <Localized>{"Completed"}</Localized>
            )}{" "}
            {displayNumber(line.actual)} ·{" "}
            <strong>
              <Localized>{" Closing "}</Localized>
              {displayNumber(line.closing)} {line.unit}
            </strong>
          </p>
          {line.reserved && Number(line.reserved) > 0 && (
            <small>
              {displayNumber(line.reserved)}{" "}
              <Localized>{" reserved units will be released. "}</Localized>
            </small>
          )}
        </article>
      ))}
    </div>
  );
}
function shown(value: unknown, key: string): string {
  if (value == null) return "—";
  if (Array.isArray(value))
    return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  if (typeof value === "object") return "Updated details";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text))
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(text + "T00:00:00Z"));
  return /^-?\d+(\.\d+)?$/.test(text)
    ? displayNumber(text)
    : ["state", "mode", "billing_event"].includes(key)
      ? humanLabel(text)
      : text;
}
export function TransactionControls({
  entity,
  id,
  onDone,
  version,
  currency = "IDR",
}: {
  entity: string;
  id: string;
  onDone: () => void;
  version?: number;
  currency?: string;
}) {
  const { t: localize } = useLocale();

  const erp = useERP(),
    [page, setPage] = useState(1),
    [mode, setMode] = useState<"close" | "variance" | null>(null),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false);
  const result = useERPPage("controls/" + entity, "", "", page, id),
    control = result.data.rows[0] as unknown as Control | undefined;
  const preview = control?.closure_preview,
    matching = control?.matching;
  const canClose =
    preview &&
    erp.can(preview.source_type === "order" ? "sales" : "purchase", "approve");
  const done = () => {
    setMode(null);
    setReason("");
    setAck(false);
    result.refresh();
    onDone();
  };
  if (result.loading)
    return <RecordSkeleton compact label="Loading document controls…" />;
  if (result.error)
    return (
      <p className="erp-notice" role="alert">
        <Localized>{result.error}</Localized>{" "}
        <button type="button" className="underline" onClick={result.refresh}>
          <Localized>{" Retry controls "}</Localized>
        </button>
      </p>
    );
  if (!control) return null;
  const isClosed = Boolean(control.closure);
  return (
    <section
      className="transaction-controls"
      aria-label={localize("Document controls")}
    >
      {control.closure && (
        <section className="erp-notice">
          <h3>
            <Localized>{"Remaining quantities closed"}</Localized>
          </h3>
          <p>{control.closure.reason}</p>
          <p className="text-xs">
            <Localized>{" Approved by "}</Localized>
            {control.closure.approver} · {stamp(control.closure.created_at)}
          </p>
          <QuantityReview lines={control.closure.lines} />
          <p className="text-xs">
            <Localized>
              {
                " Original quantities are retained. Posted stock, invoices and payments remain recorded. "
              }
            </Localized>
          </p>
        </section>
      )}
      {preview && !isClosed && canClose && (
        <section className="erp-notice">
          <h3>
            <Localized>{"Close remaining quantities"}</Localized>
          </h3>
          <p>
            <Localized>{" Stop future"}</Localized>{" "}
            {preview.source_type === "order" ? (
              <Localized>{"deliveries"}</Localized>
            ) : (
              <Localized>{"receipts"}</Localized>
            )}{" "}
            <Localized>
              {
                " for the remaining items. Review completed quantities and linked billing before approval. "
              }
            </Localized>
          </p>
          {preview.blockers.length > 0 && (
            <ul className="list-disc pl-4">
              {preview.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!preview.can_close}
            onClick={() => {
              setReason("");
              setMode("close");
            }}
          >
            <Localized>{" Review closure "}</Localized>
          </Button>
        </section>
      )}
      {matching && (
        <section
          className="erp-notice"
          aria-label={localize("Purchase matching review")}
        >
          <h3>
            <Localized>{"PO / receipt / bill matching"}</Localized>
          </h3>
          <p>{matching.purchase_number}</p>
          <div className="control-lines">
            {matching.lines.map((line) => (
              <article key={line.id}>
                <strong>{line.product}</strong>
                <p>
                  <Localized>{" Ordered "}</Localized>
                  {displayNumber(line.ordered)}{" "}
                  <Localized>{" · Received"}</Localized>{" "}
                  {displayNumber(line.received)}{" "}
                  <Localized>{" · Billed elsewhere"}</Localized>{" "}
                  {displayNumber(line.billed_elsewhere)}{" "}
                  <Localized>{" · This bill"}</Localized>{" "}
                  {displayNumber(line.bill_quantity)} {line.unit}
                </p>
                <p>
                  <Localized>{" PO price "}</Localized>
                  {money(line.agreed_price, currency)}{" "}
                  <Localized>{" · Bill price"}</Localized>{" "}
                  {money(line.bill_price, currency)}
                </p>
                <p>
                  {line.quantity_valid ? (
                    <Localized>{"Quantity matches receipts"}</Localized>
                  ) : (
                    <Localized>
                      {"Quantity exceeds available receipts"}
                    </Localized>
                  )}{" "}
                  <Localized>{" · Price variance "}</Localized>
                  {money(line.price_variance, currency)}
                </p>
              </article>
            ))}
          </div>
          {control.variance_review && (
            <p>
              <Localized>{" Reviewed by "}</Localized>
              {control.variance_review.reviewer} ·{" "}
              {stamp(control.variance_review.created_at)} —{" "}
              {control.variance_review.reason}
              {!control.variance_review.current ? (
                <Localized>{" · Details changed; review again."}</Localized>
              ) : (
                ""
              )}
            </p>
          )}
          {erp.can("finance", "approve") && version != null && (
            <div className="erp-actions">
              {matching.has_variance && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!matching.quantity_valid}
                  onClick={() => {
                    setReason("");
                    setAck(false);
                    setMode("variance");
                  }}
                >
                  <Localized>{" Review price variance "}</Localized>
                </Button>
              )}
              <ERPActionButton
                action="fin_issue_document"
                payload={{ id, version }}
                reason
                onDone={done}
                disabled={
                  !matching.quantity_valid ||
                  (matching.has_variance && !control.variance_review?.current)
                }
              >
                <Localized>{" Approve and issue "}</Localized>
              </ERPActionButton>
            </div>
          )}
          <p className="text-xs">
            <Localized>
              {
                " Price differences require an explicit review. Quantities cannot exceed actual receipts; no automatic tolerance or write-off is applied. "
              }
            </Localized>
          </p>
        </section>
      )}
      <section
        aria-label={localize("Correction guidance")}
        className="text-xs text-muted leading-relaxed"
      >
        <h3 className="font-semibold text-foreground">
          <Localized>{"Corrections"}</Localized>
        </h3>
        {control.kind === "billing" ? (
          <p>
            <Localized>
              {
                " Void drafts before replacing them. Correct issued invoices with a linked credit note and apply the credit. For an issued advance request, reverse or move active allocations before cancellation. Cancelling a request does not refund money. "
              }
            </Localized>
          </p>
        ) : control.kind === "payment" ? (
          <p>
            <Localized>
              {
                " Reverse or move allocations to correct a matching mistake. A verified payment can be voided only after active allocations are reversed. Record actual refunds separately. "
              }
            </Localized>
          </p>
        ) : control.kind === "movement" ? (
          <p>
            <Localized>
              {
                " Cancel an unposted draft. Posted stock needs an authorized reversal when allowed. Use a claim/return after customer receipt or order closure; do not edit posted quantities. "
              }
            </Localized>
          </p>
        ) : (
          <p>
            <Localized>
              {
                " Keep completed receipts and deliveries. Use an approved change request for agreed quantity changes; use a claim, credit or return for corrections after billing or receipt. Closing remaining quantities does not settle an outstanding balance. "
              }
            </Localized>
          </p>
        )}
      </section>
      <section aria-label={localize("Document history")}>
        <h3 className="text-sm font-semibold">
          <Localized>{"Document history"}</Localized>
        </h3>
        {control.history.length === 0 ? (
          <p className="text-xs text-muted">
            <Localized>
              {
                " No events captured since transaction controls were enabled. Earlier records remain available in the audit log. "
              }
            </Localized>
          </p>
        ) : (
          <ol className="control-history">
            {control.history.map((event) => (
              <li key={event.id} id={"audit-ERP-" + event.id}>
                <strong>{eventTitle(event.action)}</strong>
                <p>
                  {event.actor} · {stamp(event.created_at)}{" "}
                  <Localized>{" · ERP-"}</Localized>
                  {event.id}
                </p>
                {event.reason && <p>{event.reason}</p>}
                <details>
                  <summary>
                    <Localized>{"View changes"}</Localized>
                  </summary>
                  {event.changes.map((change, i) => {
                    const keys = Array.from(
                      new Set([
                        ...Object.keys(change.before),
                        ...Object.keys(change.after),
                      ]),
                    ).filter(
                      (key) =>
                        ![
                          "version",
                          "review_token",
                          "document_version",
                          "purchase_version",
                        ].includes(key) &&
                        JSON.stringify(change.before[key]) !==
                          JSON.stringify(change.after[key]),
                    );
                    if (!keys.length) return null;
                    const created = keys.every(
                      (key) => change.before[key] == null,
                    );
                    return (
                      <section
                        key={i}
                        className={
                          "history-change-group" +
                          (created ? " is-created" : "")
                        }
                        aria-label={
                          humanLabel(change.table.replace(/^erp_/, "")) +
                          " changes"
                        }
                      >
                        <h4>
                          <Localized>
                            {humanLabel(change.table.replace(/^erp_/, ""))}
                          </Localized>
                        </h4>
                        <div
                          className="history-change-heading"
                          aria-hidden="true"
                        >
                          <span>
                            <Localized>{"Field"}</Localized>
                          </span>
                          {!created && (
                            <span>
                              <Localized>{"Before"}</Localized>
                            </span>
                          )}
                          <span>
                            {created ? (
                              <Localized>{"Initial value"}</Localized>
                            ) : (
                              <Localized>{"After"}</Localized>
                            )}
                          </span>
                        </div>
                        <dl className="control-diff">
                          {keys.map((key) => (
                            <div key={key}>
                              <dt>
                                <Localized>{humanLabel(key)}</Localized>
                              </dt>
                              <dd>
                                {!created && (
                                  <span className="history-value history-value-before">
                                    <span className="sr-only">
                                      <Localized>{"Before: "}</Localized>
                                    </span>
                                    {shown(change.before[key], key)}
                                  </span>
                                )}
                                <span
                                  className={
                                    "history-value history-value-after" +
                                    (key === "state" ? " is-state" : "")
                                  }
                                >
                                  <span className="sr-only">
                                    {created ? (
                                      <Localized>{"Initial value: "}</Localized>
                                    ) : (
                                      <Localized>{"After: "}</Localized>
                                    )}
                                  </span>
                                  {shown(change.after[key], key)}
                                </span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    );
                  })}
                </details>
              </li>
            ))}
          </ol>
        )}
        {result.data.total > 20 && (
          <div className="erp-actions">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <Localized>{" Previous history "}</Localized>
            </Button>
            <span className="text-xs">
              <Localized>{"Page "}</Localized>
              {page}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page * 20 >= result.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              <Localized>{" Next history "}</Localized>
            </Button>
          </div>
        )}
        {control.amendments.map((a) => (
          <p key={a.id} className="erp-notice text-xs">
            <Localized>{" Approved amendment · "}</Localized>
            {a.actor} · {stamp(a.created_at)} — {a.reason}
          </p>
        ))}
      </section>
      {mode && (
        <ERPModal
          title={
            mode === "close"
              ? "Approve remaining-quantity closure"
              : "Review supplier price variance"
          }
          description=""
          onClose={() => setMode(null)}
        >
          {mode === "close" && preview ? (
            <ERPForm
              action={
                preview.source_type === "order"
                  ? "close_order"
                  : "close_purchase"
              }
              payload={{
                id,
                version: preview.version,
                review_token: preview.review_token,
                reason,
              }}
              onDone={done}
              label="Approve closure"
              disabled={!preview.can_close}
            >
              <QuantityReview lines={preview.lines} />
              {preview.financial && (
                <p className="erp-notice">
                  <Localized>{" Delivered / received value:"}</Localized>{" "}
                  {money(preview.financial.actual_value, currency)}{" "}
                  <Localized>{" · Advance requests:"}</Localized>{" "}
                  {money(preview.financial.advance_requested, currency)}
                </p>
              )}
              <p className="erp-notice">
                <Localized>
                  {
                    " Remaining quantities will be closed and active sales reservations released. Existing stock and financial documents remain unchanged. Final billing for completed quantities remains available. Closure cannot be reopened from this form. "
                  }
                </Localized>
              </p>
              <ERPField name="reason" label="Closure reason">
                <textarea
                  required
                  minLength={3}
                  maxLength={150}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </ERPField>
            </ERPForm>
          ) : (
            matching && (
              <ERPForm
                action="fin_review_variance"
                payload={{
                  id,
                  version,
                  review_token: matching.review_token,
                  reason,
                  acknowledged: ack,
                }}
                onDone={done}
                label="Approve variance review"
              >
                <div className="control-lines">
                  {matching.lines
                    .filter((l) => Number(l.price_variance) !== 0)
                    .map((l) => (
                      <article key={l.id}>
                        <strong>{l.product}</strong>
                        <p>
                          <Localized>{" PO price "}</Localized>
                          {money(l.agreed_price, currency)}{" "}
                          <Localized>{" → Bill price "}</Localized>
                          {money(l.bill_price, currency)}
                        </p>
                        <p>
                          <Localized>{"Variance: "}</Localized>
                          {money(l.price_variance, currency)}
                        </p>
                      </article>
                    ))}
                </div>
                <ERPField name="reason" label="Review reason">
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </ERPField>
                <ERPField name="acknowledged" label="Variance acknowledgement">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    <Localized>
                      {
                        " I reviewed the price difference and supporting supplier evidence. This does not authorize excess receiving quantities. "
                      }
                    </Localized>
                  </label>
                </ERPField>
              </ERPForm>
            )
          )}
        </ERPModal>
      )}
    </section>
  );
}
