// Display formatting shared by server and client components (US English).
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "1985-03-20" → "March 20, 1985" (no time-zone conversion: it is a civil date). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "14:15" → "2:15 PM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "2024-02-04T03:26:00Z" (a UTC instant) shown as the local wall clock it corresponds to. */
export function formatInstantLocal(isoUtc: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(isoUtc));
}
