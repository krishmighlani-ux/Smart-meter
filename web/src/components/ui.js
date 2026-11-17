"use client";

export function Card({ title, subtitle, right, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold sm:text-3xl ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1">{message}</p>
      {onRetry && <button onClick={onRetry} className="btn-ghost mt-3">Try again</button>}
    </div>
  );
}

export function Empty({ title = "No data yet", children }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <p className="mt-1">{children}</p>}
    </div>
  );
}

const SEV = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-800", low: "bg-sky-100 text-sky-800" };
export function Severity({ level }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${SEV[level] ?? SEV.low}`}>{level}</span>;
}

/** Renders loading / error states, then children(data). */
export function Async({ api, children, empty }) {
  if (api.loading && !api.data) return <Spinner />;
  if (api.error) return <ErrorBox message={api.error} onRetry={api.reload} />;
  if (!api.data) return null;
  if (api.data.empty && empty) return empty;
  return children(api.data);
}
