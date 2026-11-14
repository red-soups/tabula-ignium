// Checks that the web calendar (src/data/harmonized.ts) matches the model's reference
// (apps/model/main.py calendar, which uses fsml/activity.py) on the real exported files.
//
//   cd apps/web && node scripts/check_harmonized.ts
//
// Needs Node 23.6+ (runs TypeScript directly) and the model's Python environment in apps/model/.venv.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { calendar, parseHarmonized, type Box, type CalendarRow, type Manifest } from '../src/data/harmonized.ts';

const DATA = 'public/data/harmonized';
const MODEL = '../model';
const BOXES: Record<string, Box> = {
  amazon: { south: -15, north: -5, west: -60, east: -50 },
  sahel: { south: 5, north: 15, west: -10, east: 30 },
  siberia: { south: 50, north: 65, west: 100, east: 140 },
  'small (2°)': { south: 36, north: 38, west: 127, east: 129 },
  antimeridian: { south: 50, north: 70, west: 170, east: -170 },
};

const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const manifest = JSON.parse(readFileSync(`${DATA}/manifest.json`, 'utf8')) as Manifest;
const grid = parseHarmonized(
  manifest,
  buf(readFileSync(`${DATA}/${manifest.files.cells}`)),
  buf(gunzipSync(readFileSync(`${DATA}/${manifest.files.counts}`))),
  buf(gunzipSync(readFileSync(`${DATA}/${manifest.files.range}`))),
);

const close = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

let failed = 0;
for (const [name, box] of Object.entries(BOXES)) {
  const py = spawnSync(
    `${MODEL}/.venv/bin/python`,
    [`${MODEL}/main.py`, 'calendar', ...[box.south, box.north, box.west, box.east].map(String), '--json', '--data', DATA],
    { encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  if (py.status !== 0) throw new Error(py.stderr);
  const want = JSON.parse(py.stdout) as CalendarRow[];
  const got = calendar(grid, box);
  const bad = got.filter((r, t) => {
    const w = want[t];
    return (
      r.period !== w.period || r.level !== w.level || r.anomaly !== w.anomaly || r.source !== w.source ||
      r.estimated !== w.estimated || !close(r.count, w.count) || !close(r.normal, w.normal) ||
      !close(r.percentile, w.percentile) || !close(r.low, w.low) || !close(r.high, w.high) ||
      !close(r.days, w.days) || !close(r.projected, w.projected)
    );
  });
  const levels = [1, 2, 3, 4, 5].map((l) => got.filter((r) => r.level === l).length).join('/');
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${name.padEnd(13)} ${got.length} months, levels ${levels}` +
    (bad.length ? `, ${bad.length} differ (first ${bad[0].period})` : ''));
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
