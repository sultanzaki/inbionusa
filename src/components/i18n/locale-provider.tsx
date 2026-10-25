"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { messages } from "@/lib/i18n/id";
export type Locale = "en" | "id";
let locale: Locale = "en";
const listeners = new Set<() => void>();
const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};
const Context = createContext<Locale>("en");
const caseIndex = new Map(
  Object.entries(messages).map(([key, value]) => [key.toLowerCase(), value]),
);
export function getSelectedLocale(): Locale {
  return locale;
}
export function translate(text: string, lang: Locale): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const decode = (value: string) =>
    value.replace(
      /&(amp|nbsp|gt|lt|quot|apos|ldquo|rdquo);/g,
      (_, entity: string) =>
        ({
          amp: "&",
          nbsp: "\u00a0",
          gt: ">",
          lt: "<",
          quot: '"',
          apos: "'",
          ldquo: "“",
          rdquo: "”",
        })[entity] || _,
    );
  if (lang === "en") return decode(text);
  const translated =
    (Object.hasOwn(messages, normalized) ? messages[normalized] : undefined) ||
    caseIndex.get(normalized.toLowerCase());
  if (translated) return text.replace(text.trim(), translated);
  const validationPatterns: [RegExp, (value: string) => string][] = [
    [
      /^Enter at least (.+) characters\.$/,
      (value) => `Masukkan minimal ${value} karakter.`,
    ],
    [
      /^Use (.+) characters or fewer\.$/,
      (value) => `Gunakan maksimal ${value} karakter.`,
    ],
    [
      /^Use (.+) items or fewer\.$/,
      (value) => `Gunakan maksimal ${value} item.`,
    ],
    [
      /^Enter a value of at least (.+)\.$/,
      (value) => `Masukkan nilai minimal ${value}.`,
    ],
    [/^Enter (.+) or less\.$/, (value) => `Masukkan nilai maksimal ${value}.`],
  ];
  for (const [pattern, format] of validationPatterns) {
    const match = normalized.match(pattern);
    if (match) return format(match[1]);
  }
  const step = normalized.match(/^Step (\d+) of (\d+)$/);
  if (step) return `Langkah ${step[1]} dari ${step[2]}`;
  const count = normalized.match(
    /^([\d,.]+) (records|items|options|rows)(.*)$/,
  );
  if (count)
    return `${count[1]} ${{ records: "data", items: "barang", options: "pilihan", rows: "baris" }[count[2]]}${count[3]}`;
  const search = normalized.match(
    /^(Search |Choose |Select |About |Status: |Loading )(.+?)(…|\.)?$/,
  );
  if (search)
    return `${{ "Search ": "Cari ", "Choose ": "Pilih ", "Select ": "Pilih ", "About ": "Tentang ", "Status: ": "Status: ", "Loading ": "Memuat " }[search[1]]}${translate(search[2], lang)}${search[3] || ""}`;
  return decode(text);
}
export function LocaleProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(
    subscribe,
    () => locale,
    () => "en" as Locale,
  );
  useEffect(() => {
    const restore = () => {
      try {
        const next = localStorage.getItem("inb:locale") === "id" ? "id" : "en";
        if (locale !== next) {
          locale = next;
          listeners.forEach((fn) => fn());
        }
      } catch {}
    };
    restore();
    window.addEventListener("storage", restore);
    return () => window.removeEventListener("storage", restore);
  }, []);
  useEffect(() => {
    document.documentElement.lang = value;
  }, [value]);
  return <Context value={value}>{children}</Context>;
}
export function useLocale() {
  const value = useContext(Context);
  return {
    locale: value,
    t: (text: string) => translate(text, value),
    setLocale(next: Locale) {
      locale = next;
      try {
        localStorage.setItem("inb:locale", next);
      } catch {}
      listeners.forEach((fn) => fn());
    },
  };
}
export function Localized({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return (
    <>
      {typeof children === "string"
        ? t(children)
        : Array.isArray(children)
          ? children.map((child, i) => <Localized key={i}>{child}</Localized>)
          : children}
    </>
  );
}
export function LanguageControl() {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className="language-control">
      <span>{t("Language")}</span>
      <select
        aria-label={t("Language")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="id">Bahasa Indonesia</option>
      </select>
    </label>
  );
}
