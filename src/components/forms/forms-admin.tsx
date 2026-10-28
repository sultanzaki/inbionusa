"use client";
import { useUser } from "@/app/(dashboard)/user-context";
import { canAction } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { useEffect, useRef, useState } from "react";
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
import { FormAutomation, FieldAutomation } from "./form-automation";
import {
  cleaningIntegrationIssues,
  type IntegrationIssue,
} from "@/lib/forms/cleaning-template";
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
  text: "Short text",
  textarea: "Paragraph",
  number: "Number",
  date: "Date",
  time: "Time",
  select: "Single choice",
  reference: "ERP data reference",
  file: "File upload",
};
const control =
  "mt-1.5 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60";
const tabs = [
  { key: "questions", name: "Questions", icon: ListChecks },
  { key: "preview", name: "Preview", icon: Eye },
  { key: "responses", name: "Responses", icon: MessageSquare },
  { key: "share", name: "Share", icon: Link2 },
] as const;
export function FormsAdmin() {
  const { t, locale } = useLocale();
  const { user } = useUser();
  const allowed = Boolean(user && canAction(user, "manage_users"));
  const confirm = useConfirm();
  const mutating = useRef(false);
  const leaving = useRef(false);
  const pendingRequest = useRef<{ key: string; payload: string } | null>(null);
  const [list, setList] = useState<RecordForm[]>([]),
    [ready, setReady] = useState(false),
    [selected, setSelected] = useState<RecordForm | null>(null),
    [draft, setDraft] = useState<Template | null>(null),
    [busy, setBusy] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [active, setActive] = useState(0),
    [tab, setTab] = useState<(typeof tabs)[number]["key"]>("questions"),
    [search, setSearch] = useState(""),
    [invalidFields, setInvalidFields] = useState<string[]>([]),
    [integrationErrors, setIntegrationErrors] = useState<IntegrationIssue[]>(
      [],
    ),
    [infoOpen, setInfoOpen] = useState(false);
  const dirty = Boolean(
    selected &&
    draft &&
    JSON.stringify(draft) !== JSON.stringify(selected.draft),
  );
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!leaving.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigate = async (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? (event.target.closest("a[href]") as HTMLAnchorElement | null)
          : null;
      if (
        !link ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const url = new URL(link.href);
      if (
        url.origin === location.origin &&
        url.pathname === location.pathname &&
        url.search === location.search
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const discard = await confirm({
        title: t("Discard your changes?"),
        description: t("You have unsaved changes."),
        confirmLabel: t("Discard changes"),
      });
      if (discard) {
        leaving.current = true;
        location.assign(url.href);
      }
    };
    window.addEventListener("beforeunload", handler);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, confirm, t]);

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
    if (!allowed) return;
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
  }, [allowed]);
  async function act(action: string, template?: Template) {
    if (mutating.current) return;
    if (action === "publish" && draft) {
      const issues = cleaningIntegrationIssues(draft);
      setIntegrationErrors(issues);
      if (issues.length) {
        setTab("questions");
        setInvalidFields(issues.flatMap((i) => (i.fieldId ? [i.fieldId] : [])));
        setError("Complete cleaning integration before publishing.");
        return;
      }
    }
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
          "Review the title, labels and question settings. ERP references need a data source; single-choice questions need options.",
        );
        return;
      }
      template = checked.data;
    }
    mutating.current = true;
    let saved = false;
    setBusy(true);
    setError("");
    setNotice("");
    setInvalidFields([]);
    try {
      const payload = {
        action,
        id: selected?.id,
        version: selected?.version,
        template,
      };
      const serialized = JSON.stringify(payload);
      if (pendingRequest.current?.payload !== serialized)
        pendingRequest.current = {
          key: crypto.randomUUID(),
          payload: serialized,
        };
      const r = await fetch("/api/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            request_key: pendingRequest.current.key,
          }),
        }),
        v = await r.json();
      if (!r.ok) {
        if (v.integration_errors) {
          setIntegrationErrors(v.integration_errors);
          setTab("questions");
        }
        throw Error(v.message);
      }
      setIntegrationErrors([]);
      saved = true;
      pendingRequest.current = null;
      if (action === "delete") {
        await load();
        setSelected(null);
        setDraft(null);
        setActive(0);
        setTab("questions");
        setNotice(
          "Form deleted. Responses and attachments remain in the history.",
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
          ? "Form published."
          : action === "pause"
            ? "Responses paused."
            : "Changes saved.",
      );
    } catch (e) {
      setError(
        saved
          ? "Changes were saved, but the view could not refresh. Reload this page."
          : e instanceof Error
            ? e.message
            : "Could not save. Retry.",
      );
    } finally {
      mutating.current = false;
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
    setIntegrationErrors([]);
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
              ? "ERP reference"
              : type === "file"
                ? "Attachment"
                : "New question",
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
    setDetailLoading(true);
    setIntegrationErrors([]);
    setInvalidFields([]);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await load(id);
      setActive(0);
      setTab("questions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the form.");
    } finally {
      setDetailLoading(false);
      setBusy(false);
    }
  }
  const f = draft?.fields[active];
  const filtered = list.filter((r) =>
    r.draft.title.toLowerCase().includes(search.toLowerCase()),
  );
  if (!allowed)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Administrator access is required to manage forms.")}
      </p>
    );
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1440px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {t("Administration")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {t("Forms")}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || dirty}
            onClick={() =>
              act("create", {
                title: "New form",
                description: "",
                kind: "general",
                fields: [
                  {
                    id: "name",
                    label: "Respondent name",
                    type: "text",
                    required: true,
                    options: [],
                  },
                ],
              })
            }
          >
            <Plus />
            {t("New form")}
          </Button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {t(error)}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary"
        >
          <Check className="size-4" />
          {t(notice)}
        </p>
      )}
      {!ready ? (
        <div
          role="status"
          className="flex min-h-64 items-center justify-center gap-2 rounded-xl border bg-card"
        >
          <Loader2 className="size-4 animate-spin" />
          {t("Loading forms…")}
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-xl border bg-card p-3">
            <label
              className="hidden text-xs font-semibold text-muted-foreground xl:block"
              htmlFor="form-library"
            >
              {t("Form library")} · {list.length}
            </label>
            <select
              id="form-library"
              aria-label={t("Select form")}
              className={control + " !mt-0 xl:hidden"}
              disabled={busy || dirty}
              value={selected?.id || ""}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">{t("Select form…")}</option>
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
                  aria-label={t("Search forms")}
                  placeholder={t("Search forms…")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <nav
                aria-label={t("Form library")}
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
                      {t(
                        r.active
                          ? "Active"
                          : r.published_revision
                            ? "Paused"
                            : "Draft",
                      )}{" "}
                      · v{r.published_revision}
                    </span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    {t("No forms yet.")}
                  </p>
                )}
              </nav>
            </div>
            {dirty && (
              <p className="mt-3 hidden text-xs text-muted-foreground xl:block">
                {t("Save or discard changes before switching forms.")}
              </p>
            )}
          </aside>
          {detailLoading ? (
            <section
              role="status"
              aria-label={t("Loading form…")}
              className="min-h-80 space-y-5 rounded-xl border bg-card p-5"
            >
              <span className="sr-only">{t("Loading form…")}</span>
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-20 animate-pulse rounded-lg bg-muted/20 motion-reduce:animate-none"
                />
              ))}
            </section>
          ) : draft && selected ? (
            <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">
                    {draft.title || t("Untitled form")}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {busy ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        {t("Processing…")}
                      </>
                    ) : dirty ? (
                      t("Unsaved changes")
                    ) : (
                      <>
                        <Check className="size-3" />
                        {t("All changes saved")}
                      </>
                    )}{" "}
                    · {draft.fields.length}
                    {t("/50 questions")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      const accepted = await confirm({
                        title: t("Delete form?"),
                        description:
                          selected.draft.title +
                          " — " +
                          t(
                            "The form will be removed and its link disabled. Responses, attachments and cleaning history will be retained.",
                          ) +
                          (dirty
                            ? " " +
                              t("Unsaved draft changes will be discarded.")
                            : ""),
                        confirmLabel: t("Delete form"),
                        destructive: true,
                      });
                      if (accepted) await act("delete");
                    }}
                  >
                    <Trash2 />
                    {t("Delete form")}
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
                      {t("Discard changes")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy}
                    onClick={() => act("save", draft)}
                  >
                    <Save />
                    {t("Save draft")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || dirty}
                    onClick={() => act("publish")}
                  >
                    {t("Publish")}
                  </Button>
                </div>
              </div>
              <div
                className="grid grid-cols-4 border-b bg-card"
                role="tablist"
                aria-label={t("Form settings")}
              >
                {tabs.map((tabItem) => (
                  <button
                    key={tabItem.key}
                    id={"tab-" + tabItem.key}
                    role="tab"
                    aria-selected={tab === tabItem.key}
                    aria-controls={"panel-" + tabItem.key}
                    tabIndex={tab === tabItem.key ? 0 : -1}
                    onClick={() => setTab(tabItem.key)}
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
                      (tab === tabItem.key
                        ? "border-primary bg-card font-medium text-primary"
                        : "border-transparent bg-card text-foreground hover:bg-muted/50")
                    }
                  >
                    <tabItem.icon className="size-4" />
                    {t(tabItem.name)}
                    {tabItem.key === "responses" && (
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
                      {t("Title & description")}
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
                        {t("Title")}
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
                        {t("Description")}
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
                    <FormAutomation
                      template={draft}
                      disabled={busy}
                      issues={integrationErrors}
                      onChange={(next) => {
                        setDraft(next);
                        setIntegrationErrors([]);
                        setNotice("");
                      }}
                    />
                    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="min-w-0 space-y-3">
                        <div className="flex items-center gap-2 lg:hidden">
                          <select
                            aria-label={t("Select question")}
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
                            aria-label={t("Previous question")}
                            size="icon-sm"
                            variant="outline"
                            disabled={active === 0}
                            onClick={() => setActive((v) => v - 1)}
                          >
                            <ChevronLeft />
                          </Button>
                          <Button
                            aria-label={t("Next question")}
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
                          aria-label={t("Question order")}
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
                                  {q.label || t("Untitled question")}
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
                            {t("Questions")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-12 min-w-0 flex-col gap-1 px-1 py-2 text-[11px] lg:min-h-9 lg:flex-row lg:text-xs"
                            disabled={busy || draft.fields.length >= 50}
                            onClick={() => add("reference")}
                          >
                            <Database />
                            {t("ERP data")}
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
                            {t("Attachment")}
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
                              {t("Question")} {active + 1}
                              {f.binding ? " · " + t("ERP linked") : ""}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                aria-label={t("Move up")}
                                title={t("Move question up")}
                                size="icon-sm"
                                variant="ghost"
                                disabled={active === 0}
                                onClick={() => move(-1)}
                              >
                                <ArrowUp />
                              </Button>
                              <Button
                                aria-label={t("Move down")}
                                title={t("Move question down")}
                                size="icon-sm"
                                variant="ghost"
                                disabled={active === draft.fields.length - 1}
                                onClick={() => move(1)}
                              >
                                <ArrowDown />
                              </Button>
                              {
                                <Button
                                  aria-label={t("Delete question")}
                                  title={t("Delete question")}
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
                              }
                            </div>
                          </div>
                          <label className="block text-sm font-medium">
                            {t("Label")}
                            <Input
                              className="mt-1.5"
                              value={f.label}
                              maxLength={300}
                              onChange={(e) => field({ label: e.target.value })}
                            />
                          </label>
                          <label className="block text-sm font-medium">
                            {t("Type")}
                            <select
                              aria-label={
                                t("Question type") + " " + (active + 1)
                              }
                              className={control}
                              value={f.type}
                              onChange={(e) =>
                                field({
                                  type: e.target.value as FormField["type"],
                                  source: undefined,
                                  options: [],
                                  value_map: undefined,
                                })
                              }
                            >
                              {Object.entries(types).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {t(label)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {f.type === "reference" && (
                            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                              <label className="block text-sm font-medium">
                                {t("ERP data source")}
                                <select
                                  aria-label={t("ERP data source")}
                                  value={f.source || ""}
                                  className={control}
                                  onChange={(e) =>
                                    field({
                                      source: e.target
                                        .value as FormField["source"],
                                    })
                                  }
                                >
                                  <option value="">
                                    {t("Select data source…")}
                                  </option>
                                  {[
                                    ...new Set(
                                      referenceSources.map((s) => s.group),
                                    ),
                                  ].map((group) => (
                                    <optgroup key={group} label={t(group)}>
                                      {referenceSources
                                        .filter((s) => s.group === group)
                                        .map((s) => (
                                          <option key={s.key} value={s.key}>
                                            {t(s.label)}
                                          </option>
                                        ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </label>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {t(
                                  "Respondents search and select ERP records. Access follows the publisher’s permissions and enabled modules.",
                                )}
                              </p>
                            </div>
                          )}
                          {f.type === "select" && (
                            <label className="block text-sm font-medium">
                              {t("Options, one per line")}
                              <textarea
                                aria-label={t("Options, one per line")}
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
                          {draft.kind === "equipment_cleaning" && (
                            <FieldAutomation
                              field={f}
                              disabled={busy}
                              onChange={field}
                            />
                          )}
                          {f.type === "file" && (
                            <p className="text-xs text-muted-foreground">
                              {t(
                                "PDF, JPG, PNG · 2 MB per file · 3 MB total per response.",
                              )}
                            </p>
                          )}
                          <label className="flex cursor-pointer items-center justify-between gap-3 border-t pt-4 text-sm font-medium">
                            {t("Required")}
                            <input
                              className="size-4 accent-primary"
                              type="checkbox"
                              checked={f.required}
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
                      {t("Draft preview · no responses submitted")}
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
                              {t("Search")}{" "}
                              {t(
                                referenceSources.find((s) => s.key === q.source)
                                  ?.label || "ERP records",
                              )}
                              …
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {t(
                                "Options are available in the published form.",
                              )}
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
                            <option>{t("Select…")}</option>
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
                      <h3 className="font-semibold">{t("Recent responses")}</h3>
                      <span className="text-xs text-muted-foreground">
                        {t("Latest 100 responses")}
                      </span>
                    </div>
                    {!selected.submissions?.length && (
                      <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-muted-foreground">
                        <MessageSquare className="size-7" />
                        <p className="text-sm">{t("No responses yet.")}</p>
                      </div>
                    )}
                    {selected.submissions?.map((s) => (
                      <details
                        key={s.id}
                        className="min-w-0 rounded-lg border bg-background"
                      >
                        <summary className="cursor-pointer p-4 text-sm font-medium">
                          {new Date(s.created_at).toLocaleString(
                            locale === "id" ? "id-ID" : "en-GB",
                            {
                              timeZone: "Asia/Jakarta",
                            },
                          )}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {t("Revision")} {s.revision}
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
                          {t(
                            selected.active
                              ? "Accepting responses"
                              : "Not accepting responses",
                          )}
                        </h3>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t(
                          selected.active
                            ? "Anyone with the link can respond without signing in."
                            : "Publish the form to share its link.",
                        )}
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
                              aria-label={t("Copy link")}
                              size="icon-sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    location.origin +
                                      "/forms/" +
                                      selected.public_token,
                                  );
                                  setNotice("Link copied.");
                                } catch {
                                  setError(
                                    "Could not copy the link. Open the form and copy its address.",
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
                              {t("Open form")}
                            </a>
                            <a
                              className="rounded-lg border px-4 py-2 text-sm"
                              href={"/api/forms/" + selected.id + "/qr"}
                            >
                              {t("Download QR")}
                            </a>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => act("pause")}
                            >
                              {t("Pause")}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    {dirty && (
                      <p className="text-sm text-muted-foreground">
                        {t(
                          "Draft changes are not live. Save and publish to update the shared form.",
                        )}
                      </p>
                    )}
                    <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                      <span className="font-medium">
                        {t("Published revision:")} {selected.published_revision}
                      </span>
                      <p className="mt-1 text-muted-foreground">
                        {t(
                          "Responses retain the form revision and reference labels at submission.",
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 text-center">
              <FileText className="size-8 text-primary" />
              <h2 className="font-semibold">{t("Select or create a form")}</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t(
                  "Add questions, connect ERP records, then share the form link.",
                )}
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
