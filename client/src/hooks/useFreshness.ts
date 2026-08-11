import { useEffect, useState } from 'react';

/**
 * A live "1.8s ago" label for a timestamp.
 *
 * The handoff's preview toolbar shows how stale the render is, and the answer
 * changes while you sit there — so this re-renders on its own, slowing down as
 * the number gets less interesting.
 */
/** "2m ago" for a timestamp, or `null` for one that never happened. */
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

export function useFreshness(at: number | null): string {
  const [, tick] = useState(0);

  useEffect(() => {
    if (at === null) return;
    const age = () => Date.now() - at;
    // Sub-minute ages move visibly; beyond that, once a minute is plenty.
    const schedule = () => (age() < 60_000 ? 1_000 : 60_000);
    let timer = window.setTimeout(function run() {
      tick((n) => n + 1);
      timer = window.setTimeout(run, schedule());
    }, schedule());
    return () => window.clearTimeout(timer);
  }, [at]);

  return formatAge(at);
}
