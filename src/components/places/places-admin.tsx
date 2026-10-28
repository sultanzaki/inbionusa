"use client";
import { useLocale } from "@/components/i18n/locale-provider";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@/app/(dashboard)/user-context";
import { canAction } from "@/lib/types";
import {
  Building2,
  Factory,
  FlaskConical,
  Warehouse,
  MapPin,
  Plus,
  Pencil,
  Search,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
} from "lucide-react";
import { ERPModal } from "@/components/erp/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/workspace/confirm-provider";
import { roomKinds, type Place, type Room, type RoomKind } from "@/lib/places";
import { invalidateERPReads } from "@/lib/erp/read-request";
type ResponseData = {
  sites: Place[];
  rooms: Room[];
  total: number;
  page: number;
};
type Editor = {
  type: "site" | "room";
  id?: string;
  version?: number;
  name: string;
  site: string;
  kind: RoomKind;
  address: string;
  active: boolean;
  request: string;
};
const icons = {
  warehouse: Warehouse,
  laboratory: FlaskConical,
  production: Factory,
  office: Building2,
  other: DoorOpen,
};
export function PlacesAdmin() {
  const { t } = useLocale();
  const { user } = useUser();
  const allowed = Boolean(user && canAction(user, "manage_users"));
  const [data, setData] = useState<ResponseData | null>(null),
    [site, setSite] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [loading, setLoading] = useState(true),
    [editor, setEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const confirm = useConfirm();
  const saving = useRef(false);
  const baseline = useRef("");
  useEffect(() => {
    if (!allowed) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        fetch(
          "/api/places?" +
            new URLSearchParams({ site, q: query, page: String(page) }),
          { cache: "no-store", signal: abort.signal },
        )
          .then(async (r) => {
            const v = await r.json();
            if (!r.ok) throw Error(v.message);
            if (!abort.signal.aborted) {
              setData(v);
              setError("");
            }
          })
          .catch((e) => {
            if (!abort.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!abort.signal.aborted) setLoading(false);
          });
      },
      query ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [site, query, page, version, allowed]);
  function open(type: "site" | "room", record?: Place | Room) {
    setError("");
    setNotice("");
    const next: Editor = {
      type,
      id: record?.id,
      version: record?.version,
      name:
        record && "room_name" in record ? record.room_name : record?.name || "",
      site:
        record && "warehouse_id" in record
          ? record.warehouse_id
          : site || data?.sites.find((s) => s.active)?.id || "",
      kind: record && "room_kind" in record ? record.room_kind : "warehouse",
      address: record && "address" in record ? record.address : "",
      active: record?.active ?? true,
      request: crypto.randomUUID(),
    };
    baseline.current = JSON.stringify(next);
    setEditor(next);
  }
  async function close() {
    if (busy) return;
    if (
      editor &&
      JSON.stringify(editor) !== baseline.current &&
      !(await confirm({
        title: t("Close form?"),
        description: t("Unsaved changes will be discarded."),
        confirmLabel: t("Close"),
        destructive: false,
      }))
    )
      return;
    setEditor(null);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editor || saving.current) return;
    if (!editor.name.trim() || editor.name.includes("/")) {
      setError("Enter a name without /.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        action:
          editor.type === "site" ? "save_warehouse" : "save_warehouse_location",
        request_key: editor.request,
        id: editor.id,
        version: editor.version,
        active: editor.active,
        ...(editor.type === "site"
          ? { name: editor.name, address: editor.address }
          : {
              room_name: editor.name,
              room_kind: editor.kind,
              warehouse_id: editor.site,
            }),
      };
      const r = await fetch("/api/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.message);
      if (editor.type === "site") setSite(v.id);
      setLoading(true);
      setEditor(null);
      setPage(1);
      setQuery("");
      setVersion((n) => n + 1);
      invalidateERPReads();
      setNotice(editor.type === "site" ? "Site saved." : "Room saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Retry.");
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  const selected = data?.sites.find((p) => p.id === site);
  const control =
    "mt-1.5 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-sm focus:ring-2 focus:ring-primary/20";
  if (!allowed)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Administrator access is required to manage sites and rooms.")}
      </p>
    );
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{t("Administration")}</p>
          <h1 className="mt-1 text-2xl font-semibold">{t("Sites & rooms")}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => open("site")}>
            <Plus />
            {t("New site")}
          </Button>
          <Button
            disabled={!data?.sites.some((s) => s.active)}
            onClick={() => open("room")}
          >
            <Plus />
            {t("New room")}
          </Button>
        </div>
      </header>
      {!editor && error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {t(error)}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {t(notice)}
        </p>
      )}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-xl border bg-card p-3">
          <p className="mb-3 px-2 text-xs font-semibold text-muted-foreground">
            {t("SITES")}
          </p>
          <nav aria-label={t("Site")} className="space-y-1">
            <button
              className={
                "flex w-full items-center gap-2 rounded-lg p-3 text-left text-sm " +
                (!site ? "bg-primary/10 text-primary" : "hover:bg-muted/30")
              }
              onClick={() => {
                setSite("");
                setPage(1);
              }}
            >
              <Building2 className="size-4" />
              {t("All sites")}
            </button>
            {data?.sites.map((s) => (
              <div
                key={s.id}
                className={
                  "flex min-w-0 items-center rounded-lg " +
                  (site === s.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted/30")
                }
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 p-3 text-left"
                  onClick={() => {
                    setSite(s.id);
                    setPage(1);
                  }}
                >
                  <MapPin className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <strong className="block break-words text-sm font-medium">
                      {s.name}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {s.room_count} {t("Rooms").toLowerCase()}
                      {s.active ? "" : " · " + t("Inactive")}
                    </span>
                  </span>
                </button>
                <Button
                  aria-label={t("Edit site") + " " + s.name}
                  variant="ghost"
                  size="icon-sm"
                  className="mr-1"
                  onClick={() => open("site", s)}
                >
                  <Pencil />
                </Button>
              </div>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 space-y-4" aria-busy={loading}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {selected?.name || t("All rooms")}
              </h2>
              {selected?.address && (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {selected.address}
                </p>
              )}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                aria-label={t("Search rooms")}
                placeholder={t("Search sites or rooms…")}
                className="pl-9"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          {loading ? (
            <div role="status" className="grid gap-3 sm:grid-cols-2">
              <span className="sr-only">{t("Loading rooms…")}</span>
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-32 animate-pulse rounded-xl border bg-card motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : (
            <>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data?.rooms.map((room) => {
                  const Icon = icons[room.room_kind] || DoorOpen;
                  return (
                    <article
                      key={room.id}
                      className="min-w-0 rounded-xl border bg-card p-4"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </span>
                        <Button
                          aria-label={t("Edit room") + " " + room.name}
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => open("room", room)}
                        >
                          <Pencil />
                        </Button>
                      </div>
                      <h3 className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                        {room.name}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{t(roomKinds[room.room_kind])}</span>
                        <span>
                          {t(
                            room.active && room.site_active
                              ? "Active"
                              : "Inactive",
                          )}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!data?.rooms.length && (
                <div className="rounded-xl border border-dashed bg-card p-8 text-center">
                  <DoorOpen className="mx-auto mb-3 size-7 text-primary" />
                  <p className="text-sm">
                    {t(query ? "No rooms found." : "No rooms yet.")}
                  </p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    disabled={!data?.sites.some((s) => s.active)}
                    onClick={() => open("room")}
                  >
                    {t("Add room")}
                  </Button>
                </div>
              )}
              {Boolean(data?.total) && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {data?.total} {t("Rooms").toLowerCase()} · {t("Page")}{" "}
                    {page}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      aria-label={t("Previous page")}
                      variant="outline"
                      size="icon-sm"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      aria-label={t("Next page")}
                      variant="outline"
                      size="icon-sm"
                      disabled={page * 20 >= (data?.total || 0)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {editor && (
        <ERPModal
          description=""
          title={t(
            editor.type === "site"
              ? editor.id
                ? "Edit site"
                : "New site"
              : editor.id
                ? "Edit room"
                : "New room",
          )}
          onClose={() => void close()}
        >
          <form onSubmit={save} className="space-y-4">
            {editor.type === "room" && (
              <label className="block text-sm font-medium">
                {t("Site")}
                <select
                  aria-label={t("Site")}
                  className={control}
                  required
                  disabled={busy || Boolean(editor.id)}
                  value={editor.site}
                  onChange={(e) =>
                    setEditor({ ...editor, site: e.target.value })
                  }
                >
                  <option value="">{t("Select site…")}</option>
                  {data?.sites
                    .filter((s) => s.active || s.id === editor.site)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="block text-sm font-medium">
              {t(editor.type === "site" ? "Site name" : "Room name")}
              <Input
                autoFocus
                aria-label={t(
                  editor.type === "site" ? "Site name" : "Room name",
                )}
                className="mt-1.5"
                value={editor.name}
                required
                maxLength={100}
                disabled={busy}
                placeholder={editor.type === "site" ? "KBI" : "Lab"}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </label>
            {editor.type === "room" ? (
              <>
                <label className="block text-sm font-medium">
                  {t("Room type")}
                  <select
                    className={control}
                    aria-label={t("Room type")}
                    value={editor.kind}
                    disabled={busy}
                    onChange={(e) =>
                      setEditor({ ...editor, kind: e.target.value as RoomKind })
                    }
                  >
                    {Object.entries(roomKinds).map(([k, v]) => (
                      <option key={k} value={k}>
                        {t(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="rounded-lg bg-primary/5 p-3 text-sm font-medium text-primary">
                  {data?.sites.find((s) => s.id === editor.site)?.name ||
                    t("Site")}
                  /{editor.name || t("Room")}
                </p>
              </>
            ) : (
              <label className="block text-sm font-medium">
                {t("Address")}
                <textarea
                  className={control}
                  rows={2}
                  maxLength={4000}
                  value={editor.address}
                  disabled={busy}
                  onChange={(e) =>
                    setEditor({ ...editor, address: e.target.value })
                  }
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editor.active}
                disabled={busy}
                onChange={(e) =>
                  setEditor({ ...editor, active: e.target.checked })
                }
              />
              {t("Active")}
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t(error)}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void close()}
              >
                {t("Cancel")}
              </Button>
              <Button type="submit" loading={busy}>
                {t("Save")}
              </Button>
            </div>
          </form>
        </ERPModal>
      )}
    </div>
  );
}
