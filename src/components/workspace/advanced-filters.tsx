"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { useId } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AdvancedFilters, ModuleName } from "@/lib/query-filters";
export type FilterProduct = {
  id: string;
  kode_produk: string;
  nama_produk: string;
};
export const filterTitles: Record<ModuleName, string> = {
  produk: "Filter products",
  inspeksi: "Filter inspections",
  coa: "Filter COAs",
  arsip: "Filter documents",
  audit: "Filter activity",
};
export function AdvancedFilterFields({
  value,
  onChange,
  module,
  products,
  productError,
}: {
  value: AdvancedFilters;
  onChange: (value: AdvancedFilters) => void;
  module: ModuleName;
  products: FilterProduct[];
  productError: boolean;
}) {
  const { t: localize } = useLocale();

  const id = useId();
  return (
    <div className="advanced-filter-fields">
      <fieldset className="filter-date-range">
        <legend>
          <CalendarDays className="size-3.5" />
          <Localized>{" Date range "}</Localized>
        </legend>
        <div>
          <label htmlFor={id + "from"}>
            <Localized>{" From "}</Localized>
            <Input
              id={id + "from"}
              aria-label={localize("From date")}
              type="date"
              value={value.from}
              max={value.to || undefined}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </label>
          <label htmlFor={id + "to"}>
            <Localized>{" To "}</Localized>
            <Input
              id={id + "to"}
              aria-label={localize("To date")}
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </label>
        </div>
      </fieldset>
      {["inspeksi", "coa"].includes(module) && (
        <label htmlFor={id + "product"}>
          <Localized>{" Product "}</Localized>
          <select
            id={id + "product"}
            aria-label={localize("Filter products")}
            value={value.product}
            onChange={(e) => onChange({ ...value, product: e.target.value })}
          >
            <option value="">
              <Localized>{"All products"}</Localized>
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.kode_produk} · {p.nama_produk}
              </option>
            ))}
          </select>
          {productError && (
            <span role="alert" className="text-danger">
              <Localized>
                {" Could not load products. Reopen the filters to retry. "}
              </Localized>
            </span>
          )}
        </label>
      )}
      {["inspeksi", "audit"].includes(module) && (
        <label htmlFor={id + "person"}>
          {module === "audit" ? (
            <Localized>{"Actor"}</Localized>
          ) : (
            <Localized>{"Inspector"}</Localized>
          )}
          <Input
            id={id + "person"}
            aria-label={
              module === "audit" ? "Filter actor" : "Filter inspector"
            }
            placeholder={module === "audit" ? "Actor name" : "Inspector name"}
            maxLength={100}
            value={value.person}
            onChange={(e) => onChange({ ...value, person: e.target.value })}
          />
        </label>
      )}
      {["produk", "arsip", "audit"].includes(module) && (
        <label htmlFor={id + "category"}>
          {module === "audit" ? (
            <Localized>{"Action"}</Localized>
          ) : (
            <Localized>{"Category"}</Localized>
          )}
          <Input
            id={id + "category"}
            aria-label={
              module === "audit" ? "Filter actions" : "Filter category"
            }
            placeholder={module === "audit" ? "Exact action" : "Exact category"}
            maxLength={100}
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}
