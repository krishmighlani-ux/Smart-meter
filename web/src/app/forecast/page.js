"use client";
import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMeter } from "@/components/Shell";
import { useApi } from "@/components/useApi";
import { Async, Card, Empty, Stat } from "@/components/ui";
import { fmtDateTime, fmtHour, inr, num } from "@/lib/format";

export default function Forecast() {
  const { meterId } = useMeter();
  const [horizon, setHorizon] = useState(24);
  const api = useApi(`/api/forecast?meterId=${meterId}&horizon=${horizon}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Consumption forecast</h1>
        <label className="flex items-center gap-2 text-sm text-slate-600">Horizon
          <select className="input !w-auto" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            {[6, 12, 24].map((h) => <option key={h} value={h}>{h} hours</option>)}
          </select>
        </label>
      </div>
      <Async api={api} empty={<Empty title="No readings to forecast from" />}>
        {(d) => {
          const rows = [
            ...d.recent.map((r) => ({ t: fmtHour(r.ts), Actual: r.powerKw })),
            ...d.predictions.map((p) => ({ t: fmtHour(p.ts), Forecast: p.powerKw })),
          ];
          const m = d.evaluation.metrics, b = d.evaluation.baseline.metrics;
          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat label={`Predicted energy (${d.horizonHours} h)`} value={`${num(d.predictedEnergyKwh)} kWh`} />
                <Stat label="Predicted cost" value={inr(d.predictedCostInr)} hint="Energy charges at your tariff" />
                <Stat label="Model" value="Gradient Boosting" hint={`Trained on ${d.evaluation.trainRows} hourly rows`} />
              </div>
              <Card title="Actual (last 48 h) and forecast" subtitle={`Forecast starts after ${fmtDateTime(d.recent[d.recent.length - 1].ts)}`}>
                <div className="h-72 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows} margin={{ left: -10, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="t" tick={{ fontSize: 11 }} interval={5} />
                      <YAxis tick={{ fontSize: 11 }} unit=" kW" width={56} />
                      <Tooltip formatter={(v) => `${num(v)} kW`} />
                      <Legend />
                      <Line dataKey="Actual" stroke="#94a3b8" strokeWidth={2} dot={false} connectNulls={false} />
                      <Line dataKey="Forecast" stroke="#4f46e5" strokeWidth={2.5} strokeDasharray="6 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card title="Model evaluation" subtitle={`Chronological hold-out: last ${d.evaluation.testRows / 24} days (${fmtDateTime(d.evaluation.testPeriod.from)} → ${fmtDateTime(d.evaluation.testPeriod.to)}), model trained only on earlier data.`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Model</th><th className="pr-4">MAE (kW)</th><th className="pr-4">RMSE (kW)</th><th className="pr-4">MAPE</th><th>R²</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr><td className="py-2 pr-4 font-medium">{d.evaluation.model}</td><td className="pr-4">{num(m.mae, 3)}</td><td className="pr-4">{num(m.rmse, 3)}</td><td className="pr-4">{num(m.mapePct, 1)}%</td><td>{num(m.r2, 3)}</td></tr>
                      <tr><td className="py-2 pr-4 text-slate-600">Baseline: {d.evaluation.baseline.name}</td><td className="pr-4">{num(b.mae, 3)}</td><td className="pr-4">{num(b.rmse, 3)}</td><td className="pr-4">{num(b.mapePct, 1)}%</td><td>{num(b.r2, 3)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-500">Lower MAE/RMSE/MAPE is better; R² closer to 1 is better. These numbers are measured on {d.dataSource === "simulated" ? "SIMULATED data, so they say little about real-world accuracy" : "this meter’s historical data"}.</p>
              </Card>
            </>
          );
        }}
      </Async>
    </div>
  );
}
