"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { useEffect, useRef } from "react";
import { Package, FileText, MapPin, ArrowUpRight } from "lucide-react";
import { humanLabel, displayNumber, money } from "@/lib/erp/ux";
import { Badge } from "@/components/ui/badge";

type Row = Record<string, unknown>;
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function first(row: Row, keys: string[]) {
  return keys.map((k) => text(row[k])).find(Boolean) || "";
}
export function RecordOverview({ row, entity }: { row: Row; entity: string }) {
  const { t: localize } = useLocale();

  const snapshot =
    row.snapshot && typeof row.snapshot === "object"
      ? (row.snapshot as Row)
      : {};
  const totals =
    row.totals && typeof row.totals === "object"
      ? (row.totals as Row)
      : snapshot.totals && typeof snapshot.totals === "object"
        ? (snapshot.totals as Row)
        : {};
  const currency = text(row.currency) || text(snapshot.currency);
  const title = first(row, ["number", "label", "name", "product", "code"]);
  const party = first(row, [
    "customer",
    "customer_name",
    "supplier",
    "supplier_name",
    "product",
    "warehouse",
  ]);
  const date = first(row, [
    "date",
    "order_date",
    "quotation_date",
    "created_at",
  ]);
  const amount =
    first(row, ["grand_total", "total_amount", "total", "amount"]) ||
    text(totals.total);
  const state = first(row, ["display_state", "state"]);
  return (
    <section
      className="record-overview"
      aria-label={localize("Record overview")}
    >
      <div className="record-overview-mark">
        <FileText size={22} />
      </div>
      <div className="record-overview-heading">
        <span className="record-eyebrow">
          <Localized>{humanLabel(entity)}</Localized>
        </span>
        <p className="record-overview-title">
          {title || <Localized>{"Record details"}</Localized>}
        </p>
        {party && party !== title && <p>{party}</p>}
      </div>
      {state && (
        <Badge variant="secondary">
          <Localized>{humanLabel(state)}</Localized>
        </Badge>
      )}
      <dl className="record-overview-metrics">
        {date && (
          <div>
            <dt>
              <Localized>{"Document date"}</Localized>
            </dt>
            <dd>{date.slice(0, 10)}</dd>
          </div>
        )}
        {amount && currency ? (
          <div>
            <dt>
              <Localized>{"Document value"}</Localized>
            </dt>
            <dd>{money(amount, currency)}</dd>
          </div>
        ) : null}
        {Array.isArray(row.lines) && (
          <div>
            <dt>
              <Localized>{"Line items"}</Localized>
            </dt>
            <dd>{row.lines.length}</dd>
          </div>
        )}
        {text(row.location) && (
          <div>
            <dt>
              <Localized>{"Location"}</Localized>
            </dt>
            <dd>{text(row.location)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
export function ContextSummary({
  values: input,
  title = "Summary",
}: {
  values: unknown;
  title?: string;
}) {
  const values = input && typeof input === "object" ? (input as Row) : {};
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (panel.current)
      panel.current.open = window.matchMedia("(min-width: 1100px)").matches;
  }, []);
  const fields = [
    "date",
    "quotation_date",
    "valid_until",
    "due_date",
    "mfg_date",
    "release_date",
    "quantity",
    "qty",
    "currency",
    "tax_rate",
    "discount",
    "shipping",
    "amount",
    "reason",
  ];
  const entries = fields.filter((k) => text(values[k]) !== "");
  const lines = Object.entries(values).find(
    ([k, v]) => /lines$/.test(k) && Array.isArray(v),
  );
  if (!entries.length && !lines) return null;
  return (
    <details ref={panel} className="context-summary">
      <summary>
        <span>
          <Localized>{title}</Localized>
        </span>
      </summary>
      <dl>
        {lines && (
          <div>
            <dt>
              <Localized>{"Line items"}</Localized>
            </dt>
            <dd>{(lines[1] as unknown[]).length}</dd>
          </div>
        )}
        {entries.slice(0, 6).map((k) => (
          <div key={k}>
            <dt>
              <Localized>{humanLabel(k)}</Localized>
            </dt>
            <dd>
              {[
                "quantity",
                "qty",
                "amount",
                "tax_rate",
                "discount",
                "shipping",
              ].includes(k) && Number.isFinite(Number(values[k]))
                ? displayNumber(String(values[k]))
                : text(values[k])}
              {k === "tax_rate" ? "%" : ""}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
export function WarehouseBoard({
  rows,
  entity,
  onSelect,
  total,
}: {
  rows: Row[];
  entity: string;
  onSelect: (id: string) => void;
  total: number;
}) {
  const { t: localize } = useLocale();

  return (
    <section
      className="warehouse-board"
      aria-label={localize("Warehouse visual overview")}
    >
      <header>
        <div>
          <span className="record-eyebrow">
            <Localized>{"Warehouse overview"}</Localized>
          </span>
          <h3>
            {entity === "pallets" ? (
              <Localized>{"Pallets"}</Localized>
            ) : entity === "warehouses" ? (
              <Localized>{"Warehouses"}</Localized>
            ) : (
              <Localized>{"Storage locations"}</Localized>
            )}
          </h3>
        </div>
        <p>
          {rows.length} <Localized>{" shown · "}</Localized>
          {total} <Localized>{" matching records "}</Localized>
        </p>
      </header>
      <div className="warehouse-card-grid">
        {rows.map((row) => (
          <button
            type="button"
            className="warehouse-visual-card"
            key={String(row.id)}
            onClick={() => onSelect(String(row.id))}
          >
            <div className="warehouse-card-top">
              {entity === "pallets" ? (
                <Package size={23} />
              ) : (
                <MapPin size={23} />
              )}
              <Badge variant="secondary">
                <Localized>{humanLabel(text(row.state) || "Record")}</Localized>
              </Badge>
              <ArrowUpRight size={16} />
            </div>
            <strong>
              {first(row, ["number", "label", "name", "code"]) || (
                <Localized>{"View record"}</Localized>
              )}
            </strong>
            <span>
              {first(row, ["warehouse", "address"]) || (
                <Localized>{"Open for details"}</Localized>
              )}
            </span>
            <div className="warehouse-card-location">
              <MapPin size={14} />
              {first(row, ["location", "bin"]) ||
                (entity === "warehouses"
                  ? "Storage site"
                  : "Location not assigned")}
            </div>
          </button>
        ))}
      </div>
      {!rows.length && (
        <p className="warehouse-board-empty">
          <Localized>
            {" No records match this view. Adjust your search or filters. "}
          </Localized>
        </p>
      )}
    </section>
  );
}
