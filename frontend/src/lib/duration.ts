// Keep every hour digit and preserve second precision when present.
export function formatDuration(value: string): string {
  return /^\d{2,3}:\d{2}:00$/.test(value) ? value.slice(0,-3) : value;
}
