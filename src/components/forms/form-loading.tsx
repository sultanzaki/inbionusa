export function FormLoading() {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground">
      <div
        className="mx-auto max-w-4xl space-y-6"
        role="status"
        aria-label="Memuat form"
      >
        <p className="text-sm font-semibold text-primary">INBIONUSA</p>
        <span className="sr-only">Memuat form…</span>
        <div
          aria-hidden="true"
          className="animate-pulse space-y-6 motion-reduce:animate-none"
        >
          <div className="h-28 rounded-xl border bg-card p-5">
            <div className="h-5 w-2/3 rounded bg-muted/20" />
            <div className="mt-4 h-3 w-1/2 rounded bg-muted/20" />
          </div>
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-xl border bg-card p-5">
              <div className="mb-4 h-3 w-1/3 rounded bg-muted/20" />
              <div className="h-11 rounded-lg bg-muted/10" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
