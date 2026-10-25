"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useERP } from "./context";
import { WorkInbox } from "./release-workflows";
import dynamic from "next/dynamic";
const PerformanceChart = dynamic(() => import("./performance-chart"), {
  loading: () => (
    <div
      className="h-[220px] skeleton-shimmer"
      aria-label="Loading chart"
      role="status"
    />
  ),
});
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
type Snapshot = {
  areas: string[];
  metrics: { label: string; value: number }[];
  series: { date: string; count: number }[];
  activity: { action: string; created_at: string }[];
  chart_label: string;
  days: number;
};
export function OperationsDashboard() {
  const { t: localize } = useLocale();

  const erp = useERP(),
    [area, setArea] = useState("overview"),
    [days, setDays] = useState("30"),
    [value, setValue] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const a = localStorage.getItem("inb-performance-area"),
        d = localStorage.getItem("inb-performance-days");
      if (
        a &&
        [
          "overview",
          ...(erp.data?.modules
            .filter((m) => m.state !== "disabled" && m.read)
            .map((m) => m.key) || []),
        ].includes(a)
      )
        setArea(a);
      if (d && ["7", "30", "90"].includes(d)) setDays(d);
    }, 0);
    return () => clearTimeout(t);
  }, [erp.data]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(
      "/api/erp/overview?" + new URLSearchParams({ state: area, q: days }),
      { signal: abort.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.message || "Could not load performance.");
        if (!abort.signal.aborted) {
          setValue(d);
          setError("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [area, days, retry]);
  const areas = [
    "overview",
    ...(erp.data?.modules.filter((m) => erp.can(m.key)).map((m) => m.key) ||
      []),
  ];
  function select(a: string) {
    if (a === area) return;
    setValue(null);
    setArea(a);
    localStorage.setItem("inb-performance-area", a);
  }
  return (
    <div className="page-stack release-dashboard">
      <header className="release-home-header">
        <div>
          <p className="micro-label">
            <Localized>{"INBIONUSA OPERATIONS"}</Localized>
          </p>
          <h1>
            <Localized>{"Your workspace"}</Localized>
          </h1>
        </div>
        <Link href="/dashboard/workspaces">
          <Localized>{" Explore workspace "}</Localized>
          <ArrowUpRight className="inline size-4" />
        </Link>
      </header>
      <WorkInbox compact />
      <section className="performance-panel">
        <div className="release-section-heading">
          <div>
            <p className="micro-label">
              <Localized>{"PERFORMANCE"}</Localized>
            </p>
            <h2>
              <Localized>{"Performance"}</Localized>
            </h2>
          </div>
          <select
            aria-label={localize("Performance period")}
            value={days}
            onChange={(e) => {
              if (e.target.value === days) return;
              setValue(null);
              setDays(e.target.value);
              localStorage.setItem("inb-performance-days", e.target.value);
            }}
          >
            <option value="7">
              <Localized>{"Last 7 days"}</Localized>
            </option>
            <option value="30">
              <Localized>{"Last 30 days"}</Localized>
            </option>
            <option value="90">
              <Localized>{"Last 90 days"}</Localized>
            </option>
          </select>
        </div>
        <nav
          className="performance-areas"
          aria-label={localize("Performance context")}
        >
          {areas.map((a) => (
            <button
              key={a}
              aria-current={area === a ? "page" : undefined}
              onClick={() => select(a)}
            >
              {a}
            </button>
          ))}
        </nav>
        <select
          className="performance-mobile-select"
          aria-label={localize("Performance context")}
          value={area}
          onChange={(e) => select(e.target.value)}
        >
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {error ? (
          <div role="alert">
            <p>
              <Localized>{error}</Localized>
            </p>
            <Button variant="outline" onClick={() => setRetry((r) => r + 1)}>
              <Localized>{" Retry "}</Localized>
            </Button>
          </div>
        ) : !value ? (
          <p role="status" className="performance-loading">
            <Localized>{" Loading performance… "}</Localized>
          </p>
        ) : (
          <>
            <div className="performance-layout">
              <div className="performance-chart">
                <h3>{value.chart_label}</h3>
                <div
                  role="img"
                  aria-label={
                    value.chart_label + " over the last " + value.days + " days"
                  }
                >
                  <PerformanceChart series={value.series} />
                </div>
                <details className="chart-data">
                  <summary>
                    <Localized>{"View chart data"}</Localized>
                  </summary>
                  <div>
                    {value.series.map((d) => (
                      <p key={d.date}>
                        <time>{d.date}</time>
                        <span>{d.count}</span>
                      </p>
                    ))}
                  </div>
                </details>
              </div>
              <div className="performance-metrics">
                {value.metrics.map((m) => (
                  <article key={m.label}>
                    <span>
                      <Localized>{m.label}</Localized>
                    </span>
                    <strong>{m.value.toLocaleString("en-GB")}</strong>
                  </article>
                ))}
              </div>
            </div>
            <p className="performance-note">
              <Localized>
                {
                  " Daily record counts. Open, draft and held totals show current status. "
                }
              </Localized>
            </p>
            {area !== "overview" && (
              <Link
                className="performance-detail-link"
                href={
                  area === "quality"
                    ? "/dashboard/quality"
                    : "/dashboard/" + area
                }
              >
                <Localized>{" Open "}</Localized>
                {area} <Localized>{" workspace "}</Localized>
                <ArrowUpRight className="inline size-4" />
              </Link>
            )}
          </>
        )}
      </section>
      <section className="recent-activity">
        <div className="release-section-heading">
          <div>
            <p className="micro-label">
              <Localized>{"RECENT ACTIVITY"}</Localized>
            </p>
            <h2>
              <Localized>{"Your latest actions"}</Localized>
            </h2>
          </div>
        </div>
        {value?.activity.length ? (
          value.activity.map((a, i) => (
            <article key={a.created_at + i}>
              <span>{a.action}</span>
              <time>
                {new Date(a.created_at).toLocaleString("en-GB", {
                  timeZone: "Asia/Jakarta",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </article>
          ))
        ) : (
          <p>
            <Localized>{"No activity yet."}</Localized>
          </p>
        )}
      </section>
    </div>
  );
}
