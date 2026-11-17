"use client";
import Link from "next/link";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMeter } from "@/components/Shell";
import { useApi } from "@/components/useApi";
import { Async, Card, Empty, ErrorBox, Severity, Spinner, Stat } from "@/components/ui";
import { fmtDateTime, fmtHour, inr, inr2, num } from "@/lib/format";

export default function Dashboard() {
  const { meterId } = useMeter();
  const summary = useApi(`/api/summary?meterId=${meterId}`);
  const alerts = useApi(`/api/alerts?meterId=${meterId}`);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
      <Async api={summary} empty={<Empty title="No readings for this meter yet">Seed the database or send readings to POST /api/readings.</Empty>}>
        {(s) => {
          const change = s.previous24hKwh ? ((s.last24hKwh - s.previous24hKwh) / s.previous24hKwh) * 100 : null;
          const trend = s.trend.map((t) => ({ hour: fmtHour(t.ts), "Last 24 h": t.powerKw, "Previous 24 h": t.previousPowerKw }));
          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Latest power" value={`${num(s.latest.powerKw)} kW`} hint={`Reading at ${fmtDateTime(s.latest.ts)}${s.latest.voltageV ? ` · ${num(s.latest.voltageV, 0)} V` : ""}`} />
                <Stat label="Energy today" value={`${num(s.todayKwh)} kWh`} hint={`Cost so far ≈ ${inr2(s.todayCostInr)}`} />
                <Stat label="Estimated monthly bill" value={inr(s.monthlyBill.total)} hint={`${num(s.monthlyBill.energyKwh, 0)} kWh × tariff + ${inr(s.monthlyBill.fixedCharge)} fixed (from last ${num(s.monthlyBill.basisDays, 0)} days)`} />
                <Stat label="Peak usage (7 days)" value={`${num(s.peak7d.powerKw)} kW`} hint={fmtDateTime(s.peak7d.ts)} />
              </div>
              <Card title="Recent trend" subtitle={change == null ? "Power (kW) per hour" : `Last 24 h used ${num(s.last24hKwh, 1)} kWh, ${change >= 0 ? "up" : "down"} ${num(Math.abs(change), 0)}% vs the 24 h before`}>
                <div className="h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ left: -10, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={3} />
                      <YAxis tick={{ fontSize: 11 }} unit=" kW" width={56} />
                      <Tooltip formatter={(v) => `${num(v)} kW`} />
                      <Legend />
                      <Line type="monotone" dataKey="Last 24 h" stroke="#4f46e5" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Previous 24 h" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          );
        }}
      </Async>
      <Card title="Recent alerts" right={<Link href="/alerts" className="text-sm font-medium text-brand-600">View all</Link>}>
        {alerts.loading && !alerts.data ? <Spinner label="Checking for unusual readings…" />
          : alerts.error ? <ErrorBox message={alerts.error} onRetry={alerts.reload} />
          : !alerts.data?.alerts?.length ? <Empty title="No unusual readings found" />
          : <ul className="divide-y divide-slate-100">{alerts.data.alerts.slice(0, 3).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <Severity level={a.severity} /><span className="font-medium">{fmtDateTime(a.ts)}</span>
                <span className="text-slate-500">{num(a.powerKw)} kW vs usual {num(a.expectedKw)} kW</span>
              </li>))}</ul>}
      </Card>
    </div>
  );
}
