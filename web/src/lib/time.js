// All reporting is in India Standard Time (UTC+05:30, no DST).
const IST_OFFSET_MS = 330 * 60 * 1000;

export function istShift(ts) {
  return new Date(new Date(ts).getTime() + IST_OFFSET_MS);
}
export function istHour(ts) {
  return istShift(ts).getUTCHours();
}
export function istDateKey(ts) {
  return istShift(ts).toISOString().slice(0, 10); // YYYY-MM-DD in IST
}
export function istMonthKey(ts) {
  return istShift(ts).toISOString().slice(0, 7);
}
/** Monday-based week start key (YYYY-MM-DD) for the IST calendar date of ts. */
export function istWeekKey(ts) {
  const d = istShift(ts);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
