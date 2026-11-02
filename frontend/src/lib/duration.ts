// Keep every hour digit and preserve second precision when present.
export function formatDuration(value: string): string {
  return /^\d{2,3}:\d{2}:00$/.test(value) ? value.slice(0,-3) : value;
}

export function hoursToDuration(hours: number): string {
  const seconds = Math.round(hours * 3600);
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
}

export function durationToHours(value: string): number {
  const [hours, minutes, seconds = 0] = value.split(":").map(Number);
  return hours + minutes / 60 + seconds / 3600;
}
