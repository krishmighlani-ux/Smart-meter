"use client";
import { useEffect, useState } from "react";
import { useMeter } from "@/components/Shell";
import { useApi } from "@/components/useApi";
import { Async, Card, Empty } from "@/components/ui";
import { fmtDateTime, inr2, num } from "@/lib/format";

export default function Meters() {
  const { meterId, setMeterId, meters, meter } = useMeter();
  const detail = useApi(`/api/meters/${meterId}`);
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setDate(""); setPage(1); }, [meterId]);
  const history = useApi(`/api/readings?meterId=${meterId}&page=${page}&pageSize=12${date ? `&date=${date}` : ""}`);
  const pages = history.data ? Math.max(1, Math.ceil(history.data.total / history.data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Meter management</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {meters.map((m) => (
          <button key={m.meterId} onClick={() => setMeterId(m.meterId)}
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${m.meterId === meterId ? "border-brand-500 ring-2 ring-brand-500/30 bg-white" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <div className="flex items-center justify-between"><p className="font-semibold">{m.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.source === "simulated" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{m.source === "simulated" ? "Simulated" : "Device"}</span></div>
            <p className="text-sm text-slate-500">{m.meterId}</p>
            <p className="mt-2 text-sm">{m.latestPowerKw == null ? "No readings" : `${num(m.latestPowerKw)} kW at ${fmtDateTime(m.latestReadingAt)}`}</p>
            {m.meterId === meterId && <p className="mt-1 text-xs font-medium text-brand-600">Selected</p>}
          </button>
        ))}
      </div>
      <Async api={detail} empty={<Empty />}>
        {(d) => (
          <Card title={`Details: ${d.meter.name}`}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[["Meter ID", d.meter.meterId], ["Type", d.meter.type], ["Location", d.meter.location], ["Phase", d.meter.phase], ["Sampling interval", `${d.meter.sampleIntervalMin} min`], ["Data source", d.meter.source], ["Status", d.meter.status], ["Stored readings", d.totalReadings.toLocaleString("en-IN")],
                ["Tariff", `₹${d.tariff.offPeakRate} off-peak / ₹${d.tariff.peakRate} peak (${d.tariff.peakStartHour}:00–${d.tariff.peakEndHour}:00)`]].map(([k, v]) => (
                <div key={k}><dt className="text-xs uppercase text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>))}
            </dl>
          </Card>
        )}
      </Async>
      <Card title="Historical readings" subtitle="Hourly readings for one day (India time)."
        right={<input type="date" aria-label="Choose day" className="input !w-auto" value={date || history.data?.date || ""} onChange={(e) => { setDate(e.target.value); setPage(1); }} />}>
        <Async api={history} empty={<Empty />}>
          {(h) => !h.readings.length ? <Empty title="No readings on this day" /> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Time (IST)</th><th className="pr-4">Power (kW)</th><th className="pr-4">Energy (kWh)</th><th className="pr-4">Voltage (V)</th><th className="pr-4">Rate (₹/kWh)</th><th>Cost</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {h.readings.map((r) => (
                      <tr key={r.ts}><td className="py-2 pr-4">{fmtDateTime(r.ts)}</td><td className="pr-4">{num(r.powerKw)}</td><td className="pr-4">{num(r.energyKwh)}</td><td className="pr-4">{r.voltageV == null ? "–" : num(r.voltageV, 1)}</td><td className="pr-4">{r.rateInrPerKwh}</td><td>{inr2(r.costInr)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                <span>{h.total} readings · page {h.page} of {pages}</span>
                <span className="flex gap-2"><button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></span>
              </div>
            </>
          )}
        </Async>
      </Card>
    </div>
  );
}
