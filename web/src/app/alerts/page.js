"use client";
import { useState } from "react";
import { useMeter } from "@/components/Shell";
import { useApi } from "@/components/useApi";
import { Async, Card, Empty, Severity } from "@/components/ui";
import { fmtDateTime, num } from "@/lib/format";

export default function Alerts() {
  const { meterId } = useMeter();
  const api = useApi(`/api/alerts?meterId=${meterId}`);
  const [filter, setFilter] = useState("all");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Anomaly alerts</h1>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <b>An anomaly is a warning, not proof.</b> It means a reading differs from this meter’s usual pattern. It does not prove a fault or electricity theft; check appliances and wiring before drawing conclusions.
      </div>
      <Async api={api} empty={<Empty />}>
        {(d) => {
          const list = d.alerts.filter((a) => filter === "all" || a.severity === filter);
          return (
            <>
              <Card title={`${d.alerts.length} unusual reading${d.alerts.length === 1 ? "" : "s"} in the last 60 days`} subtitle="Detected with Isolation Forest, then filtered to readings at least 50% away from the usual value for that hour."
                right={
                  <div className="flex gap-1" role="group" aria-label="Filter by severity">
                    {["all", "high", "medium", "low"].map((f) => (
                      <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${filter === f ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-100"}`}>{f}</button>
                    ))}
                  </div>}>
                {d.note && <p className="mb-2 text-sm text-slate-500">{d.note}</p>}
                {!list.length ? <Empty title={d.alerts.length ? "No alerts at this severity" : "No unusual readings found"} /> : (
                  <ul className="space-y-3">
                    {list.map((a) => (
                      <li key={a.id} className={`rounded-xl border-l-4 bg-slate-50 p-3 ${a.severity === "high" ? "border-red-500" : a.severity === "medium" ? "border-amber-500" : "border-sky-500"}`}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <Severity level={a.severity} /><b>{fmtDateTime(a.ts)} IST</b>
                          <span className="text-slate-600">{num(a.powerKw)} kW (usual {num(a.expectedKw)} kW, {num(a.ratio, 1)}×)</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{a.explanation}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {d.selfCheck && (
                <Card title="Detector self-check (synthetic data only)">
                  <p className="text-sm text-slate-600">On {d.selfCheck.dataset} the detector found {d.selfCheck.true_positives} of {d.selfCheck.injected} injected spikes (recall {num(d.selfCheck.recall * 100, 0)}%, precision {d.selfCheck.precision == null ? "–" : num(d.selfCheck.precision * 100, 0) + "%"}). {d.selfCheck.note} Injected spikes are easy to find, so treat this as a sanity check rather than a measure of real accuracy.</p>
                </Card>
              )}
            </>
          );
        }}
      </Async>
    </div>
  );
}
