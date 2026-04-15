export function clampNumber(value: number, opts: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return opts.min;
  if (value < opts.min) return opts.min;
  if (value > opts.max) return opts.max;
  return value;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleString();
}
