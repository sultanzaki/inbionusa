"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { displayNumber } from "@/lib/erp/ux";
import { useFileDownload } from "@/components/workspace/use-file-download";
import {
  Fragment,
  Children,
  isValidElement,
  useState,
  useEffect,
  useEffectEvent,
  type ReactNode,
  type ReactElement,
  type MouseEventHandler,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  SlidersHorizontal,
  Bookmark,
  X,
  GripVertical,
  Pin,
  Copy,
  Download,
  RotateCcw,
} from "lucide-react";
import { toast } from "@/components/i18n/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  fieldValue,
  parseTableQuery,
  type TableQuery,
} from "@/lib/tables/schema";
import { ColumnMenu, ColumnResize } from "./column-controls";
import type { TableState } from "./use-table-state";
type El = ReactElement<{ children?: ReactNode }>;
function elements(node: ReactNode): El[] {
  return Children.toArray(node).filter(isValidElement) as El[];
}
function display(value: unknown, type?: string) {
  if (value == null || value === "") return "—";
  if (type === "number" && /^-?\d+(\.\d+)?$/.test(String(value))) {
    return displayNumber(String(value));
  }
  if (type === "boolean")
    return value === true || value === "true" ? "Yes" : "No";
  if (type === "date") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime()))
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(String(value).includes("T")
          ? { hour: "2-digit", minute: "2-digit" }
          : {}),
      }).format(date);
  }
  return String(value).replaceAll("_", " ");
}
export function AdvancedRecordsTable({
  state,
  rows,
  children,
  search = "",
  status = "",
  onRestore,
  exportURL,
  summary,
  context,
  onContext,
  visualization,
}: {
  state: TableState;
  rows: Record<string, unknown>[];
  children: ReactNode;
  visualization?: ReactNode;
  search?: string;
  status?: string;
  onRestore?: (search: string, state: string) => void;
  exportURL?: string;
  summary?: { field: string; unit: string; total: string }[];
  context?: Record<string, string>;
  onContext?: (context: Record<string, string>) => void;
}) {
  const { t: localize } = useLocale();

  const fileDownload = useFileDownload();
  const { columns, query, layout } = state;
  const [panel, setPanel] = useState<
      "filters" | "columns" | "views" | "sort" | null
    >(null),
    [draft, setDraft] = useState<TableQuery>(query),
    [name, setName] = useState(""),
    [exportAll, setExportAll] = useState(false),
    [collapsed, setCollapsed] = useState<string[]>([]);
  const restoreContext = useEffectEvent(
    (value: Record<string, string>, search: string, status: string) => {
      onContext?.(value);
      onRestore?.(search, status);
    },
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("table") !== state.entity) return;
    try {
      const data = JSON.parse(url.searchParams.get("gridContext") || "null");
      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        Object.values(data).every(
          (v) => typeof v === "string" && v.length <= 100,
        )
      ) {
        const timer = setTimeout(
          () =>
            restoreContext(
              data,
              url.searchParams.get("q") || "",
              url.searchParams.get("state") || "",
            ),
          0,
        );
        return () => clearTimeout(timer);
      }
    } catch {
      /* Ignore malformed shared presentation context. */
    }
  }, [state.entity]);
  if (!columns.length) return <>{children}</>;
  function applyQuery() {
    try {
      state.setQuery(parseTableQuery(JSON.stringify(draft), state.entity));
      setPanel(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review the filter values.");
    }
  }
  const original = elements(children)[0];
  const sections = elements(original?.props.children);
  const body = sections.find((s) => s.type === TableBody);
  const originalRows = elements(body?.props.children);
  const keys = [
    ...layout.pinned,
    ...layout.order,
    ...columns.map((c) => c.key),
  ].filter(
    (key, i, all) =>
      all.indexOf(key) === i &&
      !layout.hidden.includes(key) &&
      columns.some((c) => c.key === key),
  );
  const visible = keys.map((key) => columns.find((c) => c.key === key)!);
  function open(which: typeof panel) {
    setDraft(query);
    setPanel(which);
  }
  function sort(field: string, multiple = false) {
    const previous = query.sorts.find((s) => s.field === field);
    if (multiple && !previous && query.sorts.length >= 4) {
      toast.error("Remove a sort rule before adding another.");
      return;
    }
    const next =
      previous?.direction === "asc" ? "desc" : previous ? null : "asc";
    state.setQuery({
      ...query,
      sorts: [
        ...(multiple ? query.sorts.filter((s) => s.field !== field) : []),
        ...(next ? [{ field, direction: next as "asc" | "desc" }] : []),
      ].slice(-4),
    });
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy. Select the text manually.");
    }
  }
  async function download(format: "csv" | "xlsx") {
    if (!exportURL) return;
    const url = new URL(exportURL, window.location.origin);
    url.searchParams.set("grid", JSON.stringify(query));
    url.searchParams.set(
      "columns",
      (exportAll ? columns : visible).map((c) => c.key).join(","),
    );
    url.searchParams.set("format", format);
    await fileDownload.download(
      url.toString(),
      `${state.entity}.${format}`,
      format,
    );
  }

  const grouped = layout.group
    ? rows.reduce<Map<string, number>>((groups, r) => {
        const k = display(fieldValue(r, layout.group));
        groups.set(k, (groups.get(k) || 0) + 1);
        return groups;
      }, new Map())
    : null;
  const displayRows = layout.group
    ? [...rows].sort((a, b) =>
        display(fieldValue(a, layout.group)).localeCompare(
          display(fieldValue(b, layout.group)),
        ),
      )
    : rows;
  return (
    <div className={`advanced-table advanced-table-${layout.density}`}>
      <div
        className="grid-tools"
        role="toolbar"
        aria-label={localize("Table tools")}
      >
        <Button variant="outline" size="sm" onClick={() => open("filters")}>
          <SlidersHorizontal className="size-3.5" />
          <Localized>{" Filters"}</Localized>
          {query.filters.length ? ` (${query.filters.length})` : ""}
        </Button>
        <Button variant="outline" size="sm" onClick={() => open("sort")}>
          <Localized>{" Sort"}</Localized>
          {query.sorts.length ? ` (${query.sorts.length})` : ""}
        </Button>
        <Button variant="outline" size="sm" onClick={() => open("columns")}>
          <Columns3 className="size-3.5" />
          <Localized>{" Columns "}</Localized>
        </Button>
        <Button variant="outline" size="sm" onClick={() => open("views")}>
          <Bookmark className="size-3.5" />
          <Localized>{" Views "}</Localized>
        </Button>
        {exportURL && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(fileDownload.busy)}
              loading={fileDownload.busy === "csv"}
              onClick={() => void download("csv")}
            >
              {!fileDownload.busy && <Download className="size-3.5" />}
              {fileDownload.busy === "csv" ? (
                <Localized>{"Preparing CSV…"}</Localized>
              ) : (
                <Localized>{"CSV"}</Localized>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(fileDownload.busy)}
              loading={fileDownload.busy === "xlsx"}
              onClick={() => void download("xlsx")}
            >
              {fileDownload.busy === "xlsx" ? (
                <Localized>{"Preparing Excel…"}</Localized>
              ) : (
                <Localized>{"Excel"}</Localized>
              )}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("table", state.entity);
            url.searchParams.delete("page");
            url.searchParams.set("q", search);
            url.searchParams.set("state", status);
            url.searchParams.set("gridLayout", JSON.stringify(layout));
            if (context)
              url.searchParams.set("gridContext", JSON.stringify(context));
            url.searchParams.set("grid", JSON.stringify(query));
            void copy(url.toString());
          }}
        >
          <Copy className="size-3.5" />
          <Localized>{" Share view "}</Localized>
        </Button>
        {(query.filters.length > 0 || query.sorts.length > 0) && (
          <Button variant="ghost" size="sm" onClick={() => state.reset()}>
            <RotateCcw className="size-3.5" />
            <Localized>{" Reset "}</Localized>
          </Button>
        )}
      </div>
      {query.filters.length > 0 && (
        <div
          className="grid-chips"
          aria-label={localize("Active table filters")}
        >
          {query.filters.map((f, i) => (
            <button
              key={i}
              onClick={() =>
                state.setQuery({
                  ...query,
                  filters: query.filters.filter((_, n) => n !== i),
                })
              }
            >
              {columns.find((c) => c.key === f.field)?.label} ·{" "}
              {f.op.replaceAll("_", " ")} {f.value}
              <X className="size-3" />
              <span className="sr-only">
                <Localized>{"Remove filter"}</Localized>
              </span>
            </button>
          ))}
        </div>
      )}
      {grouped && (
        <div className="grid-group-summary">
          <span>
            <Localized>{"Current page groups"}</Localized>
          </span>
          {[...grouped].map(([key, count]) => (
            <span key={key}>
              {key} <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}
      {visualization ?? (
        <Table
          data-actions="true"
          style={{
            minWidth: `calc(${visible.reduce((sum, c) => sum + (layout.widths[c.key] || 160), 0)}px + var(--table-actions-width))`,
          }}
        >
          <TableHeader>
            <TableRow>
              {visible.map((col, i) => {
                const sorting = query.sorts.find((s) => s.field === col.key);
                return (
                  <TableHead
                    key={col.key}
                    style={{
                      width: layout.widths[col.key] || 160,
                      minWidth: layout.widths[col.key] || 160,
                    }}
                    data-pinned={layout.pinned.includes(col.key) || undefined}
                    aria-sort={
                      sorting
                        ? sorting.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    <button
                      className="grid-header-sort"
                      onClick={(e) => sort(col.key, e.shiftKey)}
                      title={localize(
                        "Sort column. Shift-click to add another sort.",
                      )}
                    >
                      <span className="grid-column-title">
                        <Localized>{col.label}</Localized>
                      </span>
                      {sorting?.direction === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : sorting ? (
                        <ArrowDown className="size-3" />
                      ) : null}
                      {query.sorts.length > 1 && sorting && (
                        <sup>{query.sorts.indexOf(sorting) + 1}</sup>
                      )}
                    </button>
                    <ColumnMenu
                      column={col}
                      state={state}
                      onFilter={() => {
                        if (query.filters.length >= 12) {
                          toast.error(
                            "Remove a condition before adding another.",
                          );
                          return;
                        }
                        setDraft({
                          ...query,
                          filters: [
                            ...query.filters,
                            {
                              field: col.key,
                              op: col.type === "text" ? "contains" : "eq",
                              value: "",
                            },
                          ].slice(-12) as TableQuery["filters"],
                        });
                        setPanel("filters");
                      }}
                    />
                    <ColumnResize
                      label={col.label}
                      width={layout.widths[col.key] || 160}
                      onResize={(width) =>
                        state.setLayout((layout) => ({
                          ...layout,
                          widths: { ...layout.widths, [col.key]: width },
                        }))
                      }
                    />
                    {i === 0 && layout.pinned.length > 0 && (
                      <Pin className="size-3" />
                    )}
                  </TableHead>
                );
              })}
              <TableHead style={{ width: "var(--table-actions-width)" }}>
                <Localized>{" Actions "}</Localized>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0
              ? originalRows
              : displayRows.map((row, index) => {
                  const old =
                    originalRows.find((r) =>
                      String(r.key).endsWith(String(row.id)),
                    ) || originalRows[rows.indexOf(row)];
                  const cells = elements(old?.props.children);
                  const rowProps = old?.props as
                    | {
                        onClick?: MouseEventHandler<HTMLTableRowElement>;
                        className?: string;
                      }
                    | undefined;
                  const group = display(fieldValue(row, layout.group));
                  const startGroup =
                    layout.group &&
                    (index === 0 ||
                      group !==
                        display(
                          fieldValue(displayRows[index - 1], layout.group),
                        ));
                  return (
                    <Fragment key={String(row.id || index)}>
                      {startGroup && (
                        <TableRow className="grid-group-row">
                          <TableCell colSpan={visible.length + 1}>
                            <button
                              aria-expanded={!collapsed.includes(group)}
                              onClick={() =>
                                setCollapsed(
                                  collapsed.includes(group)
                                    ? collapsed.filter((g) => g !== group)
                                    : [...collapsed, group],
                                )
                              }
                            >
                              {collapsed.includes(group) ? "▸" : "▾"}{" "}
                              {
                                columns.find((c) => c.key === layout.group)
                                  ?.label
                              }
                              : {group} · {grouped?.get(group)}{" "}
                              <Localized>{" rows on this page "}</Localized>
                            </button>
                          </TableCell>
                        </TableRow>
                      )}
                      {(!layout.group || !collapsed.includes(group)) && (
                        <TableRow
                          onClick={rowProps?.onClick}
                          className={rowProps?.className}
                        >
                          {visible.map((col) => (
                            <TableCell
                              key={col.key}
                              data-value-type={col.type}
                              data-identity={
                                col.key === columns[0]?.key || undefined
                              }
                              title={String(fieldValue(row, col.key) ?? "")}
                              data-pinned={
                                layout.pinned.includes(col.key) || undefined
                              }
                              style={{
                                minWidth: layout.widths[col.key] || 160,
                              }}
                            >
                              {col.key === columns[0]?.key && cells[0] ? (
                                cells[0].props.children
                              ) : (
                                <span
                                  className={
                                    col.type === "number"
                                      ? "font-data tabular-nums"
                                      : ""
                                  }
                                  onDoubleClick={() =>
                                    void copy(
                                      String(fieldValue(row, col.key) ?? ""),
                                    )
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  title={localize("Double-click to copy")}
                                >
                                  {[
                                    "state",
                                    "status",
                                    "display_state",
                                    "terms.state",
                                  ].includes(col.key) &&
                                  fieldValue(row, col.key) != null ? (
                                    <Badge
                                      variant={
                                        [
                                          "FAIL",
                                          "rejected",
                                          "overdue",
                                          "void",
                                          "expired",
                                          "hold",
                                          "withdrawn",
                                        ].includes(
                                          String(fieldValue(row, col.key)),
                                        )
                                          ? "destructive"
                                          : [
                                                "PASS",
                                                "released",
                                                "posted",
                                                "confirmed",
                                                "paid",
                                                "verified",
                                                "active",
                                                "approved",
                                                "accepted",
                                                "valid",
                                                "published",
                                              ].includes(
                                                String(
                                                  fieldValue(row, col.key),
                                                ),
                                              )
                                            ? "default"
                                            : "secondary"
                                      }
                                    >
                                      {display(
                                        fieldValue(row, col.key),
                                        col.type,
                                      )}
                                    </Badge>
                                  ) : (
                                    display(fieldValue(row, col.key), col.type)
                                  )}
                                  {col.key === "status" &&
                                    row.superseded === true && (
                                      <Badge variant="secondary">
                                        <Localized>{" Superseded "}</Localized>
                                      </Badge>
                                    )}
                                </span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {cells.at(-1)?.props.children}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
          </TableBody>
        </Table>
      )}
      {summary && summary.length > 0 && (
        <div
          className="grid-group-summary"
          aria-label={localize("Filtered totals")}
        >
          <span>
            <Localized>{"Filtered totals · all matching records"}</Localized>
          </span>
          {summary
            .filter((s) => visible.some((c) => c.key === s.field))
            .map((s) => (
              <span key={s.field + s.unit}>
                {columns.find((c) => c.key === s.field)?.label}{" "}
                <strong>{display(s.total, "number")}</strong> {s.unit}
              </span>
            ))}
        </div>
      )}
      <div className="grid-footnote">
        {rows.length} <Localized>{" rows on this page"}</Localized>
      </div>
      <Sheet
        open={panel !== null}
        onOpenChange={(v) => {
          if (!v) setPanel(null);
        }}
      >
        <SheetContent className="grid-settings-sheet">
          <SheetHeader>
            <SheetTitle>
              {panel === "filters" ? (
                <Localized>{"Advanced filters"}</Localized>
              ) : panel === "columns" ? (
                <Localized>{"Table layout"}</Localized>
              ) : panel === "sort" ? (
                <Localized>{"Sort records"}</Localized>
              ) : (
                <Localized>{"Saved views"}</Localized>
              )}
            </SheetTitle>
            <SheetDescription>
              {panel === "filters" ? (
                <Localized>
                  {
                    "All conditions must match. Filters apply to every record before pagination."
                  }
                </Localized>
              ) : panel === "columns" ? (
                <Localized>
                  {"Customize this table for your account on this device."}
                </Localized>
              ) : panel === "sort" ? (
                <Localized>
                  {"Rules apply from top to bottom, across all pages."}
                </Localized>
              ) : (
                <Localized>
                  {"Save filters, sorting, search and column layout for reuse."}
                </Localized>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="grid-settings-body">
            {panel === "filters" && (
              <>
                {columns.some((c) => c.type === "date") && (
                  <div className="grid-date-presets">
                    {[7, 30, 90].map((days) => (
                      <Button
                        key={days}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const field = columns.find(
                            (c) => c.type === "date",
                          )!.key;
                          const today = new Date().toLocaleDateString("en-CA", {
                            timeZone: "Asia/Jakarta",
                          });
                          const from = new Date(today + "T12:00:00Z");
                          from.setUTCDate(from.getUTCDate() - days + 1);
                          if (
                            draft.filters.filter((f) => f.field !== field)
                              .length > 10
                          ) {
                            toast.error(
                              "Remove a condition before adding a date range.",
                            );
                            return;
                          }
                          setDraft({
                            ...draft,
                            filters: [
                              ...draft.filters.filter((f) => f.field !== field),
                              {
                                field,
                                op: "gte",
                                value: from.toISOString().slice(0, 10),
                              },
                              { field, op: "lte", value: today },
                            ].slice(-12) as TableQuery["filters"],
                          });
                        }}
                      >
                        <Localized>{" Last "}</Localized>
                        {days} <Localized>{" days "}</Localized>
                      </Button>
                    ))}
                  </div>
                )}
                <div className="grid-filter-rules">
                  {draft.filters.map((f, i) => {
                    const col = columns.find((c) => c.key === f.field);
                    return (
                      <fieldset key={i}>
                        <legend>
                          <Localized>{"Condition "}</Localized>
                          {i + 1}
                        </legend>
                        <select
                          aria-label={`Filter field ${i + 1}`}
                          value={f.field}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              filters: draft.filters.map((v, n) =>
                                n === i
                                  ? {
                                      field: e.target.value,
                                      op: "eq",
                                      value: "",
                                    }
                                  : v,
                              ),
                            })
                          }
                        >
                          {columns.map((c) => (
                            <option key={c.key} value={c.key}>
                              <Localized>{c.label}</Localized>
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Filter operator ${i + 1}`}
                          value={f.op}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              filters: draft.filters.map((v, n) =>
                                n === i
                                  ? { ...v, op: e.target.value as typeof f.op }
                                  : v,
                              ),
                            })
                          }
                        >
                          {(col?.type === "number" || col?.type === "date"
                            ? [
                                "eq",
                                "neq",
                                "gt",
                                "gte",
                                "lt",
                                "lte",
                                "empty",
                                "not_empty",
                              ]
                            : [
                                "contains",
                                "in",
                                "eq",
                                "neq",
                                "starts",
                                "empty",
                                "not_empty",
                              ]
                          ).map((op) => (
                            <option key={op} value={op}>
                              {
                                {
                                  contains: "Contains",
                                  in: "Is any of",
                                  eq: "Is",
                                  neq: "Is not",
                                  starts: "Starts with",
                                  gt: "Greater / after",
                                  gte: "At least / on or after",
                                  lt: "Less / before",
                                  lte: "At most / on or before",
                                  empty: "Is empty",
                                  not_empty: "Is not empty",
                                }[op]
                              }
                            </option>
                          ))}
                        </select>
                        {!["empty", "not_empty"].includes(f.op) && (
                          <Input
                            placeholder={
                              f.op === "in"
                                ? "Separate values with commas"
                                : undefined
                            }
                            aria-label={`Filter value ${i + 1}`}
                            type={col?.type === "date" ? "date" : "text"}
                            inputMode={
                              col?.type === "number" ? "decimal" : undefined
                            }
                            value={f.value}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                filters: draft.filters.map((v, n) =>
                                  n === i ? { ...v, value: e.target.value } : v,
                                ),
                              })
                            }
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              filters: draft.filters.filter((_, n) => n !== i),
                            })
                          }
                        >
                          <Localized>{" Remove condition "}</Localized>
                        </Button>
                      </fieldset>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  disabled={draft.filters.length >= 12}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      filters: [
                        ...draft.filters,
                        {
                          field: columns[0].key,
                          op: columns[0].type === "text" ? "contains" : "eq",
                          value: "",
                        },
                      ],
                    })
                  }
                >
                  <Localized>{" Add condition "}</Localized>
                </Button>
                <Button
                  onClick={() => {
                    applyQuery();
                  }}
                >
                  <Localized>{" Apply filters "}</Localized>
                </Button>
              </>
            )}
            {panel === "sort" && (
              <>
                {draft.sorts.map((s, i) => (
                  <div className="grid-sort-rule" key={i}>
                    <span>{i + 1}</span>
                    <select
                      aria-label={`Sort field ${i + 1}`}
                      value={s.field}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          sorts: draft.sorts.map((v, n) =>
                            n === i ? { ...v, field: e.target.value } : v,
                          ),
                        })
                      }
                    >
                      {columns.map((c) => (
                        <option key={c.key} value={c.key}>
                          <Localized>{c.label}</Localized>
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Sort direction ${i + 1}`}
                      value={s.direction}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          sorts: draft.sorts.map((v, n) =>
                            n === i
                              ? {
                                  ...v,
                                  direction: e.target.value as "asc" | "desc",
                                }
                              : v,
                          ),
                        })
                      }
                    >
                      <option value="asc">
                        <Localized>{"Ascending"}</Localized>
                      </option>
                      <option value="desc">
                        <Localized>{"Descending"}</Localized>
                      </option>
                    </select>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          sorts: draft.sorts.filter((_, n) => n !== i),
                        })
                      }
                    >
                      <Localized>{" Remove "}</Localized>
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={draft.sorts.length >= 4}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      sorts: [
                        ...draft.sorts,
                        {
                          field:
                            columns.find(
                              (c) =>
                                !draft.sorts.some((s) => s.field === c.key),
                            )?.key || columns[0].key,
                          direction: "asc",
                        },
                      ],
                    })
                  }
                >
                  <Localized>{" Add sort "}</Localized>
                </Button>
                <Button
                  onClick={() => {
                    applyQuery();
                  }}
                >
                  <Localized>{" Apply sorting "}</Localized>
                </Button>
              </>
            )}
            {panel === "columns" && (
              <>
                <Button variant="outline" onClick={() => state.reset()}>
                  <Localized>{" Restore default table "}</Localized>
                </Button>
                <label className="grid-checkbox-label">
                  <input
                    type="checkbox"
                    checked={exportAll}
                    onChange={(e) => setExportAll(e.target.checked)}
                  />
                  <Localized>{" Export all allowed columns "}</Localized>
                </label>
                <label>
                  <Localized>{" Row spacing "}</Localized>
                  <select
                    aria-label={localize("Row spacing")}
                    value={layout.density}
                    onChange={(e) => {
                      const density = e.currentTarget
                        .value as typeof layout.density;
                      state.setLayout((layout) => ({ ...layout, density }));
                    }}
                  >
                    <option value="comfortable">
                      <Localized>{"Comfortable"}</Localized>
                    </option>
                    <option value="compact">
                      <Localized>{"Compact"}</Localized>
                    </option>
                  </select>
                </label>
                <label>
                  <Localized>{" Page group summary "}</Localized>
                  <select
                    aria-label={localize("Page group summary")}
                    value={layout.group}
                    onChange={(e) => {
                      const group = e.currentTarget.value;
                      state.setLayout((layout) => ({ ...layout, group }));
                    }}
                  >
                    <option value="">
                      <Localized>{"None"}</Localized>
                    </option>
                    {columns
                      .filter((c) => c.type !== "number")
                      .map((c) => (
                        <option key={c.key} value={c.key}>
                          <Localized>{c.label}</Localized>
                        </option>
                      ))}
                  </select>
                </label>
                {[...new Set([...layout.order, ...columns.map((c) => c.key)])]
                  .filter((key) => columns.some((c) => c.key === key))
                  .map((key, i, all) => (
                    <div className="grid-column-setting" key={key}>
                      <GripVertical className="size-3.5" />
                      <label>
                        <input
                          type="checkbox"
                          checked={!layout.hidden.includes(key)}
                          disabled={key === columns[0].key}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            state.setLayout((layout) => ({
                              ...layout,
                              hidden: checked
                                ? layout.hidden.filter((k) => k !== key)
                                : [...layout.hidden, key],
                            }));
                          }}
                        />
                        {columns.find((c) => c.key === key)?.label}
                      </label>
                      <button
                        aria-label={`Move ${key} left`}
                        disabled={i === 0}
                        onClick={() => {
                          const order = [...all];
                          [order[i - 1], order[i]] = [order[i], order[i - 1]];
                          state.setLayout((layout) => ({ ...layout, order }));
                        }}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Pin ${key}`}
                        aria-pressed={layout.pinned.includes(key)}
                        onClick={() =>
                          state.setLayout((layout) => ({
                            ...layout,
                            pinned: layout.pinned.includes(key) ? [] : [key],
                          }))
                        }
                      >
                        <Pin className="size-3.5" />
                      </button>
                    </div>
                  ))}
              </>
            )}
            {panel === "views" && (
              <>
                <label>
                  <Localized>{" View name "}</Localized>
                  <Input
                    maxLength={60}
                    placeholder={localize("e.g. Overdue customer invoices")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <Button
                  disabled={!name.trim()}
                  onClick={() => {
                    state.saveView(name.trim(), search, status, context);
                    setName("");
                    toast.success("View saved.");
                  }}
                >
                  <Localized>{" Save current view "}</Localized>
                </Button>
                {state.views.map((v) => (
                  <div className="grid-saved-view" key={v.id}>
                    <button
                      onClick={() => {
                        state.applyView(v);
                        onRestore?.(v.search, v.state);
                        if (v.context) onContext?.(v.context);
                        setPanel(null);
                      }}
                    >
                      <Bookmark className="size-4" />
                      {v.name}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete view ${v.name}`}
                      onClick={() => state.deleteView(v.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                {!state.views.length && (
                  <p>
                    <Localized>{"No saved views yet."}</Localized>
                  </p>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
