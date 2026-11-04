/** Mise en forme des indicateurs de supervision (fr-FR). */
const nf = new Intl.NumberFormat('fr-FR');
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayTime = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const hour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
/** 1 284 ; 12,9 k au-delà de 10 000. */
export const fmtCount = (n: number | null | undefined) => (n == null ? '—' : n >= 10_000 ? compact.format(n) : nf.format(n));
export const fmtDec = (n: number | null | undefined) => (n == null ? '—' : nf1.format(n));
export const fmtMs = (ms: number | null | undefined) => (ms == null ? '—' : ms >= 1000 ? `${nf1.format(ms / 1000)} s` : `${nf.format(Math.round(ms))} ms`);
export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${nf1.format(n)} %`);
export const fmtTime = (iso: string) => time.format(new Date(iso));
export const fmtDayTime = (iso: string) => dayTime.format(new Date(iso));
export const fmtHour = (iso: string) => hour.format(new Date(iso));

/** « à l'instant », « il y a 3 min », « il y a 2 h ». */
export function fmtAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86_400)} j`;
}

export function fmtDuration(fromIso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}
