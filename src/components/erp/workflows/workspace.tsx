"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { RecordOverview } from "@/components/workspace/record-overview";
import { useWorkPosition } from "@/components/workspace/use-work-position";
import { CaseGuide } from "@/components/operations/case-guide";
import { useTableState } from "@/components/tables/use-table-state";
import { AdvancedRecordsTable } from "@/components/tables/advanced-records-table";
import { TransactionControls } from "../transaction-controls";
import { DocumentFlow } from "../document-flow";
import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { PageHeader, DataPagination } from "@/components/workspace/page-ui";
import { RowActions } from "@/components/workspace/row-actions";
import { CopyValue } from "@/components/workspace/data-tools";
import { ERPModal, ERPModuleGuard, ERPActionButton } from "../shared";
import { useERPPage } from "../data";
import { useERP } from "../context";
import { decimal, type ERPAction } from "@/lib/erp/schema";
import { WorkflowForm, value, object, rows, type WorkflowRow } from "./forms";
const human = (text: string) =>
  text
    .replace(/^(fin|ops)_/, "")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
const recordTitles: Record<string, string> = {
  ops_cases: "Case details",
  ops_receipts: "Customer receipt",
  material_stock: "Material hold",
  ops_policy: "Operating policy",
  fin_documents: "Billing document",
  fin_payments: "Payment record",
  fin_orders: "Order clearance",
  fin_purchases: "Purchase matching",
  fin_credit_policies: "Customer credit policy",
};
const sourcePaths: Record<string, string> = {
  delivery: "/dashboard/warehouse?view=movements",
  receipt: "/dashboard/warehouse/materials?view=material_ledger",
  lot: "/dashboard/warehouse?view=lots",
  product: "/dashboard/master-data/products?view=products",
  order: "/dashboard/sales?view=orders",
  purchase: "/dashboard/purchase?view=purchases",
  document: "/dashboard/product-documents?view=product_documents",
};
const eventTitle = (e: Record<string, unknown>) =>
  value(e, "event") === "ops_case_transition"
    ? "Status → " + human(value(object(e, "data"), "state"))
    : human(value(e, "event", value(e, "kind")));
const timestamp = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
};
const financeTabs = [
  ["documents", "Invoices & billing"],
  ["payments", "Payments"],
  ["orders", "Dispatch clearance"],
  ["purchases", "Purchase matching"],
  ["credit_policies", "Customer credit"],
  ["aging", "AR / AP aging"],
] as const;
const serviceTabs = [
  ["cases", "Cases"],
  ["receipts", "Customer receipts"],
  ["material_stock", "Material holds"],
  ["policy", "Operating policy"],
] as const;
function Detail({
  entity,
  id,
  onClose,
  onChange,
}: {
  entity: string;
  id: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const { t: localize } = useLocale();

  const result = useERPPage(entity, "", "", 1, id),
    r = result.data.rows[0] as WorkflowRow | undefined,
    erp = useERP();
  const [action, setAction] = useState<ERPAction | null>(null),
    [actionRow, setActionRow] = useState<WorkflowRow | undefined>();
  const [nextRecord, setNextRecord] = useState<{
    id: string;
    entity: string;
  } | null>(null);
  const scope = entity.startsWith("fin_") ? "finance" : "service",
    write = erp.can(scope, "write"),
    approve = erp.can(scope, "approve");
  const edit = (a: ERPAction, row = r) => {
    setActionRow(row);
    setAction(a);
  };
  const done = (nextId?: string, nextEntity?: string) => {
    setAction(null);
    result.refresh();
    onChange();
    if (
      nextId &&
      nextEntity &&
      nextId !== id &&
      ["fin_documents", "fin_payments"].includes(nextEntity)
    )
      setNextRecord({ id: nextId, entity: nextEntity });
  };
  const button = (a: ERPAction, label: string, row = r) => (
    <Button
      key={a + label}
      size="sm"
      variant="outline"
      onClick={() => edit(a, row)}
    >
      <Localized>{label}</Localized>
    </Button>
  );
  const transition = (
    a: ERPAction,
    label: string,
    payload: Record<string, unknown>,
    restricted = approve,
  ) =>
    restricted && (
      <ERPActionButton
        key={a}
        action={a}
        payload={payload}
        reason
        onDone={done}
      >
        <Localized>{label}</Localized>
      </ERPActionButton>
    );
  if (nextRecord)
    return (
      <Detail
        key={nextRecord.entity + nextRecord.id}
        entity={nextRecord.entity}
        id={nextRecord.id}
        onClose={() => {
          setNextRecord(null);
          result.refresh();
        }}
        onChange={onChange}
      />
    );
  return (
    <>
      <ERPModal
        layout="record"
        loading={result.loading}
        title={value(r, "number", value(r, "name", "Record details"))}
        description={recordTitles[entity] || "Record details"}
        onClose={onClose}
      >
        {result.error ? (
          <p role="alert">
            <Localized>{result.error}</Localized>
          </p>
        ) : result.loading ? (
          <p role="status">
            <Localized>{"Loading details…"}</Localized>
          </p>
        ) : !r ? (
          <p>
            <Localized>{"Record not found."}</Localized>
          </p>
        ) : (
          <>
            <RecordOverview row={r} entity={entity} />
            <div className="workflow-record-meta">
              <Badge variant="secondary">{human(value(r, "state"))}</Badge>
              {Boolean(r.kind) && (
                <span>
                  <Localized>{value(r, "kind").replaceAll("_", " ")}</Localized>
                </span>
              )}
              {Boolean(r.disputed) && (
                <Badge variant="destructive">
                  <Localized>{"Disputed"}</Localized>
                </Badge>
              )}
            </div>
            {entity === "ops_cases" && (
              <>
                <CaseGuide id={id} version={Number(r.version)} />
                <p className="text-sm">{value(r, "description")}</p>
                <dl className="workflow-key-values">
                  <dt>
                    <Localized>{"Source"}</Localized>
                  </dt>
                  <dd>
                    <a
                      className="text-primary underline"
                      href={
                        (sourcePaths[value(r, "source_type")] || "/dashboard") +
                        "&q=" +
                        encodeURIComponent(value(r, "source_number"))
                      }
                    >
                      {value(
                        r,
                        "source_number",
                        human(value(r, "source_type")),
                      )}
                    </a>
                  </dd>
                  <dt>
                    <Localized>{"Assigned to"}</Localized>
                  </dt>
                  <dd>{value(r, "assignee", "Unassigned")}</dd>
                  <dt>
                    <Localized>{"Due"}</Localized>
                  </dt>
                  <dd>{value(r, "due_date", "—")}</dd>
                  <dt>
                    <Localized>{"Resolution"}</Localized>
                  </dt>
                  <dd>{value(r, "resolution", "Pending decision")}</dd>
                  <dt>
                    <Localized>{"Approved quantity"}</Localized>
                  </dt>
                  <dd>{value(r, "quantity", "—")}</dd>
                  {r.settlement_amount != null && (
                    <>
                      <dt>
                        <Localized>{"Approved settlement"}</Localized>
                      </dt>
                      <dd>
                        {value(r, "currency")}{" "}
                        {decimal(value(r, "settlement_amount", "0"))}
                      </dd>
                    </>
                  )}
                  <dt>
                    <Localized>{"Cost responsibility"}</Localized>
                  </dt>
                  <dd>{value(r, "cost_payer")}</dd>
                  <dt>
                    <Localized>{"Estimated / actual cost"}</Localized>
                  </dt>
                  <dd>
                    {value(r, "currency")}{" "}
                    {decimal(value(r, "estimated_cost", "0"))} /{" "}
                    {decimal(value(r, "actual_cost", "0"))}
                  </dd>
                </dl>
                <div className="erp-actions">
                  {write && (
                    <>
                      {button("ops_case_comment", "Add update")}
                      {button("ops_assign_case", "Assign / set due date")}
                      {!["closed", "rejected"].includes(value(r, "state")) &&
                        button("ops_case_transition", "Change status")}
                    </>
                  )}
                  {write &&
                    ["approved", "in_progress"].includes(value(r, "state")) && (
                      <>
                        {r.resolution === "replacement" &&
                          erp.can("warehouse", "write") &&
                          button("ops_replacement", "Ship replacement")}
                        {r.resolution === "correction" &&
                          r.kind === "change_request" &&
                          erp.can(
                            r.source_type === "order" ? "sales" : "purchase",
                            "approve",
                          ) &&
                          button(
                            r.source_type === "order"
                              ? "ops_amend_order"
                              : "ops_amend_purchase",
                            "Apply approved amendment",
                          )}
                        {r.resolution === "return" &&
                          r.source_type === "delivery" &&
                          erp.can("warehouse", "write") &&
                          button(
                            "ops_customer_return",
                            "Request customer return",
                          )}
                        {r.resolution === "return" &&
                          r.source_type === "receipt" &&
                          erp.can("warehouse", "write") &&
                          button("ops_supplier_return", "Return to supplier")}
                        {r.kind === "quality_retest" &&
                          erp.can("quality", "approve") &&
                          button("ops_retest", "Start linked retest")}
                        {["lot", "product"].includes(value(r, "source_type")) &&
                          erp.can("quality", "approve") &&
                          button("ops_withdraw_coa", "Withdraw certificate")}
                        {!erp.can("finance") &&
                          ["refund", "credit"].includes(
                            value(r, "resolution"),
                          ) &&
                          approve &&
                          button(
                            "ops_settlement_reference",
                            "Record external settlement",
                          )}
                      </>
                    )}
                </div>
                {(r.evidence as string[] | undefined)?.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline"
                  >
                    <Localized>{" Evidence "}</Localized>
                    {i + 1}
                  </a>
                ))}
              </>
            )}
            {[
              "fin_orders",
              "fin_purchases",
              "fin_documents",
              "fin_payments",
            ].includes(entity) && <DocumentFlow entity={entity} id={id} />}
            {[
              "fin_orders",
              "fin_purchases",
              "fin_documents",
              "fin_payments",
            ].includes(entity) && (
              <TransactionControls
                entity={entity}
                id={id}
                currency={value(r, "currency", "IDR")}
                version={
                  entity === "fin_documents" &&
                  r.kind === "supplier_bill" &&
                  r.document_state === "draft"
                    ? Number(r.version)
                    : undefined
                }
                onDone={done}
              />
            )}
            {entity === "fin_orders" && (
              <>
                <dl className="workflow-key-values">
                  <dt>
                    <Localized>{"Customer"}</Localized>
                  </dt>
                  <dd>{value(r, "name")}</dd>
                  <dt>
                    <Localized>{"Order value"}</Localized>
                  </dt>
                  <dd>
                    {value(r, "currency")} {decimal(value(r, "amount", "0"))}
                  </dd>
                  <dt>
                    <Localized>{"Payment terms"}</Localized>
                  </dt>
                  <dd>{value(object(r, "terms"), "mode", "Not configured")}</dd>
                  <dt>
                    <Localized>{"Approval"}</Localized>
                  </dt>
                  <dd>
                    {value(object(r, "terms"), "state", "Not configured")}
                  </dd>
                </dl>
                <div className="erp-notice" role="status">
                  <strong>
                    {object(r, "dispatch").cleared ? (
                      <Localized>{"Cleared for dispatch"}</Localized>
                    ) : (
                      <Localized>{"Financial hold"}</Localized>
                    )}
                  </strong>
                  <p>{value(object(r, "dispatch"), "reason")}</p>
                </div>
                <div className="erp-actions">
                  {write &&
                    r.state !== "closed" &&
                    button("fin_create_document", "Request down payment", {
                      ...r,
                      _source: r,
                      _kind: "payment_request",
                    })}
                  {write &&
                    button("fin_create_document", "Create invoice", {
                      ...r,
                      _source: r,
                      _kind: "invoice",
                    })}
                  {write && button("fin_terms", "Configure payment terms")}
                  {transition("fin_approve_terms", "Approve payment terms", {
                    id: r.id,
                    version: Number(object(r, "terms").version),
                  })}
                  {approve &&
                    button(
                      "fin_dispatch_override",
                      "Approve dispatch exception",
                    )}
                </div>
              </>
            )}
            {entity === "fin_purchases" && (
              <>
                <p>
                  <Localized>
                    {
                      " Three-way matching checks the supplier order, received quantity and bill. Unreceived quantities use an advance request. "
                    }
                  </Localized>
                </p>
                <p className="text-xs text-muted">
                  {value(r, "name")} · {value(r, "currency")}{" "}
                  {decimal(value(r, "amount", "0"))}
                </p>
              </>
            )}
            {entity === "fin_documents" && (
              <>
                <dl className="workflow-key-values">
                  <dt>
                    <Localized>{"Counterparty"}</Localized>
                  </dt>
                  <dd>{value(r, "party")}</dd>
                  <dt>
                    <Localized>{"Amount"}</Localized>
                  </dt>
                  <dd>
                    {value(r, "currency")} {decimal(value(r, "amount", "0"))}
                  </dd>
                  <dt>
                    <Localized>{"Outstanding / available credit"}</Localized>
                  </dt>
                  <dd>
                    {value(r, "currency")}{" "}
                    {decimal(value(r, "outstanding", "0"))}
                  </dd>
                  <dt>
                    <Localized>{"Date / due date"}</Localized>
                  </dt>
                  <dd>
                    {value(r, "date")} / {value(r, "due_date")}
                  </dd>
                  <dt>
                    <Localized>{"Matching"}</Localized>
                  </dt>
                  <dd>{value(r, "match_state")}</dd>
                  <dt>
                    <Localized>{"Supplier reference"}</Localized>
                  </dt>
                  <dd>{value(r, "external_reference", "—")}</dd>
                </dl>
                {r.match_state === "variance" && (
                  <p className="erp-notice">
                    <Localized>
                      {
                        " Supplier price differs from the PO. Review the variance before approving. "
                      }
                    </Localized>
                  </p>
                )}
                <div className="erp-actions">
                  <a
                    className="erp-document-link"
                    href={"/api/erp/documents/fin_documents/" + r.id}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Localized>{" Preview PDF "}</Localized>
                    <ArrowUpRight className="size-3.5" />
                  </a>
                  {r.document_state === "draft" ? (
                    <>
                      {r.kind !== "supplier_bill" &&
                        transition("fin_issue_document", "Approve and issue", {
                          id: r.id,
                          version: r.version,
                        })}
                      {transition("fin_void_document", "Void draft", {
                        id: r.id,
                        version: r.version,
                      })}
                    </>
                  ) : (
                    r.document_state === "issued" && (
                      <>
                        {["payment_request", "supplier_request"].includes(
                          value(r, "kind"),
                        ) &&
                          transition(
                            "fin_cancel_request",
                            "Cancel advance request",
                            { id: r.id, version: r.version },
                          )}
                        {write && button("fin_allocate", "Allocate payment")}
                        {write &&
                          button(
                            "fin_record_payment",
                            "Record actual payment",
                            {
                              ...r,
                              _party: {
                                id: value(r, "party_id"),
                                label: value(r, "party"),
                                name: value(r, "party"),
                              },
                            },
                          )}
                        {write &&
                          ["invoice", "supplier_bill"].includes(
                            value(r, "kind"),
                          ) &&
                          button("fin_collection", "Follow-up / dispute")}
                        {approve &&
                          ["credit_note", "supplier_credit"].includes(
                            value(r, "kind"),
                          ) &&
                          button("fin_apply_credit", "Apply credit")}
                      </>
                    )
                  )}
                </div>
                <p className="text-xs text-muted">
                  <Localized>
                    {
                      " Posted documents are immutable. Correct an issued invoice with a linked credit note; recording a credit is separate from refunding money. "
                    }
                  </Localized>
                </p>
              </>
            )}
            {entity === "fin_payments" && (
              <>
                <dl className="workflow-key-values">
                  <dt>
                    <Localized>{"Counterparty"}</Localized>
                  </dt>
                  <dd>{value(r, "name")}</dd>
                  <dt>
                    <Localized>{"Direction"}</Localized>
                  </dt>
                  <dd>{value(r, "direction")}</dd>
                  <dt>
                    <Localized>{"Amount / unallocated"}</Localized>
                  </dt>
                  <dd>
                    {value(r, "currency")} {decimal(value(r, "amount", "0"))} /{" "}
                    {decimal(value(r, "available", "0"))}
                  </dd>
                  <dt>
                    <Localized>{"Account"}</Localized>
                  </dt>
                  <dd>{value(r, "bank_account")}</dd>
                  <dt>
                    <Localized>{"Transaction reference"}</Localized>
                  </dt>
                  <dd>{value(r, "bank_reference")}</dd>
                  <dt>
                    <Localized>{"Evidence"}</Localized>
                  </dt>
                  <dd>{value(r, "evidence")}</dd>
                </dl>
                <div className="erp-actions">
                  {r.state === "verified" &&
                    write &&
                    Number(value(r, "available", "0")) > 0 &&
                    button("fin_allocate", "Allocate payment", {
                      ...r,
                      _payment: r,
                    })}
                  {r.state === "draft" &&
                    transition("fin_verify_payment", "Verify actual funds", {
                      id: r.id,
                      version: r.version,
                    })}
                  {r.state !== "void" &&
                    transition("fin_void_payment", "Void payment", {
                      id: r.id,
                      version: r.version,
                    })}
                </div>
                {rows(r, "allocations").map((a) => (
                  <article className="workflow-line" key={value(a, "id")}>
                    <strong>
                      {value(a, "document")} ·{" "}
                      {decimal(value(a, "amount", "0"))}
                    </strong>
                    <small>{value(a, "state")}</small>
                    {a.state === "active" && approve && (
                      <div className="erp-actions">
                        {button(
                          "fin_move_allocation",
                          "Move to final invoice",
                          a as WorkflowRow,
                        )}
                        {transition(
                          "fin_reverse_allocation",
                          "Reverse allocation",
                          { id: a.id },
                          true,
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </>
            )}
            {entity === "fin_credit_policies" && (
              <>
                <dl className="workflow-key-values">
                  <dt>
                    <Localized>{"Credit limit"}</Localized>
                  </dt>
                  <dd>
                    {value(r, "currency")}{" "}
                    {decimal(value(r, "credit_limit", "0"))}
                  </dd>
                  <dt>
                    <Localized>{"Hold overdue"}</Localized>
                  </dt>
                  <dd>
                    {r.hold_overdue ? (
                      <Localized>{"Yes"}</Localized>
                    ) : (
                      <Localized>{"No"}</Localized>
                    )}
                  </dd>
                </dl>
                {approve && button("fin_credit_policy", "Edit credit policy")}
              </>
            )}
            {entity === "ops_policy" &&
              write &&
              button("ops_policy", "Edit operating policy")}
            {entity === "material_stock" &&
              write &&
              button("ops_material_hold", "Set material hold", {
                ...r,
                id: value(r, "lot_id"),
              })}
            {rows(r, "lines").length > 0 && (
              <section
                className="workflow-lines"
                aria-label={localize("Record lines")}
              >
                {rows(r, "lines").map((l, i) => (
                  <article className="workflow-line" key={i}>
                    <strong>
                      {value(l, "product", value(l, "name", "Line " + (i + 1)))}
                    </strong>
                    <small>
                      <Localized>{" Quantity"}</Localized>{" "}
                      {value(l, "quantity", value(l, "base_quantity", "—"))}{" "}
                      <Localized>{" · Received / delivered"}</Localized>{" "}
                      {value(l, "received", value(l, "delivered", "—"))}{" "}
                      <Localized>{" · Unbilled "}</Localized>
                      {value(l, "unbilled", "—")}
                    </small>
                    {Boolean(l.amount) && (
                      <p>
                        {decimal(value(l, "amount", "0"))}{" "}
                        {value(r, "currency")}
                      </p>
                    )}
                  </article>
                ))}
              </section>
            )}
            {rows(r, "events").length > 0 && (
              <section
                className="workflow-timeline"
                aria-label={localize("Activity timeline")}
              >
                <h3>
                  <Localized>{"Activity"}</Localized>
                </h3>
                {rows(r, "events").map((e, i) => (
                  <article key={value(e, "id", String(i))}>
                    <strong>{eventTitle(e)}</strong>
                    <p>{value(e, "notes")}</p>
                    <small>
                      {value(e, "actor")} · {timestamp(value(e, "created_at"))}
                    </small>
                  </article>
                ))}
              </section>
            )}
            {rows(r, "executions").length > 0 && (
              <section className="workflow-timeline">
                <h3>
                  <Localized>{"Resolution actions"}</Localized>
                </h3>
                {rows(r, "executions").map((e) => (
                  <article key={value(e, "id")}>
                    <strong>{value(e, "kind")}</strong>
                    <p>
                      {value(e, "quantity")} · {value(e, "reference")}
                    </p>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </ERPModal>
      {action && (
        <ERPModal
          title={human(action)}
          description=""
          onClose={() => setAction(null)}
        >
          <WorkflowForm action={action} row={actionRow} onDone={done} />
        </ERPModal>
      )}
    </>
  );
}
export function OperationalWorkspace({
  area,
}: {
  area: "finance" | "service";
}) {
  const { t: localize } = useLocale();

  const erp = useERP(),
    params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname(),
    tabs =
      area === "finance"
        ? financeTabs
        : serviceTabs.filter(([key]) => key !== "policy" || erp.data?.admin);
  const tab =
    tabs.find(([key]) => key === params.get("view"))?.[0] || tabs[0][0];
  const [search, setSearch] = useState(params.get("q") || ""),
    [state, setState] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(params.get("record")),
    [action, setAction] = useState<ERPAction | null>(null);
  const entity =
    tab === "material_stock"
      ? tab
      : (area === "finance" ? "fin_" : "ops_") + tab;
  const positionReady = useWorkPosition(
    entity,
    { q: search, state, page },
    (saved) => {
      setSearch(saved.q);
      setState(saved.state);
      setPage(saved.page);
    },
  );
  const table = useTableState(entity, () => setPage(1));
  const result = useERPPage(
    entity,
    search,
    state,
    page,
    undefined,
    erp.can(area) && table.ready && positionReady,
    undefined,
    table.query,
  );
  const write = erp.can(area, "write"),
    approve = erp.can(area, "approve");
  const label = tabs.find(([key]) => key === tab)?.[1] || tab;
  const changeView = (view: string) => {
    setSelected(null);
    setSearch("");
    setState("");
    setPage(1);
    router.replace(pathname + "?view=" + view, { scroll: false });
  };
  const createAction: ERPAction | undefined =
    area === "service"
      ? tab === "cases"
        ? "ops_create_case"
        : tab === "receipts"
          ? "ops_delivery_receipt"
          : undefined
      : tab === "documents"
        ? "fin_create_document"
        : tab === "payments"
          ? "fin_record_payment"
          : tab === "credit_policies" && approve
            ? "fin_credit_policy"
            : undefined;
  const filters =
    tab === "cases"
      ? [
          "open",
          "under_review",
          "awaiting_approval",
          "approved",
          "in_progress",
          "resolved",
          "closed",
          "overdue",
        ]
      : tab === "documents"
        ? [
            "draft",
            "unpaid",
            "partially_paid",
            "overdue",
            "paid",
            "available",
            "void",
          ]
        : tab === "payments"
          ? ["draft", "verified", "void"]
          : [];
  return (
    <ERPModuleGuard module={area}>
      <div className="page-stack operational-workspace">
        <PageHeader
          eyebrow="OPERATIONS"
          title={area === "finance" ? "Finance" : "Service & exceptions"}
          description={
            area === "finance"
              ? "Billing, verified payments, credit and dispatch clearance."
              : "Claims, receipts and resolutions."
          }
        >
          {write && createAction && (
            <Button onClick={() => setAction(createAction)}>
              <Plus className="size-4" />
              {tab === "cases" ? (
                <Localized>{"New case"}</Localized>
              ) : tab === "receipts" ? (
                <Localized>{"Record customer receipt"}</Localized>
              ) : tab === "payments" ? (
                <Localized>{"Record payment"}</Localized>
              ) : tab === "credit_policies" ? (
                <Localized>{"Set credit policy"}</Localized>
              ) : (
                <Localized>{"New billing document"}</Localized>
              )}
            </Button>
          )}
        </PageHeader>
        <nav className="erp-section-tabs" aria-label={area + " pages"}>
          {tabs.map(([key, title]) => (
            <button
              key={key}
              type="button"
              aria-current={tab === key ? "page" : undefined}
              onClick={() => changeView(key)}
            >
              {title}
            </button>
          ))}
        </nav>
        <div className="workflow-toolbar">
          <label className="min-w-0 flex-1">
            <span className="sr-only">
              <Localized>{"Search records"}</Localized>
            </span>
            <Input
              placeholder={localize("Search records…")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {filters.length > 0 && (
            <label>
              <span className="sr-only">
                <Localized>{"Filter status"}</Localized>
              </span>
              <select
                aria-label={localize("Filter status")}
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">
                  <Localized>{"All statuses"}</Localized>
                </option>
                {filters.map((f) => (
                  <option key={f} value={f}>
                    <Localized>{f.replaceAll("_", " ")}</Localized>
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button size="sm" variant="outline" onClick={result.refresh}>
            <Localized>{" Refresh "}</Localized>
          </Button>
        </div>
        {entity === "fin_aging" && (
          <p className="erp-notice">
            <Localized>
              {
                " Outstanding customer and supplier documents are grouped separately by currency and days overdue. Disputes remain outstanding until settled; promises do not change due dates. "
              }
            </Localized>
          </p>
        )}
        {result.error ? (
          <div className="erp-empty" role="alert">
            <p>
              <Localized>{result.error}</Localized>
            </p>
            <Button onClick={result.refresh}>
              <Localized>{"Retry"}</Localized>
            </Button>
          </div>
        ) : result.loading ? (
          <p role="status">
            <Localized>{"Loading records…"}</Localized>
          </p>
        ) : (
          <>
            <p className="text-xs text-muted">
              {result.data.total} <Localized>{" records"}</Localized>
            </p>
            <div className="data-card">
              <AdvancedRecordsTable
                summary={result.data.summary}
                state={table}
                rows={result.data.rows}
                search={search}
                status={state}
                onRestore={(q, s) => {
                  setSearch(q);
                  setState(s);
                  setPage(1);
                }}
                exportURL={
                  "/api/erp/export/" +
                  entity +
                  "?" +
                  new URLSearchParams({ q: search, state: state })
                }
              >
                <Table data-actions="true">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Localized>{"Record"}</Localized>
                      </TableHead>
                      <TableHead>
                        <Localized>{"Details"}</Localized>
                      </TableHead>
                      <TableHead>
                        <Localized>{"Status / amount"}</Localized>
                      </TableHead>
                      <TableHead>
                        <Localized>{"Actions"}</Localized>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(result.data.rows as WorkflowRow[]).map((r, i) => (
                      <TableRow key={r.id || i}>
                        <TableCell>
                          {tab === "aging" ? (
                            <strong>{value(r, "bucket")}</strong>
                          ) : (
                            <button
                              className="erp-record-link"
                              onClick={() => setSelected(r.id)}
                            >
                              {value(
                                r,
                                "number",
                                value(r, "label", value(r, "name", label)),
                              )}
                            </button>
                          )}
                          <p className="erp-row-description">
                            {value(
                              r,
                              "title",
                              value(
                                r,
                                "party",
                                value(r, "name", value(r, "party_type")),
                              ),
                            )}
                          </p>
                          {r.number && <CopyValue value={r.number} />}
                        </TableCell>
                        <TableCell>
                          <span>
                            {value(
                              r,
                              "kind",
                              value(r, "currency", value(r, "assignee", "—")),
                            ).replaceAll("_", " ")}
                          </span>
                          <p className="erp-row-description">
                            {value(
                              r,
                              "due_date",
                              value(r, "date", value(r, "source_type")),
                            )}
                          </p>
                        </TableCell>
                        <TableCell>
                          {Boolean(r.state) && (
                            <Badge variant="secondary">
                              {value(r, "state").replaceAll("_", " ")}
                            </Badge>
                          )}
                          {Boolean(r.amount) && (
                            <p>
                              {value(r, "currency")}{" "}
                              {decimal(value(r, "amount", "0"))}
                            </p>
                          )}
                          {Boolean(r.outstanding) && (
                            <small>
                              <Localized>{" Outstanding"}</Localized>{" "}
                              {decimal(value(r, "outstanding", "0"))}
                            </small>
                          )}
                          {Boolean(r.dispatch) && (
                            <p className="text-xs">
                              {object(r, "dispatch").cleared ? (
                                <Localized>{"Cleared"}</Localized>
                              ) : (
                                <Localized>{"Financial hold"}</Localized>
                              )}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {tab !== "aging" && (
                            <RowActions>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelected(r.id)}
                              >
                                <Localized>{" Open details "}</Localized>
                              </Button>
                            </RowActions>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {result.data.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <p className="erp-empty">
                            <Localized>
                              {" No records match these filters. "}
                            </Localized>
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </AdvancedRecordsTable>
            </div>
            {tab !== "aging" && (
              <DataPagination
                count={result.data.rows.length}
                loading={result.loading}
                page={page}
                total={result.data.total}
                pageSize={result.data.page_size}
                onPageChange={setPage}
              />
            )}
          </>
        )}
        {selected && (
          <Detail
            entity={entity}
            id={selected}
            onClose={() => setSelected(null)}
            onChange={result.refresh}
          />
        )}
        {action && (
          <ERPModal
            title={human(action)}
            description=""
            onClose={() => setAction(null)}
          >
            <WorkflowForm
              action={action}
              onDone={() => {
                setAction(null);
                result.refresh();
              }}
            />
          </ERPModal>
        )}
      </div>
    </ERPModuleGuard>
  );
}
