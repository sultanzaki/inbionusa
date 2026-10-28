"use client";
import { useLocale } from "@/components/i18n/locale-provider";
import { useEffect, useState } from "react";
import {
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import type { ReferenceOption, ReferencePage } from "@/lib/forms/references";
export function ReferencePicker({
  token,
  field,
  value,
  onChange,
  disabled,
  invalid,
  required,
  selectedLabel,
}: {
  token: string;
  field: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  selectedLabel?: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [page, setPage] = useState<ReferencePage>({ items: [], has_more: false }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<ReferenceOption | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        fetch(
          `/api/forms/public/${token}/references?` +
            new URLSearchParams({ field, q: query, offset: String(offset) }),
          { cache: "no-store", signal: abort.signal },
        )
          .then(async (r) => {
            const v = await r.json();
            if (!r.ok) throw Error(v.message);
            if (!abort.signal.aborted) setPage(v);
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
  }, [token, field, query, offset, retry, open]);
  const displaySelected =
    selected?.id === value
      ? selected
      : value && selectedLabel
        ? { id: value, label: selectedLabel }
        : null;
  return (
    <div className="min-w-0 space-y-2" aria-busy={loading}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
        <input
          id={field}
          aria-invalid={invalid}
          aria-describedby={invalid ? field + "-error" : undefined}
          onFocus={() => {
            if (!open) {
              setLoading(true);
              setOpen(true);
            }
          }}
          type="search"
          maxLength={150}
          value={query}
          disabled={disabled}
          placeholder={t("Search by code or name…")}
          className="h-11 w-full min-w-0 rounded-lg border bg-background pl-9 pr-3 text-base focus:ring-2 focus:ring-primary/30"
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) {
              setSelected(null);
              onChange("");
            }
            setOffset(0);
            setLoading(true);
          }}
        />
      </div>
      {value && displaySelected && (
        <div className="flex min-w-0 items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <Check className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">
            {displaySelected.label}
          </span>
          <button
            type="button"
            aria-label={t("Clear selection")}
            disabled={disabled}
            onClick={() => {
              setSelected(null);
              onChange("");
            }}
            className="rounded p-1 hover:bg-primary/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {open && (
        <div className="overflow-hidden rounded-lg border bg-background">
          {loading ? (
            <p
              role="status"
              className="flex items-center gap-2 p-3 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("Loading options…")}
            </p>
          ) : error ? (
            <div className="p-3 text-sm">
              <p role="alert">{t(error)}</p>
              <button
                type="button"
                className="mt-2 text-primary underline"
                onClick={() => setRetry((v) => v + 1)}
              >
                {t("Retry")}
              </button>
            </div>
          ) : (
            <>
              <div
                className="max-h-56 overflow-y-auto overscroll-contain"
                role="group"
                aria-label={t("ERP record options")}
              >
                {page.items.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    {t("No matching records.")}
                  </p>
                )}
                {page.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex min-w-0 cursor-pointer items-start gap-3 border-b p-3 text-sm last:border-b-0 hover:bg-muted/50"
                  >
                    <input
                      className="mt-1 shrink-0 accent-primary"
                      type="radio"
                      name={field}
                      value={item.id}
                      checked={value === item.id}
                      required={required && !value}
                      disabled={disabled}
                      onChange={() => {
                        setSelected(item);
                        setOpen(false);
                        onChange(item.id);
                      }}
                    />
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between border-t px-2 py-1">
                <button
                  aria-label={t("Previous options")}
                  type="button"
                  disabled={disabled || offset === 0}
                  onClick={() => {
                    setOffset((v) => Math.max(0, v - 25));
                    setLoading(true);
                  }}
                  className="flex min-h-9 items-center gap-1 rounded px-2 text-xs disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                  {t("Previous")}
                </button>
                <span className="text-xs text-muted-foreground">
                  {t("Page")} {Math.floor(offset / 25) + 1}
                </span>
                <button
                  aria-label={t("Next options")}
                  type="button"
                  disabled={disabled || !page.has_more}
                  onClick={() => {
                    setOffset((v) => v + 25);
                    setLoading(true);
                  }}
                  className="flex min-h-9 items-center gap-1 rounded px-2 text-xs disabled:opacity-40"
                >
                  {t("Next")}
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
