import type { CostEstimate } from '../types/trip';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Inclusive number of days between two ISO dates (same day = 1). */
export function tripLength(start: string, end: string): number {
  const ms = parseISO(end).getTime() - parseISO(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function formatDate(s: string, long = false): string {
  if (!s) return '';
  return parseISO(s).toLocaleDateString(undefined, {
    weekday: long ? 'long' : 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRange(start: string, end: string): string {
  if (!start || !end) return '';
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = parseISO(start);
  const e = parseISO(end);
  const year = e.getFullYear();
  return `${s.toLocaleDateString(undefined, o)} – ${e.toLocaleDateString(undefined, o)}, ${year}`;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatMoney(v: CostEstimate | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return usd.format(v);
  return v;
}

export function sumCosts(values: CostEstimate[]): number {
  return values.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
}

export function pad2(n: number): string {
  return pad(n);
}
