"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cleaningTemplate } from "@/lib/forms/cleaning-template";
import type { Template, FormField } from "@/lib/forms/schema";
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
  }[];
};
export function FormsAdmin() {
  const [list, setList] = useState<RecordForm[]>([]),
    [ready, setReady] = useState(false),
    [selected, setSelected] = useState<RecordForm | null>(null),
    [draft, setDraft] = useState<Template | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
    setBusy(true);
    setError("");
    setNotice("");
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
      await load();
      await load(v.id);
      setNotice(
        action === "publish" ? "Form diterbitkan." : "Perubahan tersimpan.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  function field(index: number, change: Partial<FormField>) {
    if (draft)
      setDraft({
        ...draft,
        fields: draft.fields.map((f, i) =>
          i === index ? { ...f, ...change } : f,
        ),
      });
  }
  const control =
    "w-full rounded-md border border-input bg-background p-2 text-sm";
  const dirty = Boolean(
    selected &&
    draft &&
    JSON.stringify(draft) !== JSON.stringify(selected.draft),
  );
  if (!ready) return <p role="status">Memuat Forms…</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Forms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Template, tautan pengisian, dan jawaban.
          </p>
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
            Form baru
          </Button>
          <Button
            variant="outline"
            disabled={busy || dirty}
            onClick={() => act("create", cleaningTemplate)}
          >
            Template pencucian
          </Button>
        </div>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Forms" className="space-y-2">
          {list.map((f) => (
            <button
              key={f.id}
              disabled={busy || dirty}
              onClick={() => {
                setBusy(true);
                load(f.id)
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
              className="block w-full rounded-lg border p-3 text-left text-sm"
            >
              <strong className="block break-words">{f.draft.title}</strong>
              <span className="text-xs text-muted-foreground">
                {f.active ? "Published" : "Draft / paused"} · v
                {f.published_revision}
              </span>
            </button>
          ))}
        </nav>
        {draft && selected ? (
          <section className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6">
            <div className="grid gap-3">
              <label className="text-sm font-medium">
                Judul
                <Input
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
                  value={draft.description}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
            </div>
            {dirty && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>Perubahan belum tersimpan.</span>
                <Button
                  variant="outline"
                  onClick={() => setDraft(selected.draft)}
                >
                  Batalkan perubahan
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={() => act("save", draft)}>
                Simpan draft
              </Button>
              <Button
                variant="outline"
                disabled={
                  busy ||
                  JSON.stringify(draft) !== JSON.stringify(selected.draft)
                }
                onClick={() => act("publish")}
              >
                Terbitkan
              </Button>
              <Button
                variant="outline"
                disabled={busy || !selected.active}
                onClick={() => act("pause")}
              >
                Jeda
              </Button>
              {selected.active && (
                <>
                  <a
                    className="rounded-md border px-3 py-2 text-sm"
                    href={"/forms/" + selected.public_token}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka form
                  </a>
                  <a
                    className="rounded-md border px-3 py-2 text-sm"
                    href={"/api/forms/" + selected.id + "/qr"}
                  >
                    Unduh QR
                  </a>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          location.origin + "/forms/" + selected.public_token,
                        );
                        setNotice("Tautan disalin.");
                      } catch {
                        setError(
                          "Tidak dapat menyalin. Salin alamat melalui Buka form.",
                        );
                      }
                    }}
                  >
                    Salin link
                  </Button>
                </>
              )}
            </div>
            {draft.fields.map((f, i) => (
              <fieldset
                key={f.id}
                className="min-w-0 space-y-3 rounded-lg border p-4"
              >
                <legend className="px-2 text-xs text-muted-foreground">
                  Pertanyaan {i + 1}
                  {f.binding ? " · ERP" : ""}
                </legend>
                <label className="block text-sm">
                  Label
                  <Input
                    value={f.label}
                    disabled={busy}
                    onChange={(e) => field(i, { label: e.target.value })}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm">
                    Tipe
                    <select
                      aria-label={"Tipe pertanyaan " + (i + 1)}
                      className={control}
                      value={f.type}
                      disabled={busy || Boolean(f.binding)}
                      onChange={(e) =>
                        field(i, { type: e.target.value as FormField["type"] })
                      }
                    >
                      {[
                        "text",
                        "textarea",
                        "number",
                        "date",
                        "time",
                        "select",
                        "file",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {
                            {
                              text: "Teks singkat",
                              textarea: "Paragraf",
                              number: "Angka",
                              date: "Tanggal",
                              time: "Waktu",
                              select: "Pilihan tunggal",
                              file: "Upload file",
                            }[t as FormField["type"]]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={f.required}
                      disabled={busy || Boolean(f.binding)}
                      onChange={(e) => field(i, { required: e.target.checked })}
                    />{" "}
                    Wajib diisi
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || i === 0}
                    onClick={() => {
                      const fields = [...draft.fields];
                      [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
                      setDraft({ ...draft, fields });
                    }}
                  >
                    Naik
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || i === draft.fields.length - 1}
                    onClick={() => {
                      const fields = [...draft.fields];
                      [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]];
                      setDraft({ ...draft, fields });
                    }}
                  >
                    Turun
                  </Button>
                  {!f.binding && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          fields: draft.fields.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Hapus
                    </Button>
                  )}
                </div>
                {f.type === "select" &&
                  ![
                    "Area Kerja",
                    "Nama Alat",
                    "Nama Petugas",
                    "Nama Pemeriksa/Penanggung Jawab Verifikasi",
                  ].includes(f.binding || "") && (
                    <label className="block text-sm">
                      Pilihan, satu per baris
                      <textarea
                        className={control}
                        rows={3}
                        disabled={busy}
                        value={f.options.join("\n")}
                        onChange={(e) =>
                          field(i, { options: e.target.value.split("\n") })
                        }
                      />
                    </label>
                  )}
              </fieldset>
            ))}
            <Button
              variant="outline"
              disabled={busy || draft.fields.length >= 50}
              onClick={() =>
                setDraft({
                  ...draft,
                  fields: [
                    ...draft.fields,
                    {
                      id: "f" + crypto.randomUUID().replaceAll("-", ""),
                      label: "Pertanyaan baru",
                      type: "text",
                      required: false,
                      options: [],
                    },
                  ],
                })
              }
            >
              Tambah pertanyaan / upload
            </Button>
            <section className="space-y-3 border-t pt-5">
              <h2 className="font-semibold">Jawaban terbaru</h2>
              {selected.submissions?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Belum ada jawaban.
                </p>
              )}
              {selected.submissions?.map((s) => (
                <details key={s.id} className="min-w-0 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm">
                    {new Date(s.created_at).toLocaleString("id-ID", {
                      timeZone: "Asia/Jakarta",
                    })}{" "}
                    · v{s.revision}
                  </summary>
                  <dl className="mt-3 grid min-w-0 gap-3">
                    {s.template.fields
                      .filter((f) => f.type !== "file")
                      .map((f) => (
                        <div key={f.id}>
                          <dt className="break-words text-xs text-muted-foreground">
                            {f.label}
                          </dt>
                          <dd className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                            {s.answers[f.id] || "—"}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {s.files.map((file, i) => (
                    <a
                      key={i}
                      className="mt-3 block break-all text-sm text-primary underline"
                      href={"/api/forms/" + s.id + "/files/" + i}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.name}
                    </a>
                  ))}
                </details>
              ))}
            </section>
          </section>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            Pilih form atau buat template baru.
          </p>
        )}
      </div>
    </div>
  );
}
