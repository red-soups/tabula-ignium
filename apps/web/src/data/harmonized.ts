/**
 * Harmonized MODIS ↔ VIIRS fire record (2000-11 onwards) and the burning activity calendar built from it.
 *
 * Reads the files written by `apps/model/main.py export-web`; format and field meanings are in
 * packages/shared-schemas/README.md. The calendar ranks each month against the same calendar month in
 * the baseline years exactly as apps/model/fsml/activity.py does (checked by scripts/check_harmonized.ts).
 * Self-contained on purpose so Node can run it for that check.
 */

export type Source = 'modis' | 'terra_scaled' | 'viirs_model';

export interface Manifest {
  format: number;
  unit: string;
  grid: { res: number };
  periods: { start: string; count: number };
  n_cells: number;
  source: Source[];
  sources: Record<Source, string>;
  estimated_sources: Source[];
  range_periods: string[];
  range_note: string;
  index: {
    baseline_years: [number, number];
    min_baseline_years: number;
    level_edges: number[];
    level_names: string[];
    anomaly_percentile: number;
  };
  files: { cells: string; counts: string; range: string };
  credit: string;
  /** Last day the data covers, "YYYY-MM-DD". */
  through?: string;
  /** Months observed for only part of their days, e.g. {"2026-11": {days: 13, of: 30}}. */
  partial?: Record<string, { days: number; of: number }>;
}

export interface HarmonizedGrid {
  manifest: Manifest;
  /** "YYYY-MM" for every month in the files. */
  periods: string[];
  rows: Int16Array;
  cols: Int16Array;
  /** Cell-major: cell i, month t at i * periods.length + t. */
  counts: Float32Array;
  /** Cell-major [cell, range month, low|high]. */
  range: Float32Array;
}

/** Degrees. A box with west > east crosses the antimeridian. */
export interface Box {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface CalendarRow {
  period: string;
  count: number;
  low: number | null;
  high: number | null;
  normal: number | null;
  percentile: number | null;
  /** 1 Very low … 5 Very high, 0 when there are too few baseline years to rank. */
  level: number;
  anomaly: boolean;
  source: Source;
  estimated: boolean;
  /** Days observed when the month is partial (the latest month), else null. */
  days: number | null;
  /** count × days in month / days observed for a partial month, else null. The ranking uses it. */
  projected: number | null;
}

export const DATA_URL = '/data/harmonized';

/** Fewer observed days than this and a partial month's projection swings too much to read as more than a rough guess. */
export const EARLY_ESTIMATE_DAYS = 7;

/** True for a partial month with too few days: show its level as "estimate", visibly. */
export function isEarlyEstimate(row: CalendarRow): boolean {
  return row.days !== null && row.days < EARLY_ESTIMATE_DAYS;
}

function monthsFrom(start: string, count: number): string[] {
  const [y0, m0] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, t) => {
    const m = m0 - 1 + t;
    return `${y0 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
  });
}

export function parseHarmonized(
  manifest: Manifest,
  cells: ArrayBuffer,
  counts: ArrayBuffer,
  range: ArrayBuffer,
): HarmonizedGrid {
  if (manifest.format !== 1) throw new Error(`unsupported harmonized format ${manifest.format}`);
  const n = manifest.n_cells;
  const nt = manifest.periods.count;
  // The files are little-endian, as is every platform browsers run on.
  const rc = new Int16Array(cells);
  const c = new Float32Array(counts);
  const r = new Float32Array(range);
  if (rc.length !== 2 * n || c.length !== n * nt || r.length !== n * manifest.range_periods.length * 2) {
    throw new Error('harmonized files do not match their manifest');
  }
  const rows = new Int16Array(n);
  const cols = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = rc[2 * i];
    cols[i] = rc[2 * i + 1];
  }
  return { manifest, periods: monthsFrom(manifest.periods.start, nt), rows, cols, counts: c, range: r };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  // Some servers already undo the gzip (Content-Encoding); only unpack what is still gzip.
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function loadHarmonized(base = DATA_URL): Promise<HarmonizedGrid> {
  const res = await fetch(`${base}/manifest.json`);
  if (!res.ok) throw new Error(`${base}/manifest.json: HTTP ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  const [cells, counts, range] = await Promise.all(
    [manifest.files.cells, manifest.files.counts, manifest.files.range].map((f) => fetchBytes(`${base}/${f}`)),
  );
  return parseHarmonized(manifest, cells, counts, range);
}

/** Cells whose centre lies inside the box. */
export function cellsIn(g: HarmonizedGrid, box: Box): number[] {
  const res = g.manifest.grid.res;
  const out: number[] = [];
  for (let i = 0; i < g.rows.length; i++) {
    const lat = 90 - (g.rows[i] + 0.5) * res;
    const lon = -180 + (g.cols[i] + 0.5) * res;
    const inLon = box.west <= box.east ? lon >= box.west && lon <= box.east : lon >= box.west || lon <= box.east;
    if (lat >= box.south && lat <= box.north && inLon) out.push(i);
  }
  return out;
}

/** numpy.round: halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x - Math.trunc(x)) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function median(sorted: number[]): number | null {
  const n = sorted.length;
  if (!n) return null;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** First index whose value is >= v (left) or > v (right) in an ascending array. */
function search(a: number[], v: number, right: boolean): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v || (right && a[mid] === v)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Monthly calendar for every month in the record; the ranking always uses the full baseline. */
export function calendar(g: HarmonizedGrid, box: Box): CalendarRow[] {
  const { manifest: m, periods } = g;
  const nt = periods.length;
  const cells = cellsIn(g, box);

  const totals = new Float64Array(nt);
  for (const i of cells) {
    const off = i * nt;
    for (let t = 0; t < nt; t++) totals[t] += g.counts[off + t];
  }
  // A partial month is ranked on its projected total; baseline years are always complete.
  const partial = periods.map((p) => m.partial?.[p] ?? null);
  const projected = periods.map((_, t) => {
    const pt = partial[t];
    return pt ? (totals[t] * pt.of) / pt.days : null;
  });
  const rounded = periods.map((_, t) => roundHalfEven(projected[t] ?? totals[t]));

  const [y0, y1] = m.index.baseline_years;
  const raw: number[][] = Array.from({ length: 12 }, () => []);
  const ranked: number[][] = Array.from({ length: 12 }, () => []);
  periods.forEach((p, t) => {
    const year = Number(p.slice(0, 4));
    if (year < y0 || year > y1) return;
    const month = Number(p.slice(5, 7)) - 1;
    raw[month].push(totals[t]);
    ranked[month].push(rounded[t]);
  });
  raw.forEach((a) => a.sort((x, y) => x - y));
  ranked.forEach((a) => a.sort((x, y) => x - y));

  const nr = m.range_periods.length;
  const rangeAt = new Map(m.range_periods.map((p, k) => [p, k]));
  const estimated = new Set<Source>(m.estimated_sources);

  return periods.map((period, t) => {
    const month = Number(period.slice(5, 7)) - 1;
    const base = ranked[month];
    let percentile: number | null = null;
    if (base.length >= m.index.min_baseline_years) {
      const below = search(base, rounded[t], false);
      const ties = search(base, rounded[t], true) - below;
      percentile = (100 * (below + 0.5 * ties)) / base.length;
    }
    let level = 0;
    if (percentile !== null) level = 1 + m.index.level_edges.filter((e) => percentile! >= e).length;

    let low: number | null = null;
    let high: number | null = null;
    const k = rangeAt.get(period);
    if (k !== undefined) {
      low = 0;
      high = 0;
      for (const i of cells) {
        low += g.range[(i * nr + k) * 2];
        high += g.range[(i * nr + k) * 2 + 1];
      }
    }
    const source = m.source[t];
    return {
      period,
      count: totals[t],
      low,
      high,
      normal: median(raw[month]),
      percentile,
      level,
      anomaly: percentile !== null && percentile >= m.index.anomaly_percentile,
      source,
      estimated: estimated.has(source),
      days: partial[t]?.days ?? null,
      projected: projected[t],
    };
  });
}

/** Rows between two "YYYY-MM" months, inclusive. */
export function between(rows: CalendarRow[], from: string, to: string): CalendarRow[] {
  return rows.filter((r) => r.period >= from && r.period <= to);
}

const CSV_FIELDS: (keyof CalendarRow)[] = [
  'period', 'count', 'low', 'high', 'normal', 'percentile', 'level', 'anomaly', 'source', 'estimated',
  'days', 'projected',
];

export function toCSV(rows: CalendarRow[]): string {
  const cell = (v: CalendarRow[keyof CalendarRow]) =>
    v === null ? '' : typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v);
  return [CSV_FIELDS.join(','), ...rows.map((r) => CSV_FIELDS.map((f) => cell(r[f])).join(','))].join('\n') + '\n';
}

export interface CalendarSummary {
  /** Calendar year with the most detections among complete years. */
  busiestYear: { year: number; count: number } | null;
  /** Calendar month (1–12) with the highest normal: the usual peak of the fire season. */
  peakMonth: number | null;
  /** Months at or above the anomaly percentile. */
  anomalies: CalendarRow[];
  /** Last month in the rows and how it compares with its normal (projected when the month is partial). */
  latest: CalendarRow | null;
  latestVsNormal: number | null;
}

export function summarize(rows: CalendarRow[]): CalendarSummary {
  const years = new Map<number, { count: number; months: number }>();
  for (const r of rows) {
    const y = Number(r.period.slice(0, 4));
    const e = years.get(y) ?? { count: 0, months: 0 };
    e.count += r.count;
    e.months += 1;
    years.set(y, e);
  }
  let busiestYear: CalendarSummary['busiestYear'] = null;
  for (const [year, e] of years) {
    if (e.months === 12 && (!busiestYear || e.count > busiestYear.count)) busiestYear = { year, count: e.count };
  }
  let peakMonth: number | null = null;
  let peakNormal = -1;
  for (const r of rows) {
    if (r.normal !== null && r.normal > peakNormal) {
      peakNormal = r.normal;
      peakMonth = Number(r.period.slice(5, 7));
    }
  }
  const latest = rows.length ? rows[rows.length - 1] : null;
  return {
    busiestYear,
    peakMonth,
    anomalies: rows.filter((r) => r.anomaly),
    latest,
    latestVsNormal: latest && latest.normal ? (latest.projected ?? latest.count) / latest.normal : null,
  };
}
