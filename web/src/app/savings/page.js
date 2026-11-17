"use client";
import { useEffect, useState } from "react";
import { useMeter } from "@/components/Shell";
import { useApi } from "@/components/useApi";
import { Async, Card, Empty, ErrorBox, Spinner } from "@/components/ui";
import { inr } from "@/lib/format";

const FIELDS = [
  ["offPeakRate", "Off-peak rate (₹/kWh)", "0.1"],
  ["peakRate", "Peak rate (₹/kWh)", "0.1"],
  ["peakStartHour", "Peak starts (hour, 0–23)", "1"],
  ["peakEndHour", "Peak ends (hour, 0–23)", "1"],
  ["fixedMonthlyCharge", "Fixed monthly charge (₹)", "1"],
];
const PRIORITY = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-800", low: "bg-slate-200 text-slate-700" };

export default function Savings() {
  const { meterId } = useMeter();
  const tariff = useApi(`/api/tariff?meterId=${meterId}`);
  const recs = useApi(`/api/recommendations?meterId=${meterId}`);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (tariff.data) { setForm(Object.fromEntries(Object.entries(tariff.data.tariff).map(([k, v]) => [k, String(v)]))); setMsg(null); } }, [tariff.data]);

  async function save(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const body = { meterId, tariff: Object.fromEntries(FIELDS.map(([k]) => [k, form[k] === "" ? NaN : Number(form[k])])) };
      const res = await fetch("/api/tariff", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save tariff");
      setMsg({ ok: true, text: "Tariff saved. Recommendations, bills and forecast costs now use it." });
      recs.reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Energy-saving recommendations</h1>
      <Card title="Electricity tariff" subtitle="A simple two-rate (peak / off-peak) tariff you can configure. Actual utility slabs and taxes are not modelled.">
        {tariff.loading && !form ? <Spinner /> : tariff.error ? <ErrorBox message={tariff.error} onRetry={tariff.reload} /> : form && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {FIELDS.map(([k, l, step]) => (
                <label key={k} className="text-sm"><span className="mb-1 block text-slate-600">{l}</span>
                  <input className="input" type="number" inputMode="decimal" step={step} min="0" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn" disabled={saving}>{saving ? "Saving…" : "Save tariff"}</button>
              {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
            </div>
          </form>
        )}
      </Card>
      <Async api={recs} empty={<Empty />}>
        {(d) => (
          <Card title="Suggestions based on your usage" subtitle="Calculated from the last 28 days of readings.">
            {d.note && <p className="mb-2 text-sm text-slate-500">{d.note}</p>}
            {!d.recommendations.length ? <Empty title="No recommendations right now" /> : (
              <ul className="space-y-3">
                {d.recommendations.map((r) => (
                  <li key={r.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${PRIORITY[r.priority]}`}>{r.priority}</span>
                      <h3 className="font-semibold">{r.title}</h3>
                      {r.estimatedMonthlySavingInr > 0 && <span className="ml-auto text-sm font-bold text-emerald-700">≈ {inr(r.estimatedMonthlySavingInr)} / month</span>}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{r.detail}</p>
                    <p className="mt-1 text-xs text-slate-400">Estimate basis: {r.assumption}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </Async>
    </div>
  );
}
