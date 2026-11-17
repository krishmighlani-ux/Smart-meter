"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMeter } from "@/components/Shell";
import { useApi } from "@/components/useApi";
import { Async, Card, Empty } from "@/components/ui";
import { fmtDay, num } from "@/lib/format";

const RANGES = [["daily", "Daily (14 days)"], ["weekly", "Weekly (12 weeks)"], ["monthly", "Monthly (3 months)"]];
const label = (range, key) => (range === "monthly" ? new Date(key + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }) : fmtDay(key + "T06:00:00Z"));

export default function Analytics() {
  const { meterId } = useMeter();
  const [range, setRange] = useState("daily");
  const api = useApi(`/api/analytics?meterId=${meterId}&range=${range}`);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Energy analytics</h1>
      <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {RANGES.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${range === k ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>
        ))}
      </div>
      <Async api={api} empty={<Empty />}>
        {(d) => {
          if (!d.buckets.length) return <Empty title="No readings in this range" />;
          const rows = d.buckets.map((b) => ({ ...b, name: label(range, b.key) }));
          return (
            <>
              <Card title={`${range[0].toUpperCase() + range.slice(1)} consumption (kWh)`} subtitle={`Total shown: ${num(d.totalKwh, 1)} kWh. Lighter bars are incomplete periods (missing hours).`}>
                <div className="h-72 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows} margin={{ left: -10, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit=" kWh" width={64} />
                      <Tooltip formatter={(v) => `${num(v)} kWh`} />
                      <Bar dataKey="kwh" name="Energy" radius={[6, 6, 0, 0]}>
                        {rows.map((r) => <Cell key={r.key} fill={r.partial ? "#a5b4fc" : "#4f46e5"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card title="Breakdown">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Period</th><th className="pr-4">Energy (kWh)</th><th className="pr-4">Peak (kW)</th><th>Hours of data</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...rows].reverse().map((r) => (
                        <tr key={r.key}><td className="py-2 pr-4 font-medium">{r.name}{r.partial && <span className="ml-2 text-xs text-amber-700">partial</span>}</td><td className="pr-4">{num(r.kwh)}</td><td className="pr-4">{num(r.peakKw)}</td><td>{r.hours}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          );
        }}
      </Async>
    </div>
  );
}
