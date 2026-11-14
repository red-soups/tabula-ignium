import * as THREE from 'three';

export const DEG = Math.PI / 180;

/**
 * Globe convention used everywhere: unit sphere at the origin, +Y = north pole,
 * lon 0 faces +Z, lon 90°E faces +X.
 */
export function latLonToVec3(lat: number, lon: number, r = 1, out = new THREE.Vector3()) {
  const phi = lat * DEG;
  const th = lon * DEG;
  const c = Math.cos(phi);
  return out.set(r * c * Math.sin(th), r * Math.sin(phi), r * c * Math.cos(th));
}

export function vec3ToLatLon(v: THREE.Vector3) {
  const r = v.length();
  return {
    lat: Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG,
    lon: Math.atan2(v.x, v.z) / DEG,
  };
}

export function wrapLon(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Great-circle distance in degrees. */
export function angularDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const a = Math.sin(((lat2 - lat1) * DEG) / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(((lon2 - lon1) * DEG) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / DEG;
}

/** Nearest intersection distance of a ray with a sphere centred at the origin, or null. */
export function raySphere(origin: THREE.Vector3, dir: THREE.Vector3, r: number) {
  const b = origin.dot(dir);
  const c = origin.lengthSq() - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : null;
}

export interface PatchOptions {
  west: number;
  east: number;
  south: number;
  north: number;
  segX: number;
  segY: number;
  radius: number;
  /** Texture coordinates for the first UV set; defaults to the global equirectangular UV. */
  uv?: (lat: number, lon: number) => [number, number];
}

/**
 * A lat/lon-aligned patch of the sphere. Carries two UV sets: `uv` for the patch's own
 * texture (a tile) and `gUv` for global equirectangular lookups (night lights, ocean mask).
 */
export function createPatchGeometry(o: PatchOptions) {
  const nx = o.segX + 1;
  const ny = o.segY + 1;
  const pos = new Float32Array(nx * ny * 3);
  const nor = new Float32Array(nx * ny * 3);
  const uv = new Float32Array(nx * ny * 2);
  const guv = new Float32Array(nx * ny * 2);
  const v = new THREE.Vector3();
  for (let j = 0; j < ny; j++) {
    const lat = o.south + ((o.north - o.south) * j) / o.segY;
    for (let i = 0; i < nx; i++) {
      const lon = o.west + ((o.east - o.west) * i) / o.segX;
      const k = j * nx + i;
      latLonToVec3(lat, lon, 1, v);
      nor.set([v.x, v.y, v.z], k * 3);
      pos.set([v.x * o.radius, v.y * o.radius, v.z * o.radius], k * 3);
      const gu = (lon + 180) / 360;
      const gv = (lat + 90) / 180;
      guv.set([gu, gv], k * 2);
      uv.set(o.uv ? o.uv(lat, lon) : [gu, gv], k * 2);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < o.segY; j++) {
    for (let i = 0; i < o.segX; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('gUv', new THREE.BufferAttribute(guv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Approximate sub-solar point (where the sun is directly overhead) for a moment in time. */
export function subsolarPoint(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const g = (2 * Math.PI / 365.25) * (day - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) -
    0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  return { lat: decl / DEG, lon: wrapLon(-(minutes + eqTime - 720) / 4) };
}

export function formatLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}
