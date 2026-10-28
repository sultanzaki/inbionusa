"use client";
import {
  useEffect,
  useState,
  useRef,
  useMemo,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import {
  Check,
  CheckCheck,
  ClipboardList,
  AlertCircle,
  ArrowUpRight,
  Paperclip,
  X,
} from "lucide-react";
import { formSections } from "@/lib/forms/layout";
import { validateAnswers } from "@/lib/forms/schema";
import { Button } from "@/components/ui/button";
import type { PublicForm } from "@/lib/forms/public";
import { ReferencePicker } from "./reference-picker";
import { resolvedTemplate } from "@/lib/forms/public";
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;
export function PublicFormPage({
  token,
  initialForm,
  initialError = "",
}: {
  token: string;
  initialForm: PublicForm | null;
  initialError?: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientHydrated,
    serverHydrated,
  );
  const form = initialForm;
  const [values, updateValues] = useState<Record<string, string>>({}),
    [files, setFiles] = useState<Record<string, File>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(initialError),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [cleaningResult, setCleaningResult] = useState("");
  const locked = !hydrated || busy;
  const equipmentById = useMemo(
    () => new Map(form?.equipment.map((e) => [e.id, e]) || []),
    [form],
  );
  const staffById = useMemo(
    () => new Map(form?.staff.map((u) => [u.id, u]) || []),
    [form],
  );
  function setValues(
    update: (previous: Record<string, string>) => Record<string, string>,
  ) {
    const next = update(values);
    updateValues(next);
    if (form) {
      const checked = validateAnswers(
        resolvedTemplate(form),
        next,
        Object.keys(files),
      );
      setErrors((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(
            ([id]) => next[id] === values[id] || Boolean(checked.errors[id]),
          ),
        ),
      );
    }
  }
  const key = useRef("");
  const sending = useRef(false);
  useEffect(() => {
    key.current = crypto.randomUUID();
  }, [token]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || sending.current) return;
    const checked = validateAnswers(
      resolvedTemplate(form),
      values,
      Object.keys(files),
    );
    for (const [id, file] of Object.entries(files)) {
      if (file.size > 2000000)
        checked.errors[id] = "Ukuran lampiran maksimal 2 MB.";
      if (!file.size) checked.errors[id] = "File kosong. Pilih file lain.";
    }
    if (Object.values(files).reduce((sum, f) => sum + f.size, 0) > 3000000) {
      const id = Object.keys(files)[0];
      if (id) checked.errors[id] = "Ukuran total lampiran maksimal 3 MB.";
    }
    if (Object.keys(checked.errors).length) {
      setErrors(checked.errors);
      setMessage("Periksa bagian yang ditandai sebelum mengirim.");
      document.getElementById(Object.keys(checked.errors)[0])?.focus();
      return;
    }
    if (!key.current) key.current = crypto.randomUUID();
    sending.current = true;
    setBusy(true);
    setMessage("");
    setErrors({});
    try {
      const data = new FormData();
      data.set(
        "data",
        JSON.stringify({
          request_key: key.current,
          revision: form.revision,
          answers: values,
        }),
      );
      for (const [id, file] of Object.entries(files)) data.set(id, file);
      const r = await fetch("/api/forms/public/" + token, {
        method: "POST",
        body: data,
      });
      const v = await r.json();
      if (!r.ok) {
        setErrors(v.fields || {});
        const first = Object.keys(v.fields || {})[0];
        if (first)
          requestAnimationFrame(() => document.getElementById(first)?.focus());
        throw Error(v.message);
      }
      setCleaningResult(v.cleaning_result || "");
      setDone(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not send. Retry.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const template = useMemo(
    () => (form ? resolvedTemplate(form) : null),
    [form],
  );
  const sections = useMemo(
    () => (template ? formSections(template) : []),
    [template],
  );
  const filled = (id: string) => Boolean(values[id]?.trim() || files[id]);
  const required = template?.fields.filter((f) => f.required) || [];
  const completed = required.filter((f) => filled(f.id)).length;
  const progress = required.length
    ? Math.round((completed / required.length) * 100)
    : 0;
  const errorText = (text: string) =>
    ({
      "Required.": "Wajib diisi.",
      "Upload a file.": "Pilih lampiran.",
      "Choose an available option.": "Pilih salah satu pilihan yang tersedia.",
      "Enter a valid number.": "Masukkan angka yang valid.",
      "Enter a valid date.": "Masukkan tanggal yang valid.",
      "Enter a valid time.": "Masukkan waktu yang valid.",
    })[text] || text;
  return (
    <main
      lang="id"
      className="min-h-dvh bg-background px-4 py-5 text-foreground sm:px-6 sm:py-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="INBIONUSA"
            width={38}
            height={38}
            unoptimized
          />
          <span className="text-sm font-semibold tracking-wide">
            INBIONUSA
            <span className="ml-3 border-l pl-3 font-normal text-muted-foreground">
              Forms
            </span>
          </span>
        </div>
        {done ? (
          <section className="mx-auto max-w-xl rounded-2xl border bg-card p-6 sm:p-10">
            <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCheck className="size-7" />
            </div>
            <h1 className="text-2xl font-semibold">Jawaban berhasil dikirim</h1>
            <p className="mt-3 text-muted-foreground">
              {cleaningResult === "pass"
                ? "Catatan tersimpan. Alat siap digunakan kembali."
                : cleaningResult === "fail"
                  ? "Catatan tersimpan. Alat belum siap dan memerlukan tindak lanjut."
                  : "Data dan lampiran telah disimpan."}
            </p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Isi jawaban baru
            </Button>
          </section>
        ) : !template ? (
          <section
            role="alert"
            className="mx-auto max-w-xl rounded-xl border bg-card p-6"
          >
            <AlertCircle className="mb-3 size-6 text-muted-foreground" />
            <h1 className="font-semibold">Form tidak tersedia</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => location.reload()}
            >
              Coba lagi
            </Button>
          </section>
        ) : (
          <>
            <header className="mb-5 rounded-xl border-t-4 border border-t-primary bg-card p-5 sm:p-7">
              <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
                {template.title}
              </h1>
              {template.description && (
                <p className="mt-3 max-w-3xl whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                  {template.description}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="size-3.5" />
                  {template.fields.length} pertanyaan
                </span>
                <span>
                  <span className="font-semibold text-destructive">*</span>{" "}
                  Wajib diisi
                </span>
                <span>Versi {form?.revision}</span>
              </div>
            </header>
            <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="min-w-0 rounded-xl border bg-card p-4 lg:sticky lg:top-6">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">Kelengkapan</span>
                  <span className="tabular-nums text-muted-foreground">
                    {completed}/{required.length}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Pertanyaan wajib terisi"
                  aria-valuenow={completed}
                  aria-valuemin={0}
                  aria-valuemax={required.length || 1}
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: progress + "%" }}
                  />
                </div>
                {sections.length > 1 && (
                  <nav
                    aria-label="Bagian form"
                    className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1"
                  >
                    {sections.map((section, i) => (
                      <a
                        key={section.id}
                        href={"#" + section.id}
                        className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors hover:border-primary/30 hover:bg-primary/5 lg:border-transparent lg:px-2 lg:py-3 lg:text-sm"
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                          {section.fields
                            .filter((f) => f.required)
                            .every((f) => filled(f.id)) &&
                          section.fields.some((f) => f.required) ? (
                            <Check className="size-3" />
                          ) : (
                            i + 1
                          )}
                        </span>
                        <span>{section.title}</span>
                      </a>
                    ))}
                  </nav>
                )}
              </aside>
              <form noValidate onSubmit={submit} className="min-w-0 space-y-5">
                {sections.map((section, sectionIndex) => (
                  <section
                    key={section.id}
                    id={section.id}
                    aria-labelledby={section.id + "-title"}
                    className="scroll-mt-6 overflow-hidden rounded-xl border bg-card"
                  >
                    <div className="flex items-center gap-3 border-b px-4 py-4 sm:px-6">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                        {String(sectionIndex + 1).padStart(2, "0")}
                      </span>
                      <h2
                        id={section.id + "-title"}
                        className="text-sm font-semibold sm:text-base"
                      >
                        {section.title}
                      </h2>
                    </div>
                    <div className="grid min-w-0 gap-x-5 gap-y-6 p-4 sm:grid-cols-2 sm:p-6">
                      {section.fields.map((f) => {
                        let options = f.options;
                        const isBatch = f.binding?.startsWith(
                          "Batch Number Produksi",
                        );
                        if (isBatch) {
                          const ef = template.fields.find(
                            (x) => x.binding === "Nama Alat",
                          );
                          options = [
                            "-",
                            ...(form?.equipment.find(
                              (e) => e.id === (ef ? values[ef.id] : ""),
                            )?.batches || []),
                          ];
                        }
                        const dynamic =
                          f.binding === "Nama Alat" ||
                          [
                            "Nama Petugas",
                            "Nama Pemeriksa/Penanggung Jawab Verifikasi",
                          ].includes(f.binding || "");
                        if (f.binding === "Nama Alat") {
                          const areaField = template.fields.find(
                            (x) => x.binding === "Area Kerja",
                          );
                          options = options.filter(
                            (id) =>
                              !areaField ||
                              !values[areaField.id] ||
                              equipmentById.get(id)?.area ===
                                values[areaField.id],
                          );
                        }
                        const label = (id: string) =>
                          f.binding === "Nama Alat"
                            ? (() => {
                                const e = equipmentById.get(id);
                                return e ? e.code + " · " + e.name : "";
                              })()
                            : dynamic
                              ? (() => {
                                  const u = staffById.get(id);
                                  return u
                                    ? u.name + " · " + (u.username || "")
                                    : "";
                                })()
                              : id;
                        const style =
                          "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-base outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-70";
                        return (
                          <div
                            key={f.id}
                            className={
                              "min-w-0 " +
                              (["textarea", "reference", "file"].includes(
                                f.type,
                              ) || f.label.length > 65
                                ? "sm:col-span-2"
                                : "")
                            }
                          >
                            <label
                              htmlFor={f.id}
                              className="mb-2 block break-words text-sm font-medium leading-relaxed"
                            >
                              {f.label}
                              {f.required && (
                                <span className="ml-1 text-destructive">*</span>
                              )}
                            </label>
                            {f.type === "reference" ? (
                              <ReferencePicker
                                token={token}
                                field={f.id}
                                value={values[f.id] || ""}
                                disabled={locked}
                                required={f.required}
                                invalid={Boolean(errors[f.id])}
                                onChange={(id) =>
                                  setValues((v) => ({ ...v, [f.id]: id }))
                                }
                              />
                            ) : f.type === "file" ? (
                              <>
                                <div
                                  className={
                                    "flex min-w-0 flex-wrap items-center gap-3 rounded-lg border bg-background p-3 focus-within:ring-2 focus-within:ring-primary/20 " +
                                    (errors[f.id]
                                      ? "border-destructive"
                                      : "border-input")
                                  }
                                >
                                  <input
                                    id={f.id}
                                    aria-label={f.label}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    disabled={locked}
                                    className="sr-only"
                                    aria-invalid={Boolean(errors[f.id])}
                                    aria-describedby={
                                      errors[f.id] ? f.id + "-error" : undefined
                                    }
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      setFiles((v) => {
                                        const next = { ...v };
                                        if (file) next[f.id] = file;
                                        else delete next[f.id];
                                        return next;
                                      });
                                      setErrors((v) => {
                                        const next = { ...v };
                                        delete next[f.id];
                                        return next;
                                      });
                                    }}
                                  />
                                  <label
                                    htmlFor={f.id}
                                    className={
                                      "flex shrink-0 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium " +
                                      (busy
                                        ? "pointer-events-none opacity-60"
                                        : "hover:border-primary/40")
                                    }
                                  >
                                    <Paperclip className="size-4 text-primary" />
                                    Pilih file
                                  </label>
                                  <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">
                                    {files[f.id]
                                      ? files[f.id].name +
                                        " · " +
                                        Math.ceil(files[f.id].size / 1000) +
                                        " KB"
                                      : "Belum ada file"}
                                  </span>
                                  {files[f.id] && (
                                    <button
                                      type="button"
                                      disabled={locked}
                                      aria-label={"Hapus lampiran " + f.label}
                                      className="rounded p-2 text-muted-foreground hover:bg-muted/30"
                                      onClick={() => {
                                        setFiles((v) => {
                                          const next = { ...v };
                                          delete next[f.id];
                                          return next;
                                        });
                                        const input = document.getElementById(
                                          f.id,
                                        ) as HTMLInputElement | null;
                                        if (input) input.value = "";
                                      }}
                                    >
                                      <X className="size-4" />
                                    </button>
                                  )}
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  PDF, JPG, PNG · maksimal 2 MB/file, 3 MB
                                  total.
                                </p>
                              </>
                            ) : f.type === "select" || isBatch ? (
                              <select
                                id={f.id}
                                required={f.required}
                                disabled={locked}
                                value={values[f.id] || ""}
                                aria-invalid={Boolean(errors[f.id])}
                                aria-describedby={
                                  errors[f.id] ? f.id + "-error" : undefined
                                }
                                className={
                                  style +
                                  (errors[f.id]
                                    ? " border-destructive ring-1 ring-destructive/20"
                                    : "")
                                }
                                onChange={(e) =>
                                  setValues((v) => {
                                    const n = { ...v, [f.id]: e.target.value };
                                    if (f.binding === "Nama Alat") {
                                      const eq = form?.equipment.find(
                                          (x) => x.id === e.target.value,
                                        ),
                                        area = template.fields.find(
                                          (x) => x.binding === "Area Kerja",
                                        ),
                                        batch = template.fields.find((x) =>
                                          x.binding?.startsWith(
                                            "Batch Number Produksi",
                                          ),
                                        );
                                      if (area && eq) n[area.id] = eq.area;
                                      if (batch) delete n[batch.id];
                                    }
                                    if (f.binding === "Area Kerja") {
                                      const eq = template.fields.find(
                                        (x) => x.binding === "Nama Alat",
                                      );
                                      if (eq) delete n[eq.id];
                                      const batch = template.fields.find((x) =>
                                        x.binding?.startsWith(
                                          "Batch Number Produksi",
                                        ),
                                      );
                                      if (batch) delete n[batch.id];
                                    }
                                    return n;
                                  })
                                }
                              >
                                <option value="">Pilih…</option>
                                {options.map((o) => (
                                  <option key={o} value={o}>
                                    {label(o) || o}
                                  </option>
                                ))}
                              </select>
                            ) : f.type === "textarea" ? (
                              <textarea
                                id={f.id}
                                required={f.required}
                                disabled={locked}
                                maxLength={4000}
                                rows={3}
                                value={values[f.id] || ""}
                                aria-invalid={Boolean(errors[f.id])}
                                aria-describedby={
                                  errors[f.id] ? f.id + "-error" : undefined
                                }
                                className={
                                  style +
                                  (errors[f.id]
                                    ? " border-destructive ring-1 ring-destructive/20"
                                    : "")
                                }
                                onChange={(e) =>
                                  setValues((v) => ({
                                    ...v,
                                    [f.id]: e.target.value,
                                  }))
                                }
                              />
                            ) : (
                              <input
                                id={f.id}
                                required={f.required}
                                disabled={locked}
                                type={f.type}
                                step={f.type === "number" ? "any" : undefined}
                                maxLength={4000}
                                value={values[f.id] || ""}
                                aria-invalid={Boolean(errors[f.id])}
                                aria-describedby={
                                  errors[f.id] ? f.id + "-error" : undefined
                                }
                                className={
                                  style +
                                  (errors[f.id]
                                    ? " border-destructive ring-1 ring-destructive/20"
                                    : "")
                                }
                                onChange={(e) =>
                                  setValues((v) => ({
                                    ...v,
                                    [f.id]: e.target.value,
                                  }))
                                }
                              />
                            )}
                            {f.binding === "Nama Alat" &&
                              options.length === 0 && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Belum ada alat yang tersedia di ruangan ini.
                                </p>
                              )}
                            {errors[f.id] && (
                              <p
                                id={f.id + "-error"}
                                role="alert"
                                className="mt-2 text-sm text-destructive"
                              >
                                {errorText(errors[f.id])}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {message && (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
                  >
                    {message}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
                  <p role="status" className="text-xs text-muted-foreground">
                    {!hydrated
                      ? "Menyiapkan form…"
                      : busy
                        ? Object.keys(files).length
                          ? "Mengunggah lampiran dan menyimpan…"
                          : "Menyimpan jawaban…"
                        : `${completed} dari ${required.length} pertanyaan wajib terisi`}
                  </p>
                  <Button
                    type="submit"
                    loading={busy}
                    disabled={!hydrated}
                    className="w-full sm:w-auto"
                  >
                    Kirim jawaban{!busy && <ArrowUpRight className="size-4" />}
                  </Button>
                </div>
              </form>
            </div>
          </>
        )}
        <footer className="mt-8 text-center text-[11px] text-muted-foreground">
          © {new Date().getUTCFullYear()} PT Inovasi Biokem Nusantara
        </footer>
      </div>
    </main>
  );
}
