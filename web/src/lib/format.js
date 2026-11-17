export const inr = (n) => (n == null ? "–" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }));
export const inr2 = (n) => (n == null ? "–" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const num = (n, d = 2) => (n == null || Number.isNaN(n) ? "–" : Number(n).toFixed(d));
const TZ = "Asia/Kolkata";
export const fmtDateTime = (ts) => new Date(ts).toLocaleString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtHour = (ts) => new Date(ts).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtDay = (ts) => new Date(ts).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short" });
