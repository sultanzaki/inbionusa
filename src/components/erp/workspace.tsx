"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { RecordOverview } from "@/components/workspace/record-overview";
import { useWorkPosition } from "@/components/workspace/use-work-position";
import { useFileDownload } from "@/components/workspace/use-file-download";
import { useTableState } from "@/components/tables/use-table-state";
import { AdvancedRecordsTable } from "@/components/tables/advanced-records-table";
import { TransactionControls } from "./transaction-controls";
import { DocumentFlow, DispatchReadiness } from "./document-flow";
import { WorkflowForm } from "./workflows/forms";
import { ERPModal as ContextModal } from "./shared";
import { ModuleInsights } from "./module-insights";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  SeriesForm,
  ReturnForm,
  ReturnDetail,
  LotTrace,
} from "./release-workflows";
import Link from "next/link";
import { Plus, Eye, FileDown, ExternalLink, ArrowUpRight } from "lucide-react";
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
import { CopyValue, useSearchSeed } from "@/components/workspace/data-tools";
import { useERPPage } from "./data";
import { useERP } from "./context";
import {
  ERPModal,
  ERPForm,
  ERPField,
  ERPActionButton,
  ERPModuleGuard,
} from "./shared";
import {
  MoveForm,
  QuoteForm,
  CustomerForm,
  CountForm,
  CountEntryForm,
  CountAddForm,
  ReserveForm,
  DeliveryForm,
  ConfigurationForm,
  AssignCountForm,
} from "./forms";
import {
  decimal,
  type ERPRow,
  type ERPLine,
  type ERPAction,
  type ModuleKey,
  type CountLine,
  type OrderLine,
} from "@/lib/erp/schema";
type Area = "warehouse" | "production" | "sales" | "settings";
const sections: Record<
  Area,
  { key: string; label: string; create?: string; action?: ERPAction }[]
> = {
  warehouse: [
    { key: "stock", label: "Stock" },
    { key: "movements", label: "Movements", create: "New movement" },
    { key: "counts", label: "Stock counts", create: "Plan count" },
    { key: "lots", label: "Lots & traceability" },
    { key: "returns", label: "Returns", create: "Request return" },
    { key: "fulfillment", label: "Dispatch" },
    { key: "ledger", label: "Stock ledger" },
  ],
  production: [
    { key: "production", label: "Finished goods", create: "Record production" },
  ],
  sales: [
    { key: "quotes", label: "Quotations", create: "New quotation" },
    { key: "orders", label: "Sales orders" },
    { key: "customers", label: "Customers", create: "New customer" },
  ],
  settings: [
    { key: "modules", label: "Modules" },
    { key: "series", label: "Product series", create: "Set series" },
    { key: "units", label: "Units", create: "Add unit", action: "save_unit" },
    {
      key: "catalog",
      label: "Product units",
      create: "Configure conversion",
      action: "save_conversion",
    },
    {
      key: "locations",
      label: "Locations",
      create: "Add location",
      action: "save_location",
    },
    {
      key: "access",
      label: "Access",
      create: "Set access",
      action: "set_access",
    },
  ],
};
const names: Record<Area, string> = {
  warehouse: "Warehouse",
  production: "Production",
  sales: "Sales",
  settings: "Administration",
};
const descriptions: Record<Area, string> = {
  warehouse: "Stock, locations and deliveries.",
  production: "Finished batches and stock posting.",
  sales: "Quotations, orders and customers.",
  settings: "Modules, manual units, storage locations, and team access.",
};
const states: Record<string, string[]> = {
  returns: ["requested", "received", "released", "scrapped", "cancelled"],
  stock: ["quarantine", "released", "rejected"],
  lots: ["quarantine", "released", "rejected"],
  movements: ["draft", "posted", "reversed", "cancelled"],
  production: ["draft", "posted", "reversed", "cancelled"],
  counts: ["draft", "counting", "submitted", "posted", "cancelled"],
  quotes: [
    "draft",
    "pending",
    "issued",
    "accepted",
    "rejected",
    "superseded",
    "cancelled",
  ],
  orders: ["confirmed", "fulfilled", "closed"],
  fulfillment: ["confirmed", "fulfilled", "closed"],
};
function Status({ value }: { value?: string }) {
  return (
    <Badge
      variant={
        ["rejected", "cancelled", "expired"].includes(value || "")
          ? "destructive"
          : "default"
      }
    >
      {(value || "—").replaceAll("_", " ")}
    </Badge>
  );
}
function summary(entity: string, row: ERPRow) {
  if (entity === "stock") return `${row.lot_number} · ${row.location}`;
  if (entity === "quotes") return `${row.customer} · Revision ${row.revision}`;
  if (entity === "orders" || entity === "fulfillment") return row.customer;
  if (entity === "lots") return row.product;
  if (entity === "ledger") return `${row.product} · ${row.lot_number}`;
  if (entity === "catalog")
    return (
      row.units
        ?.map(
          (u) =>
            `${u.code} × ${decimal(u.factor)}${u.is_base ? " (base)" : ""}`,
        )
        .join(" · ") || "Base unit not configured"
    );
  if (entity === "series")
    return row.series ? "Series " + row.series : "Series not configured";
  if (entity === "returns") return `${row.product} · ${row.lot_number}`;
  if (entity === "access")
    return `${row.module} · Read ${row.can_read ? "yes" : "no"} · Write ${row.can_write ? "yes" : "no"} · Approve ${row.can_approve ? "yes" : "no"}`;
  return row.reason || row.location || row.destination || row.name || "";
}
function identity(row: ERPRow) {
  return (
    row.number ||
    row.product ||
    row.label ||
    row.name ||
    row.code ||
    row.username ||
    row.id
  );
}
export function ERPWorkspace({ area }: { area: Area }) {
  const { t: localize } = useLocale();

  const erp = useERP(),
    tabs = sections[area];
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const [tab, setTab] = useState(tabs[0].key),
    [search, setSearch] = useState(""),
    [state, setState] = useState(""),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(
      area === "sales" && params.has("opportunity") && params.has("customer"),
    ),
    [detail, setDetail] = useState<{ entity: string; id: string } | null>(() =>
      params.get("record")
        ? {
            entity: params.get("view") || tabs[0].key,
            id: params.get("record")!,
          }
        : null,
    ),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const view = params.get("view");
    if (view && tabs.some((t) => t.key === view)) {
      const t = setTimeout(() => {
        setTab(view);
        setSearch(params.get("q") || "");
        setState(params.get("state") || "");
        const p = Number(params.get("page") || 1);
        setPage(Number.isSafeInteger(p) && p > 0 && p <= 1000000 ? p : 1);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [params, tabs]);
  const positionReady = useWorkPosition(
    tab,
    { q: search, state, page },
    (saved) => {
      setSearch(saved.q);
      setState(saved.state);
      setPage(saved.page);
    },
  );
  function listURL(q = search, s = state, p = page) {
    const next = new URLSearchParams({ view: tab });
    if (q) next.set("q", q);
    if (s) next.set("state", s);
    if (p > 1) next.set("page", String(p));
    router.replace(pathname + "?" + next, { scroll: false });
  }
  const table = useTableState(tab === "modules" ? "units" : tab, () =>
    setPage(1),
  );
  const config = tabs.find((t) => t.key === tab)!,
    result = useERPPage(
      tab === "modules" ? "units" : tab,
      search,
      state,
      page,
      undefined,
      table.ready && positionReady,
      undefined,
      table.query,
    );
  useSearchSeed((q) => {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view && tabs.some((t) => t.key === view)) setTab(view);
    setSearch(q);
    setPage(
      Number(new URLSearchParams(window.location.search).get("page")) || 1,
    );
  });
  const canWrite =
    area === "settings"
      ? Boolean(erp.data?.admin)
      : erp.can(area as ModuleKey, "write");
  function done(id?: string, entity?: string) {
    setCreate(false);
    result.refresh();
    setRefresh((v) => v + 1);
    if (area === "settings") erp.refresh();
    if (
      id &&
      [
        "movements",
        "production",
        "quotes",
        "orders",
        "counts",
        "customers",
        "returns",
      ].includes(entity || tab)
    ) {
      setDetail({ entity: entity || tab, id });
      if (entity && tabs.some((t) => t.key === entity)) setTab(entity);
    }
  }
  function body() {
    return (
      <div className="page-stack erp-workspace">
        <PageHeader
          eyebrow={names[area]}
          title={area === "settings" ? "Workspace settings" : names[area]}
          description={descriptions[area]}
        >
          {config.create && canWrite && (
            <Button onClick={() => setCreate(true)}>
              <Plus className="size-4" />
              {config.create}
            </Button>
          )}
        </PageHeader>
        <nav
          className="erp-section-tabs"
          aria-label={names[area] + " sections"}
        >
          {tabs.map((t) => (
            <button
              type="button"
              aria-current={tab === t.key ? "page" : undefined}
              key={t.key}
              onClick={() => {
                router.replace(pathname + "?view=" + t.key, { scroll: false });
                setTab(t.key);
                setSearch("");
                setState("");
                setPage(1);
              }}
            >
              <Localized>{t.label}</Localized>
            </button>
          ))}
        </nav>
        {area !== "settings" && <ModuleInsights module={area} />}
        {tab === "modules" ? (
          <div className="erp-module-cards">
            {erp.data?.modules.map((m) => (
              <article key={m.key}>
                <div>
                  <h2>{m.key[0].toUpperCase() + m.key.slice(1)}</h2>
                  <Status value={m.state} />
                </div>
                <p>
                  {m.key === "production" ? (
                    <Localized>
                      {"Finished-goods recording requires an active Warehouse."}
                    </Localized>
                  ) : m.key === "quality" ? (
                    <Localized>
                      {"Inspections, lot release, and COAs."}
                    </Localized>
                  ) : m.key === "warehouse" ? (
                    <Localized>
                      {"Stock, movements, counts, and dispatch."}
                    </Localized>
                  ) : m.key === "purchase" ? (
                    <Localized>
                      {"Suppliers, material purchases and partial receiving."}
                    </Localized>
                  ) : m.key === "crm" ? (
                    <Localized>
                      {"Opportunities, customer relationships and follow-up."}
                    </Localized>
                  ) : m.key === "documents" ? (
                    <Localized>
                      {"Product documents, controlled revisions and expiry."}
                    </Localized>
                  ) : m.key === "finance" ? (
                    <Localized>
                      {
                        "Operational billing, verified payments and dispatch credit controls. Disabled until you activate it."
                      }
                    </Localized>
                  ) : m.key === "service" ? (
                    <Localized>
                      {
                        "Claims, customer receipt evidence, retests and accountable resolution."
                      }
                    </Localized>
                  ) : (
                    <Localized>
                      {"Customers, quotations, and sales orders."}
                    </Localized>
                  )}
                </p>
                <div className="erp-actions">
                  {(["active", "read_only", "disabled"] as const)
                    .filter((s) => s !== m.state)
                    .map((s) => (
                      <ERPActionButton
                        key={s}
                        action="set_module"
                        payload={{ module: m.key, state: s }}
                        onDone={() => {
                          erp.refresh();
                          result.refresh();
                        }}
                        destructive={s === "disabled"}
                      >
                        {s === "active" ? (
                          <Localized>{"Activate"}</Localized>
                        ) : s === "read_only" ? (
                          <Localized>{"Read-only"}</Localized>
                        ) : (
                          <Localized>{"Disable"}</Localized>
                        )}
                      </ERPActionButton>
                    ))}
                </div>
              </article>
            ))}
            <p className="erp-notice">
              <Localized>
                {
                  " Disabled modules block direct URLs, APIs, and new transactions. History is retained. Open work can prevent disabling; use read-only to pause operations. "
                }
              </Localized>
            </p>
          </div>
        ) : (
          <>
            <div className="erp-toolbar">
              <Input
                aria-label={localize("Search records")}
                data-search-input
                placeholder={localize("Search records…")}
                value={search}
                maxLength={100}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  listURL(e.target.value, state, 1);
                }}
              />
              {states[tab] && (
                <select
                  aria-label={localize("Filter status")}
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setPage(1);
                    listURL(search, e.target.value, 1);
                  }}
                >
                  <option value="">
                    <Localized>{"All statuses"}</Localized>
                  </option>
                  {states[tab].map((s) => (
                    <option key={s} value={s}>
                      <Localized>{s.replaceAll("_", " ")}</Localized>
                    </option>
                  ))}
                </select>
              )}
              <span>
                {result.loading ? (
                  <Localized>{"Loading…"}</Localized>
                ) : (
                  localize(
                    `${result.data.total.toLocaleString("en-GB")} records`,
                  )
                )}
              </span>
              <Button variant="outline" size="sm" onClick={result.refresh}>
                <Localized>{" Refresh "}</Localized>
              </Button>
            </div>
            {result.error ? (
              <div role="alert" className="erp-empty">
                <p>
                  <Localized>{result.error}</Localized>
                </p>
                <Button onClick={result.refresh} variant="outline">
                  <Localized>{" Retry "}</Localized>
                </Button>
              </div>
            ) : (
              <div className={"data-card"}>
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
                    (tab === "modules" ? "units" : tab) +
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
                          {tab === "stock" ? (
                            <Localized>{"On hand"}</Localized>
                          ) : tab === "ledger" ? (
                            <Localized>{"Change"}</Localized>
                          ) : tab === "catalog" ? (
                            <Localized>{"Units"}</Localized>
                          ) : (
                            <Localized>{"Details"}</Localized>
                          )}
                        </TableHead>
                        <TableHead>
                          {tab === "stock" ? (
                            <Localized>{"Available"}</Localized>
                          ) : (
                            <Localized>{"Status"}</Localized>
                          )}
                        </TableHead>
                        <TableHead className="text-right">
                          <Localized>{"Actions"}</Localized>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.loading ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <p className="erp-empty" role="status">
                              <Localized>{" Loading records… "}</Localized>
                            </p>
                          </TableCell>
                        </TableRow>
                      ) : result.data.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="erp-empty">
                              <h2>
                                {search || state ? (
                                  <Localized>{"No matching records"}</Localized>
                                ) : (
                                  <Localized>{"No records yet"}</Localized>
                                )}
                              </h2>
                              <p>
                                {search || state ? (
                                  <Localized>
                                    {
                                      "Try another search or clear your filters."
                                    }
                                  </Localized>
                                ) : (
                                  <Localized>
                                    {"Create a record to start this workflow."}
                                  </Localized>
                                )}
                              </p>
                              {(search || state) && (
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setSearch("");
                                    setState("");
                                    setPage(1);
                                    listURL("", "", 1);
                                  }}
                                >
                                  <Localized>{" Clear filters "}</Localized>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        result.data.rows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <button
                                type="button"
                                className="entity-name text-left"
                                onClick={() =>
                                  setDetail({ entity: tab, id: row.id })
                                }
                              >
                                {identity(row)}
                              </button>
                              <p className="erp-row-description">
                                {summary(tab, row)}
                              </p>
                              <CopyValue
                                value={row.number || row.code || row.id}
                              />
                            </TableCell>
                            <TableCell
                              data-label={
                                tab === "stock" ? "On hand" : undefined
                              }
                            >
                              {tab === "stock"
                                ? `${decimal(row.on_hand)} ${row.unit}`
                                : tab === "ledger"
                                  ? `${decimal(row.delta)} ${row.unit || ""}`
                                  : tab === "catalog"
                                    ? row.units?.find((u) => u.is_base)
                                        ?.code || (
                                        <Localized>
                                          {"Not configured"}
                                        </Localized>
                                      )
                                    : row.date ||
                                      row.location ||
                                      row.contact ||
                                      row.code ||
                                      "—"}
                            </TableCell>
                            <TableCell
                              data-label={
                                tab === "stock" ? "Available" : undefined
                              }
                            >
                              {tab === "stock" ? (
                                <>
                                  <strong>
                                    {decimal(row.available)} {row.unit}
                                  </strong>
                                  <p className="erp-row-description">
                                    {decimal(row.reserved)}{" "}
                                    <Localized>{" reserved "}</Localized>
                                  </p>
                                </>
                              ) : row.state ? (
                                <Status
                                  value={row.display_state || row.state}
                                />
                              ) : row.can_read !== undefined ? (
                                row.can_write ? (
                                  "Can write"
                                ) : (
                                  "Read only"
                                )
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <RowActions>
                                <button
                                  type="button"
                                  className="row-action"
                                  aria-label={localize("View record")}
                                  onClick={() =>
                                    setDetail({ entity: tab, id: row.id })
                                  }
                                >
                                  <Eye className="size-4" />
                                </button>
                              </RowActions>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </AdvancedRecordsTable>
              </div>
            )}
            <DataPagination
              count={result.data.rows.length}
              total={result.data.total}
              page={page}
              pageSize={50}
              loading={result.loading}
              onPageChange={(p) => {
                setPage(p);
                listURL(search, state, p);
              }}
            />
          </>
        )}
        {create && (
          <ERPModal
            title={config.create || "New record"}
            description=""
            onClose={() => setCreate(false)}
          >
            {tab === "series" ? (
              <SeriesForm onDone={done} />
            ) : tab === "returns" ? (
              <ReturnForm onDone={done} />
            ) : tab === "quotes" ? (
              <QuoteForm onDone={done} />
            ) : tab === "customers" ? (
              <CustomerForm onDone={done} />
            ) : tab === "counts" ? (
              <CountForm onDone={done} />
            ) : tab === "movements" || tab === "production" ? (
              <MoveForm production={tab === "production"} onDone={done} />
            ) : config.action ? (
              <ConfigurationForm action={config.action} onDone={done} />
            ) : null}
          </ERPModal>
        )}
        {detail && (
          <RecordDetail
            key={detail.entity + detail.id + refresh}
            {...detail}
            onClose={() => setDetail(null)}
            onDone={done}
          />
        )}
      </div>
    );
  }
  if (area === "settings")
    return erp.data && !erp.data.admin ? (
      <div className="erp-empty">
        <Localized>{"Administrator access required."}</Localized>
      </div>
    ) : (
      body()
    );
  return <ERPModuleGuard module={area as ModuleKey}>{body()}</ERPModuleGuard>;
}
function RecordDetail({
  entity,
  id,
  onClose,
  onDone,
}: {
  entity: string;
  id: string;
  onClose: () => void;
  onDone: (id?: string, entity?: string) => void;
}) {
  const { t: localize } = useLocale();

  const result = useERPPage(entity, "", "", 1, id),
    row = result.data.rows[0],
    erp = useERP();
  const [edit, setEdit] = useState(false),
    [pdf, setPdf] = useState(false),
    [subForm, setSubForm] = useState<{
      type: string;
      line?: CountLine | OrderLine;
    } | null>(null),
    [customerRef, setCustomerRef] = useState("");
  const [billingKind, setBillingKind] = useState<string | null>(null);
  const done = (nextId?: string, nextEntity?: string) => {
    setEdit(false);
    setSubForm(null);
    result.refresh();
    onDone(nextEntity ? nextId || id : id, nextEntity || entity);
  };
  const movement = ["movements", "production"].includes(entity),
    count = entity === "counts",
    quote = entity === "quotes",
    order = ["orders", "fulfillment"].includes(entity),
    customer = entity === "customers";
  const scope: ModuleKey =
      entity === "production"
        ? "production"
        : quote || entity === "orders" || customer
          ? "sales"
          : "warehouse",
    write = erp.can(scope, "write"),
    approve = erp.can(scope, "approve");
  const docURL = "/api/erp/documents/" + entity + "/" + id;
  const fileDownload = useFileDownload();
  return (
    <ERPModal
      layout="record"
      loading={result.loading}
      title={row?.number || row?.product || row?.name || "Record details"}
      description={
        row?.state
          ? "Status: " + (row.display_state || row.state).replaceAll("_", " ")
          : ""
      }
      onClose={onClose}
    >
      {result.loading ? (
        <p role="status">
          <Localized>{"Loading details…"}</Localized>
        </p>
      ) : result.error ? (
        <div role="alert">
          <p>
            <Localized>{result.error}</Localized>
          </p>
          <Button onClick={result.refresh}>
            <Localized>{"Retry"}</Localized>
          </Button>
        </div>
      ) : !row ? (
        <p>
          <Localized>{"Record not found."}</Localized>
        </p>
      ) : (
        <>
          <RecordOverview row={row} entity={entity} />
          {(order || quote || movement) && (
            <>
              <DocumentFlow entity={entity} id={id} />
              <TransactionControls
                entity={entity}
                id={id}
                currency={row.currency || "IDR"}
                onDone={() => {
                  result.refresh();
                  onDone(id, entity);
                }}
              />
            </>
          )}
          {movement &&
            row.kind === "delivery" &&
            row.state === "draft" &&
            row.order_id && (
              <DispatchReadiness orderId={row.order_id} movementId={id} />
            )}
          {order && erp.can("finance", "write") && (
            <div className="erp-actions">
              <Button
                size="sm"
                variant="outline"
                disabled={row.state === "closed"}
                onClick={() => setBillingKind("payment_request")}
              >
                <Localized>{" Request down payment "}</Localized>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBillingKind("invoice")}
              >
                <Localized>{" Create invoice "}</Localized>
              </Button>
            </div>
          )}
          {billingKind && (
            <ContextModal
              title={
                billingKind === "invoice"
                  ? "Create invoice"
                  : "Request down payment"
              }
              description=""
              onClose={() => setBillingKind(null)}
            >
              <WorkflowForm
                action="fin_create_document"
                row={{
                  id: row.id,
                  _source: {
                    id: row.id,
                    number: row.number,
                    label: row.number,
                  },
                  _kind: billingKind,
                }}
                onDone={() => {
                  setBillingKind(null);
                  result.refresh();
                }}
              />
            </ContextModal>
          )}
          {entity === "lots" && <LotTrace row={row} onDone={done} />}
          {entity === "returns" && <ReturnDetail row={row} onDone={done} />}
          {quote && row.state === "accepted" && (
            <section
              className="erp-conversion-panel"
              aria-label={localize("Sales order conversion")}
            >
              <h3 className="text-sm font-semibold">
                {row.sales_order ? (
                  <Localized>{"Sales order created"}</Localized>
                ) : (
                  <Localized>{"Create sales order"}</Localized>
                )}
              </h3>
              {row.sales_order ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted">
                    <Localized>{" This quotation is linked to "}</Localized>
                    {row.sales_order.number} ({row.sales_order.state}).
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => done(row.sales_order!.id, "orders")}
                  >
                    <Localized>{" Open sales order "}</Localized>
                  </Button>
                </div>
              ) : write ? (
                <ERPForm
                  action="convert_quote"
                  payload={{ id, customer_reference: customerRef }}
                  onDone={done}
                  label="Create sales order"
                >
                  <ERPField label="Customer reference (optional)">
                    <Input
                      value={customerRef}
                      maxLength={1000}
                      onChange={(e) => setCustomerRef(e.target.value)}
                    />
                  </ERPField>
                </ERPForm>
              ) : (
                <p className="text-xs text-muted">
                  <Localized>
                    {
                      " Sales write access and an active Sales module are required to create an order. Contact your administrator. "
                    }
                  </Localized>
                </p>
              )}
            </section>
          )}
          <div className="erp-detail-summary">
            {row.customer && (
              <p>
                <span>
                  <Localized>{"Customer"}</Localized>
                </span>
                <strong>{row.customer}</strong>
              </p>
            )}
            {row.location && (
              <p>
                <span>
                  <Localized>{"Location"}</Localized>
                </span>
                <strong>{row.location}</strong>
              </p>
            )}
            {row.date && (
              <p>
                <span>
                  <Localized>{"Date"}</Localized>
                </span>
                <strong>{row.date}</strong>
              </p>
            )}
            {row.expiry_date && (
              <p>
                <span>
                  <Localized>{"Expiry"}</Localized>
                </span>
                <strong>{row.expiry_date}</strong>
              </p>
            )}
            {row.reason && (
              <p>
                <span>
                  <Localized>{"Reference"}</Localized>
                </span>
                <strong>{row.reason}</strong>
              </p>
            )}
            {row.assigned && (
              <p>
                <span>
                  <Localized>{"Assigned to"}</Localized>
                </span>
                <strong>{row.assigned}</strong>
              </p>
            )}
          </div>
          <div className="erp-actions">
            {(movement || quote) && (
              <Button variant="outline" size="sm" onClick={() => setPdf(true)}>
                <Eye className="size-3.5" />
                <Localized>{" Preview PDF "}</Localized>
              </Button>
            )}
            {(movement || quote) && (
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(fileDownload.busy)}
                loading={fileDownload.busy === "pdf"}
                onClick={() =>
                  void fileDownload.download(
                    docURL + "?download=1",
                    `${row.number || "document"}.pdf`,
                    "pdf",
                  )
                }
              >
                {!fileDownload.busy && <FileDown className="size-3.5" />}
                {fileDownload.busy === "pdf" ? (
                  <Localized>{"Preparing PDF…"}</Localized>
                ) : (
                  <Localized>{"Download PDF"}</Localized>
                )}
              </Button>
            )}
            {movement && row.state === "draft" && write && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={row.kind === "delivery"}
                  onClick={() => setEdit(true)}
                >
                  <Localized>{" Edit draft "}</Localized>
                </Button>
                <ERPActionButton
                  action="post_move"
                  payload={{ id, version: row.version }}
                  onDone={done}
                >
                  <Localized>{" Post movement "}</Localized>
                </ERPActionButton>
                <ERPActionButton
                  action="cancel_move"
                  payload={{ id }}
                  onDone={done}
                  reason
                  destructive
                >
                  <Localized>{" Cancel draft "}</Localized>
                </ERPActionButton>
              </>
            )}
            {movement &&
              row.state === "posted" &&
              approve &&
              row.kind !== "reversal" &&
              (row.kind !== "delivery" || erp.can("sales", "approve")) && (
                <ERPActionButton
                  action="reverse_move"
                  payload={{ id }}
                  onDone={done}
                  reason
                  destructive
                >
                  <Localized>{" Reverse movement "}</Localized>
                </ERPActionButton>
              )}
            {customer && write && (
              <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
                <Localized>{" Edit customer "}</Localized>
              </Button>
            )}
            {quote && write && row.state === "draft" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEdit(true)}
                >
                  <Localized>{" Edit draft "}</Localized>
                </Button>
                <ERPActionButton
                  action="issue_quote"
                  payload={{ id, version: row.version }}
                  onDone={done}
                >
                  <Localized>{" Issue / request approval "}</Localized>
                </ERPActionButton>
              </>
            )}
            {quote && approve && row.state === "pending" && (
              <>
                <ERPActionButton
                  action="approve_quote"
                  payload={{ id, version: row.version }}
                  onDone={done}
                  reason
                >
                  <Localized>{" Approve quotation "}</Localized>
                </ERPActionButton>
                <ERPActionButton
                  action="return_quote"
                  payload={{ id }}
                  onDone={done}
                  reason
                >
                  <Localized>{" Return for changes "}</Localized>
                </ERPActionButton>
              </>
            )}
            {quote &&
              write &&
              row.state === "issued" &&
              row.display_state !== "expired" && (
                <>
                  <ERPActionButton
                    action="accept_quote"
                    payload={{ id }}
                    onDone={done}
                  >
                    <Localized>{" Mark accepted "}</Localized>
                  </ERPActionButton>
                  <ERPActionButton
                    action="reject_quote"
                    payload={{ id }}
                    onDone={done}
                  >
                    <Localized>{" Mark rejected "}</Localized>
                  </ERPActionButton>
                </>
              )}
            {quote &&
              write &&
              ["issued", "rejected", "superseded"].includes(
                row.state || "",
              ) && (
                <ERPActionButton
                  action="revise_quote"
                  payload={{ id }}
                  onDone={done}
                >
                  <Localized>{" Create revision "}</Localized>
                </ERPActionButton>
              )}
            {quote &&
              write &&
              ["draft", "pending", "issued"].includes(row.state || "") && (
                <ERPActionButton
                  action="cancel_quote"
                  payload={{ id }}
                  onDone={done}
                  reason
                  destructive
                >
                  <Localized>{" Cancel quotation "}</Localized>
                </ERPActionButton>
              )}
            {count && approve && row.state === "draft" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSubForm({ type: "assign_count" })}
              >
                <Localized>{" Assign counter "}</Localized>
              </Button>
            )}
            {count && write && row.state === "draft" && (
              <ERPActionButton
                action="start_count"
                payload={{ id }}
                onDone={done}
              >
                <Localized>{" Start count & freeze location "}</Localized>
              </ERPActionButton>
            )}
            {count && write && row.state === "counting" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSubForm({ type: "count_add" })}
                >
                  <Localized>{" Add unlisted lot "}</Localized>
                </Button>
                <ERPActionButton
                  action="submit_count"
                  payload={{ id }}
                  onDone={done}
                >
                  <Localized>{" Submit count "}</Localized>
                </ERPActionButton>
              </>
            )}
            {count && approve && row.state === "submitted" && (
              <ERPActionButton
                action="approve_count"
                payload={{ id }}
                onDone={done}
                reason
              >
                <Localized>{" Approve adjustment "}</Localized>
              </ERPActionButton>
            )}
            {count &&
              write &&
              ["draft", "counting", "submitted"].includes(row.state || "") && (
                <ERPActionButton
                  action="cancel_count"
                  payload={{ id }}
                  onDone={done}
                  reason
                  destructive
                >
                  <Localized>{" Cancel count "}</Localized>
                </ERPActionButton>
              )}
            {entity === "lots" &&
              erp.can("warehouse", "approve") &&
              erp.data?.modules.find((m) => m.key === "quality")?.state ===
                "disabled" && (
                <ERPActionButton
                  action="release_lot"
                  payload={{ id, release: row.qc_status !== "released" }}
                  onDone={done}
                  reason
                >
                  {row.qc_status === "released" ? (
                    <Localized>{"Return to quarantine"}</Localized>
                  ) : (
                    <Localized>{"Approve manual release"}</Localized>
                  )}
                </ERPActionButton>
              )}
          </div>
          {(movement || quote) && (
            <div className="erp-detail-lines">
              {row.lines?.map((l, i) => (
                <article key={i}>
                  <div>
                    <h3>{l.product}</h3>
                    <p>
                      {l.code}
                      {l.lot ? " · " + l.lot : ""}
                    </p>
                  </div>
                  <strong>
                    {decimal(l.quantity || l.base_quantity)}{" "}
                    {l.unit || l.base_unit}
                  </strong>
                  {quote && (
                    <p>
                      {row.currency} {decimal(l.price)}{" "}
                      <Localized>{" per "}</Localized>
                      {l.unit} <Localized>{" · Discount"}</Localized>{" "}
                      {decimal(l.discount)}
                      <Localized>{"% · Amount "}</Localized>
                      {decimal(l.amount)}
                    </p>
                  )}
                  {movement &&
                    row.kind === "delivery" &&
                    ["posted", "reversed"].includes(row.state || "") &&
                    Boolean(
                      (row.snapshot?.lines as ERPLine[] | undefined)?.[i]?.coa,
                    ) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(fileDownload.busy)}
                        loading={fileDownload.busy === `coa-${i}`}
                        onClick={() =>
                          void fileDownload.download(
                            docURL + "/coa/" + i + "?download=1",
                            "COA.pdf",
                            `coa-${i}`,
                          )
                        }
                      >
                        {fileDownload.busy === `coa-${i}` ? (
                          <Localized>{"Preparing COA…"}</Localized>
                        ) : (
                          <Localized>{"Download attached COA"}</Localized>
                        )}
                      </Button>
                    )}
                </article>
              ))}
            </div>
          )}
          {quote && row.totals && (
            <div className="erp-totals">
              {Object.entries(row.totals).map(([k, v]) => (
                <p key={k}>
                  <span>{k}</span>
                  <strong>
                    {row.currency} {decimal(v)}
                  </strong>
                </p>
              ))}
            </div>
          )}
          {quote && (row.terms || row.delivery_terms || row.lead_time) && (
            <div className="erp-notice">
              {row.lead_time && (
                <p>
                  <Localized>{"Lead time: "}</Localized>
                  {row.lead_time}
                </p>
              )}
              {row.terms && (
                <p>
                  <Localized>{"Terms: "}</Localized>
                  {row.terms}
                </p>
              )}
              {row.delivery_terms && (
                <p>
                  <Localized>{"Delivery: "}</Localized>
                  {row.delivery_terms}
                </p>
              )}
            </div>
          )}
          {count && (
            <>
              <p className="erp-notice">
                {row.blind ? (
                  <Localized>
                    {
                      "Blind count. System quantities are hidden on this count sheet while counting; approvers can review them."
                    }
                  </Localized>
                ) : (
                  <Localized>{"System quantities are visible."}</Localized>
                )}{" "}
                <Localized>
                  {
                    " Counting/submitted locations are frozen until approved or cancelled. "
                  }
                </Localized>
              </p>
              <CountLines
                countId={id}
                editable={write && row.state === "counting"}
                onEntry={(line) => setSubForm({ type: "count_line", line })}
              />
            </>
          )}
          {order && (
            <>
              <div className="erp-actions">
                {row.state === "confirmed" && erp.can("warehouse", "write") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSubForm({ type: "delivery" })}
                  >
                    <Localized>{" Create delivery "}</Localized>
                  </Button>
                )}
              </div>
              <div className="erp-detail-lines">
                {((row.lines as unknown as OrderLine[]) || []).map((l) => (
                  <article key={l.id}>
                    <h3>{l.product}</h3>
                    <p>
                      {decimal(l.quantity)} {l.unit}{" "}
                      <Localized>{" ordered ·"}</Localized>{" "}
                      {decimal(l.delivered)}{" "}
                      <Localized>{" delivered · "}</Localized>
                      {decimal(l.reserved)}{" "}
                      <Localized>{" reserved "}</Localized>
                    </p>
                    {row.state === "confirmed" &&
                      erp.can("sales", "write") &&
                      erp.can("warehouse") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSubForm({ type: "reserve", line: l })
                          }
                        >
                          <Localized>{" Reserve stock "}</Localized>
                        </Button>
                      )}
                  </article>
                ))}
              </div>
              <h3 className="erp-section-title">
                <Localized>{"Reservations"}</Localized>
              </h3>
              <div className="erp-detail-lines">
                {row.reservations?.map((r) => (
                  <article key={r.id}>
                    <h3>
                      {r.product} · {r.lot}
                    </h3>
                    <p>
                      {r.location} · {decimal(r.remaining)} {r.unit}{" "}
                      <Localized>{" remaining ·"}</Localized> {r.state}
                    </p>
                    {r.state === "active" && erp.can("sales", "write") && (
                      <ERPActionButton
                        action="unreserve"
                        payload={{ id: r.id }}
                        onDone={done}
                        reason
                      >
                        <Localized>{" Release reservation "}</Localized>
                      </ERPActionButton>
                    )}
                  </article>
                ))}
              </div>
              <h3 className="erp-section-title">
                <Localized>{"Deliveries"}</Localized>
              </h3>
              <div className="erp-detail-lines">
                {row.deliveries?.map((d) => (
                  <article key={d.id}>
                    <button
                      type="button"
                      className="entity-name"
                      onClick={() => onDone(d.id, "movements")}
                    >
                      {d.number}
                      <ArrowUpRight className="inline size-3.5" />
                    </button>
                    <Status value={d.state} />
                  </article>
                ))}
              </div>
            </>
          )}
          {entity === "stock" && (
            <div className="erp-detail-summary">
              <p>
                <span>
                  <Localized>{"Physical stock"}</Localized>
                </span>
                <strong>
                  {decimal(row.on_hand)} {row.unit}
                </strong>
              </p>
              <p>
                <span>
                  <Localized>{"Reserved"}</Localized>
                </span>
                <strong>
                  {decimal(row.reserved)} {row.unit}
                </strong>
              </p>
              <p>
                <span>
                  <Localized>{"Available to sell"}</Localized>
                </span>
                <strong>
                  {decimal(row.available)} {row.unit}
                </strong>
              </p>
              <p>
                <span>
                  <Localized>{"QC status"}</Localized>
                </span>
                <strong>{row.qc_status}</strong>
              </p>
            </div>
          )}
          {customer && (
            <div className="erp-detail-summary">
              {(
                [
                  "contact",
                  "email",
                  "phone",
                  "tax_id",
                  "billing_address",
                  "shipping_address",
                  "payment_terms",
                ] as const
              ).map((k) => (
                <p key={k}>
                  <span>
                    <Localized>{k.replaceAll("_", " ")}</Localized>
                  </span>
                  <strong>{row[k] || "—"}</strong>
                </p>
              ))}
            </div>
          )}
          {entity === "catalog" && (
            <div className="erp-detail-lines">
              {row.units?.map((u) => (
                <article key={u.id}>
                  <h3>
                    {u.code}
                    {u.is_base ? <Localized>{" · base unit"}</Localized> : ""}
                  </h3>
                  <p>
                    <Localized>{"Conversion factor: "}</Localized>
                    {decimal(u.factor)}
                  </p>
                </article>
              ))}
            </div>
          )}
          {edit && (
            <ERPModal
              title={
                quote
                  ? "Edit quotation"
                  : customer
                    ? "Edit customer"
                    : "Edit movement"
              }
              description="Only drafts can be changed. Server versions prevent stale updates."
              onClose={() => setEdit(false)}
            >
              {quote ? (
                <QuoteForm row={row} onDone={done} />
              ) : customer ? (
                <CustomerForm row={row} onDone={done} />
              ) : (
                <MoveForm
                  row={row}
                  production={row.kind === "production"}
                  onDone={done}
                />
              )}
            </ERPModal>
          )}
          {subForm && (
            <ERPModal
              title={
                {
                  count_line: "Enter physical count",
                  count_add: "Add unlisted lot",
                  reserve: "Reserve stock",
                  delivery: "Create delivery",
                }[subForm.type] || "Details"
              }
              description=""
              onClose={() => setSubForm(null)}
            >
              {subForm.type === "assign_count" ? (
                <AssignCountForm id={id} onDone={done} />
              ) : subForm.type === "count_line" ? (
                <CountEntryForm
                  countId={id}
                  line={subForm.line as CountLine}
                  onDone={done}
                />
              ) : subForm.type === "count_add" ? (
                <CountAddForm id={id} onDone={done} />
              ) : subForm.type === "reserve" ? (
                <ReserveForm line={subForm.line as OrderLine} onDone={done} />
              ) : (
                <DeliveryForm row={row} onDone={done} />
              )}
            </ERPModal>
          )}
          {pdf && (
            <ERPModal
              title={localize("Document preview")}
              description={
                row.state === "draft" || row.state === "pending"
                  ? "Draft preview. Not an issued document."
                  : "Generated from the recorded document snapshot."
              }
              onClose={() => setPdf(false)}
            >
              <a
                href={docURL}
                target="_blank"
                rel="noopener noreferrer"
                className="erp-document-link"
              >
                <Localized>{" Open PDF in a new tab "}</Localized>
                <ExternalLink className="size-3.5" />
              </a>
              <iframe
                title={localize("Document PDF preview")}
                src={docURL + "#toolbar=0"}
                className="erp-pdf-frame"
              />
            </ERPModal>
          )}
        </>
      )}
    </ERPModal>
  );
}
export function OperationsHome() {
  const { t: localize } = useLocale();

  const erp = useERP();
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Overview"
        title={localize("Your operation")}
        description="Choose a workspace to continue today's work."
      />
      <div className="erp-module-cards">
        {(["production", "warehouse", "sales"] as const)
          .filter((m) => erp.can(m))
          .map((m) => (
            <Link key={m} href={"/dashboard/" + m}>
              <h2>{names[m]}</h2>
              <p>{descriptions[m]}</p>
              <span>
                <Localized>{" Open workspace "}</Localized>
                <ArrowUpRight className="inline size-4" />
              </span>
            </Link>
          ))}
      </div>
      {erp.error && (
        <p role="alert">
          <Localized>{erp.error}</Localized>
        </p>
      )}
    </div>
  );
}

function CountLines({
  countId,
  editable,
  onEntry,
}: {
  countId: string;
  editable: boolean;
  onEntry: (line: CountLine) => void;
}) {
  const { t: localize } = useLocale();

  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [state, setState] = useState("");
  const result = useERPPage("count_lines", q, state, page, countId);
  return (
    <div>
      <div className="erp-toolbar">
        <Input
          aria-label={localize("Search count lines")}
          placeholder={localize("Find product or lot…")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label={localize("Count entry status")}
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">
            <Localized>{"All lines"}</Localized>
          </option>
          <option value="uncounted">
            <Localized>{"Not counted"}</Localized>
          </option>
          <option value="counted">
            <Localized>{"Counted"}</Localized>
          </option>
        </select>
      </div>
      <div className="erp-detail-lines">
        {result.loading ? (
          <p role="status">
            <Localized>{"Loading count lines…"}</Localized>
          </p>
        ) : result.error ? (
          <p role="alert">
            <Localized>{result.error}</Localized>
          </p>
        ) : (
          (result.data.rows as unknown as CountLine[]).map((l) => (
            <article key={l.lot_id}>
              <h3>
                {l.product} · {l.lot}
              </h3>
              <p>
                <Localized>{" Counted: "}</Localized>
                {decimal(l.counted)} {l.unit}
                {l.baseline !== null
                  ? ` · System: ${decimal(l.baseline)} · Difference: ${decimal(l.difference)}`
                  : ""}
              </p>
              {editable && (
                <Button size="sm" variant="outline" onClick={() => onEntry(l)}>
                  <Localized>{" Enter count "}</Localized>
                </Button>
              )}
            </article>
          ))
        )}
      </div>
      <DataPagination
        count={result.data.rows.length}
        total={result.data.total}
        page={page}
        pageSize={50}
        loading={result.loading}
        onPageChange={setPage}
      />
    </div>
  );
}
