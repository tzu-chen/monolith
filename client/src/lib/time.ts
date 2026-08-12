/**
 * Timestamps in the chrome.
 *
 * The preview toolbars name the wall-clock time of the last build — "compiled
 * 14:32:07" — rather than its age. A clock time is a fixed thing you can hold
 * against your own memory of when you last hit Compile, and it does not rewrite
 * itself under your eyes while you read it.
 *
 * Ages are still the right unit for things that happened elsewhere and long
 * ago (a plot last touched in Pyramid, a project last opened), so `formatAge`
 * stays for those.
 */

/** "14:32:07", with a date in front once the build is no longer from today. */
export function formatClock(at: number | null): string {
  if (at === null) return 'never';
  const then = new Date(at);
  const time = then.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const now = new Date();
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) return time;
  return `${then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

/** "2m ago" for a timestamp, or `never` for one that never happened. */
export function formatAge(at: number | null): string {
  if (at === null) return 'never';
  const seconds = (Date.now() - at) / 1000;
  if (seconds < 1) return 'just now';
  if (seconds < 60) return `${seconds.toFixed(1)}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The same, for an ISO-8601 string from a service. */
export function formatIsoAge(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 'unknown' : formatAge(at);
}
