"use client";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { PublicForm } from "@/lib/forms/public";
import { ReferencePicker } from "./reference-picker";
import { resolvedTemplate } from "@/lib/forms/public";
export function PublicFormPage({ token }: { token: string }) {
  const [form, setForm] = useState<PublicForm | null>(null),
    [values, setValues] = useState<Record<string, string>>({}),
    [files, setFiles] = useState<Record<string, File>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [cleaningResult, setCleaningResult] = useState("");
  const key = useRef("");
  useEffect(() => {
    key.current = crypto.randomUUID();
    const abort = new AbortController();
    fetch("/api/forms/public/" + token, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw Error(v.message);
        setForm(v);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setMessage(e.message);
      });
    return () => abort.abort();
  }, [token]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
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
      setBusy(false);
    }
  }
  const template = form ? resolvedTemplate(form) : null;
  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-sm font-semibold tracking-widest text-primary">
          INBIONUSA · FORMS
        </div>
        {done ? (
          <section className="rounded-2xl border bg-card p-8">
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
          <p role="status">{message || "Memuat form…"}</p>
        ) : (
          <>
            <header className="mb-6">
              <h1 className="text-3xl font-semibold tracking-tight">
                {template.title}
              </h1>
              <p className="mt-3 whitespace-pre-wrap text-muted-foreground">
                {template.description}
              </p>
            </header>
            <form onSubmit={submit} className="space-y-4">
              {template.fields.map((f) => {
                let options = f.options;
                const isBatch = f.binding?.startsWith("Batch Number Produksi");
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
                      form?.equipment.find((e) => e.id === id)?.area ===
                        values[areaField.id],
                  );
                }
                const label = (id: string) =>
                  f.binding === "Nama Alat"
                    ? (() => {
                        const e = form?.equipment.find((e) => e.id === id);
                        return e ? e.code + " · " + e.name : "";
                      })()
                    : dynamic
                      ? (() => {
                          const u = form?.staff.find((u) => u.id === id);
                          return u ? u.name + " · " + (u.username || "") : "";
                        })()
                      : id;
                const style =
                  "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-base outline-none focus:ring-2 focus:ring-primary/30";
                return (
                  <div
                    key={f.id}
                    className="min-w-0 rounded-xl border bg-card p-5"
                  >
                    <label
                      htmlFor={f.id}
                      className="mb-3 block break-words text-sm font-medium"
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
                        disabled={busy}
                        required={f.required}
                        invalid={Boolean(errors[f.id])}
                        onChange={(id) =>
                          setValues((v) => ({ ...v, [f.id]: id }))
                        }
                      />
                    ) : f.type === "file" ? (
                      <>
                        <input
                          id={f.id}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          required={f.required}
                          disabled={busy}
                          className={style}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            setFiles((v) => {
                              const n = { ...v };
                              if (file) n[f.id] = file;
                              else delete n[f.id];
                              return n;
                            });
                          }}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          PDF, JPG, PNG · maksimal 2 MB/file, 3 MB total.
                        </p>
                      </>
                    ) : f.type === "select" || isBatch ? (
                      <select
                        id={f.id}
                        required={f.required}
                        disabled={busy}
                        aria-invalid={Boolean(errors[f.id])}
                        aria-describedby={
                          errors[f.id] ? f.id + "-error" : undefined
                        }
                        value={values[f.id] || ""}
                        className={style}
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
                        disabled={busy}
                        maxLength={4000}
                        rows={3}
                        value={values[f.id] || ""}
                        className={style}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.id]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        id={f.id}
                        required={f.required}
                        disabled={busy}
                        type={f.type}
                        step={f.type === "number" ? "any" : undefined}
                        maxLength={4000}
                        value={values[f.id] || ""}
                        className={style}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.id]: e.target.value }))
                        }
                      />
                    )}
                    {errors[f.id] && (
                      <p
                        id={f.id + "-error"}
                        role="alert"
                        className="mt-2 text-sm text-destructive"
                      >
                        {errors[f.id]}
                      </p>
                    )}
                  </div>
                );
              })}
              {message && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
                >
                  {message}
                </p>
              )}
              <div className="sticky bottom-0 border-t bg-background/95 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button type="submit" loading={busy} className="w-full">
                  Kirim jawaban
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
