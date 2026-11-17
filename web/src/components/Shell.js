"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { useApi } from "./useApi";

const MeterCtx = createContext({ meterId: null, setMeterId() {}, meters: [], meter: null });
export const useMeter = () => useContext(MeterCtx);

export const NAV = [
  ["/", "Dashboard"], ["/analytics", "Analytics"], ["/forecast", "Forecast"],
  ["/alerts", "Alerts"], ["/savings", "Savings"], ["/meters", "Meters"],
];

export default function Shell({ children }) {
  const path = usePathname();
  const metersApi = useApi("/api/meters");
  const [meterId, setMeterId] = useState(null);
  const meters = metersApi.data?.meters ?? [];
  useEffect(() => {
    if (!meters.length) return;
    let saved = null;
    try { saved = localStorage.getItem("meterId"); } catch {}
    setMeterId((cur) => cur ?? (meters.some((m) => m.meterId === saved) ? saved : meters[0].meterId));
  }, [meters.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (id) => { setMeterId(id); try { localStorage.setItem("meterId", id); } catch {} };
  const meter = meters.find((m) => m.meterId === meterId) ?? null;
  const simulated = !meter || meter.source === "simulated";

  const link = (href, label, mobile) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined}
        className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${mobile ? "" : "block"} ${active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
        {label}
      </Link>
    );
  };

  return (
    <MeterCtx.Provider value={{ meterId, setMeterId: choose, meters, meter, metersApi }}>
      <div className="min-h-screen lg:flex">
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
          <p className="text-lg font-bold leading-tight">⚡ Smart Meter<br /><span className="text-brand-600">of the Future</span></p>
          <nav className="mt-6 space-y-1">{NAV.map(([h, l]) => link(h, l))}</nav>
          <p className="mt-8 text-xs text-slate-400">Krish Mighlani<br />Shauryajeet Mahapatra<br />Ayush Rana</p>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="whitespace-nowrap font-bold lg:hidden">⚡ Smart Meter</p>
              <label className="ml-auto flex items-center gap-2 text-sm">
                <span className="hidden text-slate-500 sm:inline">Meter</span>
                <select aria-label="Select meter" className="input !w-auto max-w-[190px] sm:max-w-none" value={meterId ?? ""} onChange={(e) => choose(e.target.value)} disabled={!meters.length}>
                  {meters.map((m) => <option key={m.meterId} value={m.meterId}>{m.name} ({m.meterId})</option>)}
                </select>
              </label>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">{NAV.map(([h, l]) => link(h, l, true))}</nav>
          </header>
          <main className="mx-auto max-w-6xl p-4 sm:p-6">
            {simulated ? (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                <b>Simulated data.</b> These readings are generated for demonstration; they are not live sensor values.
              </div>
            ) : (
              <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">Readings from a connected device.</div>
            )}
            {metersApi.loading && !metersApi.data ? <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
              : metersApi.error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load meters: {metersApi.error}</div>
              : !meters.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No meters found. Run <code>npm run seed</code> (MongoDB) or unset MONGODB_URI to use demo data.</div>
              : meterId ? children : null}
          </main>
        </div>
      </div>
    </MeterCtx.Provider>
  );
}
