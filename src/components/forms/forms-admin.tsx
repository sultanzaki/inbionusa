"use client";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Eye,
  FileText,
  Link2,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/workspace/confirm-provider";
import {
  templateSchema,
  type Template,
  type FormField,
} from "@/lib/forms/schema";
import { referenceSources } from "@/lib/forms/references";
type RecordForm = {
  id: string;
  draft: Template;
  published_revision: number;
  version: number;
  active: boolean;
  public_token: string;
  submissions?: {
    id: string;
    template: Template;
    revision: number;
    created_at: string;
    answers: Record<string, string>;
    files: { name: string }[];
    reference_data?: Record<
      string,
      { id: string; label: string; source: string }
    >;
  }[];
};
const types: Record<FormField["type"], string> = {
  text: "Teks singkat",
  textarea: "Paragraf",
  number: "Angka",
  date: "Tanggal",
  time: "Waktu",
  select: "Pilihan tunggal",
  reference: "Referensi data ERP",
  file: "Upload file",
};
const control =
  "mt-1.5 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60";
const tabs = [
  { key: "questions", name: "Pertanyaan", icon: ListChecks },
  { key: "preview", name: "Pratinjau", icon: Eye },
  { key: "responses", name: "Jawaban", icon: MessageSquare },
  { key: "share", name: "Bagikan", icon: Link2 },
] as const;
export function FormsAdmin() {
  const confirm = useConfirm();
  const [list, setList] = useState<RecordForm[]>([]),
    [ready, setReady] = useState(false),
    [selected, setSelected] = useState<RecordForm | null>(null),
    [draft, setDraft] = useState<Template | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [active, setActive] = useState(0),
    [tab, setTab] = useState<(typeof tabs)[number]["key"]>("questions"),
    [search, setSearch] = useState(""),
    [invalidFields, setInvalidFields] = useState<string[]>([]),
    [infoOpen, setInfoOpen] = useState(false);
  const dirty = Boolean(
    selected &&
    draft &&
    JSON.stringify(draft) !== JSON.stringify(selected.draft),
  );
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  async function load(id?: string) {
    const r = await fetch("/api/forms" + (id ? "?id=" + id : ""), {
        cache: "no-store",
      }),
      v = await r.json();
    if (!r.ok) throw Error(v.message);
    if (id) {
      setSelected(v);
      setDraft(v.draft);
    } else setList(v);
  }
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/forms", { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw Error(v.message);
        setList(v);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setReady(true);
      });
    return () => abort.abort();
  }, []);
  async function act(action: string, template?: Template) {
    if (busy) return;
    if (template) {
      const checked = templateSchema.safeParse(template);
      if (!checked.success) {
        const indices = checked.error.issues
          .map((i) =>
            i.path[0] === "fields" && typeof i.path[1] === "number"
              ? i.path[1]
              : -1,
          )
          .filter((i) => i >= 0);
        setInvalidFields(indices.map((i) => draft?.fields[i]?.id || ""));
        if (indices.length) setActive(indices[0]);
        setTab("questions");
        setError(
          "Periksa judul, label, dan pengaturan pertanyaan. Referensi ERP memerlukan sumber data; pilihan tunggal memerlukan pilihan jawaban.",
        );
        return;
      }
      template = checked.data;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setInvalidFields([]);
    try {
      const r = await fetch("/api/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            id: selected?.id,
            version: selected?.version,
            template,
          }),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.message);
      if (action === "delete") {
        await load();
        setSelected(null);
        setDraft(null);
        setActive(0);
        setTab("questions");
        setNotice(
          "Form dihapus. Jawaban dan lampiran tetap tersimpan sebagai riwayat.",
        );
        return;
      }
      await Promise.all([load(), load(v.id)]);
      if (action === "create") {
        setActive(0);
        setTab("questions");
      }
      setNotice(
        action === "publish"
          ? "Form diterbitkan."
          : action === "pause"
            ? "Penerimaan jawaban dijeda."
            : "Perubahan tersimpan.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Tidak dapat menyimpan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  function field(change: Partial<FormField>) {
    if (draft)
      setDraft({
        ...draft,
        fields: draft.fields.map((f, i) =>
          i === active ? { ...f, ...change } : f,
        ),
      });
    setNotice("");
  }
  function add(type: FormField["type"] = "text") {
    if (!draft || draft.fields.length >= 50) return;
    setDraft({
      ...draft,
      fields: [
        ...draft.fields,
        {
          id: "f" + crypto.randomUUID().replaceAll("-", ""),
          label:
            type === "reference"
              ? "Referensi ERP"
              : type === "file"
                ? "Lampiran"
                : "Pertanyaan baru",
          type,
          required: false,
          options: [],
        },
      ],
    });
    setActive(draft.fields.length);
    setTab("questions");
  }
  function move(delta: number) {
    if (!draft || active + delta < 0 || active + delta >= draft.fields.length)
      return;
    const fields = [...draft.fields];
    [fields[active], fields[active + delta]] = [
      fields[active + delta],
      fields[active],
    ];
    setDraft({ ...draft, fields });
    setActive(active + delta);
  }
  async function choose(id: string) {
    if (dirty || busy || !id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await load(id);
      setActive(0);
      setTab("questions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tidak dapat memuat form.");
    } finally {
      setBusy(false);
    }
  }
  const f = draft?.fields[active];
  const filtered = list.filter((r) =>
    r.draft.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1440px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Administration
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Forms</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || dirty}
            onClick={() =>
              act("create", {
                title: "Form baru",
                description: "",
                kind: "general",
                fields: [
                  {
                    id: "name",
                    label: "Nama pengisi",
                    type: "text",
                    required: true,
                    options: [],
                  },
                ],
              })
            }
          >
            <Plus />
            Form baru
          </Button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary"
        >
          <Check className="size-4" />
          {notice}
        </p>
      )}
      {!ready ? (
        <div
          role="status"
          className="flex min-h-64 items-center justify-center gap-2 rounded-xl border bg-card"
        >
          <Loader2 className="size-4 animate-spin" />
          Memuat Forms…
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-xl border bg-card p-3">
            <label
              className="hidden text-xs font-semibold text-muted-foreground xl:block"
              htmlFor="form-library"
            >
              DAFTAR FORM · {list.length}
            </label>
            <select
              id="form-library"
              aria-label="Pilih form"
              className={control + " !mt-0 xl:hidden"}
              disabled={busy || dirty}
              value={selected?.id || ""}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">Pilih form…</option>
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.draft.title}
                </option>
              ))}
            </select>
            <div className="hidden xl:block">
              <div className="relative my-3">
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  aria-label="Cari form"
                  placeholder="Cari form…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <nav
                aria-label="Daftar form"
                className="max-h-[65vh] space-y-1 overflow-y-auto"
              >
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    disabled={busy || dirty}
                    aria-current={selected?.id === r.id ? "page" : undefined}
                    onClick={() => choose(r.id)}
                    className={
                      "block w-full min-w-0 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 " +
                      (selected?.id === r.id
                        ? "border-primary/30 bg-primary/5"
                        : "border-transparent hover:bg-muted/50")
                    }
                  >
                    <strong className="block break-words text-sm font-medium">
                      {r.draft.title}
                    </strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {r.active
                        ? "Aktif"
                        : r.published_revision
                          ? "Dijeda"
                          : "Draft"}{" "}
                      · v{r.published_revision}
                    </span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    Belum ada form.
                  </p>
                )}
              </nav>
            </div>
            {dirty && (
              <p className="mt-3 hidden text-xs text-muted-foreground xl:block">
                Simpan atau batalkan perubahan sebelum berpindah form.
              </p>
            )}
          </aside>
          {draft && selected ? (
            <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">
                    {draft.title || "Form tanpa judul"}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {busy ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        Memproses…
                      </>
                    ) : dirty ? (
                      "Perubahan belum tersimpan"
                    ) : (
                      <>
                        <Check className="size-3" />
                        Semua perubahan tersimpan
                      </>
                    )}{" "}
                    · {draft.fields.length}/50 pertanyaan
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      const accepted = await confirm({
                        title: "Hapus form?",
                        description: `Form “${selected.draft.title}” akan dihapus dari daftar dan tautan pengisiannya dinonaktifkan. Jawaban, lampiran, dan riwayat pencucian tetap tersimpan.${dirty ? " Perubahan draft yang belum disimpan akan dibuang." : ""}`,
                        confirmLabel: "Hapus form",
                        destructive: true,
                      });
                      if (accepted) await act("delete");
                    }}
                  >
                    <Trash2 />
                    Hapus form
                  </Button>
                  {dirty && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setDraft(selected.draft);
                        setActive(0);
                        setInvalidFields([]);
                        setError("");
                      }}
                    >
                      Batalkan perubahan
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy}
                    onClick={() => act("save", draft)}
                  >
                    <Save />
                    Simpan draft
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || dirty}
                    onClick={() => act("publish")}
                  >
                    Terbitkan
                  </Button>
                </div>
              </div>
              <div
                className="grid grid-cols-4 border-b bg-card"
                role="tablist"
                aria-label="Pengaturan form"
              >
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    id={"tab-" + t.key}
                    role="tab"
                    aria-selected={tab === t.key}
                    aria-controls={"panel-" + t.key}
                    tabIndex={tab === t.key ? 0 : -1}
                    onClick={() => setTab(t.key)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                        e.preventDefault();
                        const index =
                          (tabs.findIndex((x) => x.key === tab) +
                            (e.key === "ArrowRight" ? 1 : 3)) %
                          4;
                        setTab(tabs[index].key);
                        document
                          .getElementById("tab-" + tabs[index].key)
                          ?.focus();
                      }
                    }}
                    className={
                      "flex min-h-12 flex-col items-center justify-center gap-1 border-b-2 px-1 py-2 text-[11px] transition-colors sm:flex-row sm:gap-2 sm:text-sm " +
                      (tab === t.key
                        ? "border-primary bg-card font-medium text-primary"
                        : "border-transparent bg-card text-foreground hover:bg-muted/50")
                    }
                  >
                    <t.icon className="size-4" />
                    {t.name}
                    {t.key === "responses" && (
                      <span className="hidden sm:inline">
                        ({selected.submissions?.length || 0})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div
                id={"panel-" + tab}
                role="tabpanel"
                aria-labelledby={"tab-" + tab}
                className="min-w-0 p-4 sm:p-5"
              >
                {tab === "questions" && (
                  <div className="space-y-5">
                    <button
                      type="button"
                      aria-expanded={infoOpen}
                      onClick={() => setInfoOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium sm:hidden"
                    >
                      Judul & deskripsi
                      <ChevronDown
                        className={
                          "size-4 transition-transform " +
                          (infoOpen ? "rotate-180" : "")
                        }
                      />
                    </button>
                    <div
                      className={
                        (infoOpen ? "grid" : "hidden") +
                        " gap-4 sm:grid sm:grid-cols-2"
                      }
                    >
                      <label className="text-sm font-medium">
                        Judul
                        <Input
                          className="mt-1.5"
                          maxLength={150}
                          value={draft.title}
                          disabled={busy}
                          onChange={(e) =>
                            setDraft({ ...draft, title: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-sm font-medium">
                        Deskripsi
                        <textarea
                          className={control}
                          rows={2}
                          maxLength={1000}
                          value={draft.description}
                          disabled={busy}
                          onChange={(e) =>
                            setDraft({ ...draft, description: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="min-w-0 space-y-3">
                        <div className="flex items-center gap-2 lg:hidden">
                          <select
                            aria-label="Pilih pertanyaan"
                            className={control}
                            value={active}
                            onChange={(e) => setActive(Number(e.target.value))}
                          >
                            {draft.fields.map((q, i) => (
                              <option key={q.id} value={i}>
                                {i + 1}. {q.label}
                              </option>
                            ))}
                          </select>
                          <Button
                            aria-label="Pertanyaan sebelumnya"
                            size="icon-sm"
                            variant="outline"
                            disabled={active === 0}
                            onClick={() => setActive((v) => v - 1)}
                          >
                            <ChevronLeft />
                          </Button>
                          <Button
                            aria-label="Pertanyaan berikutnya"
                            size="icon-sm"
                            variant="outline"
                            disabled={active === draft.fields.length - 1}
                            onClick={() => setActive((v) => v + 1)}
                          >
                            <ChevronRight />
                          </Button>
                        </div>
                        <ol
                          className="hidden max-h-[470px] space-y-1 overflow-y-auto rounded-lg border p-2 lg:block"
                          aria-label="Urutan pertanyaan"
                        >
                          {draft.fields.map((q, i) => (
                            <li key={q.id}>
                              <button
                                onClick={() => setActive(i)}
                                aria-current={i === active ? "step" : undefined}
                                className={
                                  "flex w-full min-w-0 gap-2 rounded-md px-2 py-2.5 text-left text-sm " +
                                  (invalidFields.includes(q.id)
                                    ? "bg-destructive/5 text-destructive"
                                    : i === active
                                      ? "bg-primary/10 text-primary"
                                      : "hover:bg-muted/50")
                                }
                              >
                                <span className="w-5 shrink-0 text-xs tabular-nums">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <span className="min-w-0 break-words">
                                  {q.label || "Tanpa label"}
                                  {q.required && (
                                    <span className="ml-1 text-destructive">
                                      *
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ol>
                        <div className="grid grid-cols-3 gap-1 lg:grid-cols-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-12 min-w-0 flex-col gap-1 px-1 py-2 text-[11px] lg:min-h-9 lg:flex-row lg:text-xs"
                            disabled={busy || draft.fields.length >= 50}
                            onClick={() => add()}
                          >
                            <Plus />
                            Pertanyaan
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-12 min-w-0 flex-col gap-1 px-1 py-2 text-[11px] lg:min-h-9 lg:flex-row lg:text-xs"
                            disabled={busy || draft.fields.length >= 50}
                            onClick={() => add("reference")}
                          >
                            <Database />
                            Data ERP
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-12 min-w-0 flex-col gap-1 px-1 py-2 text-[11px] lg:min-h-9 lg:flex-row lg:text-xs"
                            disabled={
                              busy ||
                              draft.fields.filter((q) => q.type === "file")
                                .length >= 3
                            }
                            onClick={() => add("file")}
                          >
                            <Upload />
                            Lampiran
                          </Button>
                        </div>
                      </div>
                      {f && (
                        <fieldset
                          key={f.id}
                          className={
                            "min-w-0 space-y-5 rounded-xl border bg-background p-4 sm:p-5 " +
                            (invalidFields.includes(f.id)
                              ? "border-destructive"
                              : "")
                          }
                          disabled={busy}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              PERTANYAAN {active + 1}
                              {f.binding ? " · TERHUBUNG ERP" : ""}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                aria-label="Naik"
                                title="Pindahkan ke atas"
                                size="icon-sm"
                                variant="ghost"
                                disabled={active === 0}
                                onClick={() => move(-1)}
                              >
                                <ArrowUp />
                              </Button>
                              <Button
                                aria-label="Turun"
                                title="Pindahkan ke bawah"
                                size="icon-sm"
                                variant="ghost"
                                disabled={active === draft.fields.length - 1}
                                onClick={() => move(1)}
                              >
                                <ArrowDown />
                              </Button>
                              {!f.binding && (
                                <Button
                                  aria-label="Hapus pertanyaan"
                                  title="Hapus pertanyaan"
                                  size="icon-sm"
                                  variant="ghost"
                                  disabled={draft.fields.length <= 1}
                                  onClick={() => {
                                    setDraft({
                                      ...draft,
                                      fields: draft.fields.filter(
                                        (_, i) => i !== active,
                                      ),
                                    });
                                    setActive(Math.max(0, active - 1));
                                  }}
                                >
                                  <Trash2 />
                                </Button>
                              )}
                            </div>
                          </div>
                          <label className="block text-sm font-medium">
                            Label
                            <Input
                              className="mt-1.5"
                              value={f.label}
                              maxLength={300}
                              onChange={(e) => field({ label: e.target.value })}
                            />
                          </label>
                          <label className="block text-sm font-medium">
                            Tipe
                            <select
                              aria-label={"Tipe pertanyaan " + (active + 1)}
                              className={control}
                              value={f.type}
                              disabled={Boolean(f.binding)}
                              onChange={(e) =>
                                field({
                                  type: e.target.value as FormField["type"],
                                  source: undefined,
                                  options: [],
                                })
                              }
                            >
                              {Object.entries(types).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {f.type === "reference" && (
                            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                              <label className="block text-sm font-medium">
                                Sumber data ERP
                                <select
                                  aria-label="Sumber data ERP"
                                  value={f.source || ""}
                                  className={control}
                                  onChange={(e) =>
                                    field({
                                      source: e.target
                                        .value as FormField["source"],
                                    })
                                  }
                                >
                                  <option value="">Pilih sumber data…</option>
                                  {[
                                    ...new Set(
                                      referenceSources.map((s) => s.group),
                                    ),
                                  ].map((group) => (
                                    <optgroup key={group} label={group}>
                                      {referenceSources
                                        .filter((s) => s.group === group)
                                        .map((s) => (
                                          <option key={s.key} value={s.key}>
                                            {s.label}
                                          </option>
                                        ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </label>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                Pengisi mencari dan memilih data ERP. Akses
                                mengikuti izin penerbit dan modul yang aktif.
                              </p>
                            </div>
                          )}
                          {f.type === "select" &&
                            ![
                              "Area Kerja",
                              "Nama Alat",
                              "Nama Petugas",
                              "Nama Pemeriksa/Penanggung Jawab Verifikasi",
                            ].includes(f.binding || "") && (
                              <label className="block text-sm font-medium">
                                Pilihan, satu per baris
                                <textarea
                                  className={control}
                                  rows={5}
                                  value={f.options.join("\n")}
                                  onChange={(e) =>
                                    field({
                                      options: e.target.value.split("\n"),
                                    })
                                  }
                                />
                              </label>
                            )}
                          {f.binding && (
                            <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                              Terhubung ke pemeriksaan pencucian alat. Label dan
                              urutan dapat diubah; tipe serta kewajiban
                              pengisian tetap.
                            </p>
                          )}
                          {f.type === "file" && (
                            <p className="text-xs text-muted-foreground">
                              PDF, JPG, PNG · 2 MB per file · 3 MB total per
                              jawaban.
                            </p>
                          )}
                          <label className="flex cursor-pointer items-center justify-between gap-3 border-t pt-4 text-sm font-medium">
                            Wajib diisi
                            <input
                              className="size-4 accent-primary"
                              type="checkbox"
                              checked={f.required}
                              disabled={Boolean(f.binding)}
                              onChange={(e) =>
                                field({ required: e.target.checked })
                              }
                            />
                          </label>
                        </fieldset>
                      )}
                    </div>
                  </div>
                )}
                {tab === "preview" && (
                  <div className="mx-auto max-w-2xl space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Pratinjau draft · tidak mengirim jawaban
                    </p>
                    <div className="rounded-xl border-t-4 border-t-primary bg-background p-5">
                      <h3 className="break-words text-xl font-semibold">
                        {draft.title}
                      </h3>
                      {draft.description && (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {draft.description}
                        </p>
                      )}
                    </div>
                    {draft.fields.map((q, i) => (
                      <div
                        key={q.id}
                        className="min-w-0 rounded-xl border bg-background p-5"
                      >
                        <p className="mb-3 break-words text-sm font-medium">
                          <span className="mr-2 text-muted-foreground">
                            {i + 1}.
                          </span>
                          {q.label}
                          {q.required && (
                            <span className="ml-1 text-destructive">*</span>
                          )}
                        </p>
                        {q.type === "reference" ? (
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="flex items-center gap-2 text-sm">
                              <Search className="size-4" />
                              Cari{" "}
                              {referenceSources
                                .find((s) => s.key === q.source)
                                ?.label.toLowerCase() || "data ERP"}
                              …
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Pilihan langsung tersedia pada form yang
                              diterbitkan.
                            </p>
                          </div>
                        ) : q.type === "textarea" ? (
                          <textarea
                            aria-label={q.label}
                            className={control}
                            rows={3}
                            disabled
                          />
                        ) : q.type === "select" ? (
                          <select
                            aria-label={q.label}
                            className={control}
                            disabled
                          >
                            <option>Pilih…</option>
                            {q.options.map((o, j) => (
                              <option key={j}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            aria-label={q.label}
                            className={control}
                            type={q.type}
                            disabled
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {tab === "responses" && (
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">Jawaban terbaru</h3>
                      <span className="text-xs text-muted-foreground">
                        Maksimal 100 jawaban terbaru
                      </span>
                    </div>
                    {!selected.submissions?.length && (
                      <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-muted-foreground">
                        <MessageSquare className="size-7" />
                        <p className="text-sm">Belum ada jawaban.</p>
                      </div>
                    )}
                    {selected.submissions?.map((s) => (
                      <details
                        key={s.id}
                        className="min-w-0 rounded-lg border bg-background"
                      >
                        <summary className="cursor-pointer p-4 text-sm font-medium">
                          {new Date(s.created_at).toLocaleString("id-ID", {
                            timeZone: "Asia/Jakarta",
                          })}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            Versi {s.revision}
                          </span>
                        </summary>
                        <dl className="grid min-w-0 divide-y border-t px-4">
                          {s.template.fields
                            .filter((q) => q.type !== "file")
                            .map((q) => (
                              <div
                                key={q.id}
                                className="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4"
                              >
                                <dt className="break-words text-xs text-muted-foreground">
                                  {q.label}
                                </dt>
                                <dd className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                                  {s.answers[q.id] || "—"}
                                </dd>
                              </div>
                            ))}
                        </dl>
                        {s.files.map((file, i) => (
                          <a
                            key={i}
                            className="mx-4 mb-4 flex items-center gap-2 break-all text-sm text-primary underline"
                            href={"/api/forms/" + s.id + "/files/" + i}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText className="size-4 shrink-0" />
                            {file.name}
                          </a>
                        ))}
                      </details>
                    ))}
                  </section>
                )}
                {tab === "share" && (
                  <div className="mx-auto max-w-xl space-y-5 py-2">
                    <div className="rounded-xl border bg-background p-5">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "size-2 rounded-full " +
                            (selected.active
                              ? "bg-primary"
                              : "bg-muted-foreground")
                          }
                        />
                        <h3 className="font-semibold">
                          {selected.active
                            ? "Menerima jawaban"
                            : "Belum menerima jawaban"}
                        </h3>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selected.active
                          ? "Tautan dapat diisi tanpa login."
                          : "Terbitkan form untuk membagikan tautan pengisian."}
                      </p>
                      {selected.active && (
                        <>
                          <div className="mt-4 flex min-w-0 items-center gap-2 rounded-lg border bg-muted/20 p-2">
                            <span className="min-w-0 flex-1 break-all text-xs">
                              {typeof window !== "undefined"
                                ? window.location.origin
                                : ""}
                              /forms/{selected.public_token}
                            </span>
                            <Button
                              aria-label="Salin link"
                              size="icon-sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    location.origin +
                                      "/forms/" +
                                      selected.public_token,
                                  );
                                  setNotice("Tautan disalin.");
                                } catch {
                                  setError(
                                    "Tidak dapat menyalin. Salin alamat melalui Buka form.",
                                  );
                                }
                              }}
                            >
                              <Copy />
                            </Button>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <a
                              className="rounded-lg border px-4 py-2 text-sm"
                              href={"/forms/" + selected.public_token}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Buka form
                            </a>
                            <a
                              className="rounded-lg border px-4 py-2 text-sm"
                              href={"/api/forms/" + selected.id + "/qr"}
                            >
                              Unduh QR
                            </a>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => act("pause")}
                            >
                              Jeda
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    {dirty && (
                      <p className="text-sm text-muted-foreground">
                        Perubahan draft belum terlihat pada tautan. Simpan dan
                        terbitkan untuk memperbaruinya.
                      </p>
                    )}
                    <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                      <span className="font-medium">
                        Versi terbit: {selected.published_revision}
                      </span>
                      <p className="mt-1 text-muted-foreground">
                        Jawaban menyimpan versi form dan label referensi saat
                        dikirim.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 text-center">
              <FileText className="size-8 text-primary" />
              <h2 className="font-semibold">Pilih atau buat form</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Susun pertanyaan, hubungkan data ERP, lalu bagikan tautan
                pengisian.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
