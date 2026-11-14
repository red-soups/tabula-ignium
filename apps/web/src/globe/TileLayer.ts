import * as THREE from 'three';
import { DEG, createPatchGeometry, latLonToVec3, wrapLon } from './geo';

/**
 * Geographic (EPSG:4326 / WGS84) tile pyramid: level 0 tiles span `level0Span` degrees,
 * the grid starts at (-180°, 90°) and every level halves the span.
 */
export interface TileScheme {
  tileSize: number;
  level0Span: number;
  rootLevel: number;
  maxLevel: number;
  url(level: number, x: number, y: number): string;
}

export interface TileLayerOptions {
  scheme: TileScheme;
  radius: number;
  /** Builds the material for a freshly loaded tile texture. */
  material: (tex: THREE.Texture) => THREE.Material;
  /** When false, root tiles are never drawn (the base sphere already covers that detail). */
  drawRoots: boolean;
  /** Texel density (texels per degree) of whatever sits under the roots. */
  rootTexelsPerDeg?: number;
  colorSpace: THREE.ColorSpace;
  transparent?: boolean;
  renderOrder: number;
  maxConcurrent?: number;
  maxCached?: number;
  /** >1 refines sooner (sharper), <1 later (fewer tiles). */
  detail?: number;
}

export interface TileViewContext {
  camera: THREE.PerspectiveCamera;
  frustum: THREE.Frustum;
  /** Camera position as a unit vector, and its distance from the centre. */
  camDir: THREE.Vector3;
  camDist: number;
  camLat: number;
  camLon: number;
  /** Pixels per radian at unit distance, i.e. (viewport height / 2) / tan(fov / 2). */
  focalPx: number;
  frame: number;
}

type State = 'idle' | 'loading' | 'ready' | 'failed';

class TileNode {
  readonly key: string;
  readonly span: number;
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
  readonly sphere: THREE.Sphere;
  state: State = 'idle';
  lastUsed = 0;
  priority = 0;
  texture?: THREE.Texture;
  mesh?: THREE.Mesh;
  abort?: AbortController;
  children?: TileNode[];
  failures = 0;
  readonly level: number;
  readonly x: number;
  readonly y: number;

  constructor(level: number, x: number, y: number, scheme: TileScheme) {
    this.level = level;
    this.x = x;
    this.y = y;
    this.key = `${level}/${x}/${y}`;
    this.span = scheme.level0Span / 2 ** level;
    this.west = -180 + x * this.span;
    this.east = Math.min(180, this.west + this.span);
    this.north = 90 - y * this.span;
    this.south = Math.max(-90, this.north - this.span);
    const c = latLonToVec3((this.south + this.north) / 2, (this.west + this.east) / 2, 1);
    let r = 0;
    for (const [la, lo] of [[this.south, this.west], [this.south, this.east], [this.north, this.west], [this.north, this.east]]) {
      r = Math.max(r, c.distanceTo(latLonToVec3(la, lo, 1)));
    }
    this.sphere = new THREE.Sphere(c, r * 1.02);
  }
}

const tmpV = new THREE.Vector3();

/** Quadtree level-of-detail imagery streamed onto the globe as the camera zooms in. */
export class TileLayer {
  readonly group = new THREE.Group();
  enabled = true;
  /** Deepest level drawn last frame, for the HUD. */
  drawnLevel = 0;
  private roots: TileNode[] = [];
  private nodes = new Map<string, TileNode>();
  private queue: TileNode[] = [];
  private inflight = 0;
  private readonly opt: Required<TileLayerOptions>;
  private renderer: THREE.WebGLRenderer;

  constructor(options: TileLayerOptions, renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.opt = {
      rootTexelsPerDeg: 0,
      transparent: false,
      maxConcurrent: 8,
      maxCached: 320,
      detail: 1,
      ...options,
    };
    const { scheme } = this.opt;
    const span = scheme.level0Span / 2 ** scheme.rootLevel;
    const cols = Math.ceil(360 / span);
    const rows = Math.ceil(180 / span);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) this.roots.push(this.node(scheme.rootLevel, x, y));
    }
  }

  get pending() {
    return this.inflight + this.queue.length;
  }

  update(ctx: TileViewContext) {
    for (const child of this.group.children) child.visible = false;
    this.queue.length = 0;
    this.drawnLevel = 0;
    if (!this.enabled) return;

    const draw: TileNode[] = [];
    for (const root of this.roots) this.visit(root, ctx, draw, true);
    for (const n of draw) {
      n.mesh!.visible = true;
      this.drawnLevel = Math.max(this.drawnLevel, n.level);
    }

    // Shallow levels first so coarse coverage arrives before fine detail.
    this.queue.sort((a, b) => a.level - b.level || b.priority - a.priority);
    for (const n of this.queue) {
      if (this.inflight >= this.opt.maxConcurrent) break;
      if (n.state === 'idle') this.load(n);
    }
    this.queue.length = 0;

    for (const n of this.nodes.values()) {
      if (n.state === 'loading' && ctx.frame - n.lastUsed > 45) n.abort?.abort();
    }
    this.evict(ctx.frame);
  }

  dispose() {
    for (const n of this.nodes.values()) {
      n.abort?.abort();
      this.release(n);
    }
    this.nodes.clear();
  }

  private node(level: number, x: number, y: number) {
    const key = `${level}/${x}/${y}`;
    let n = this.nodes.get(key);
    if (!n) {
      n = new TileNode(level, x, y, this.opt.scheme);
      this.nodes.set(key, n);
    }
    return n;
  }

  private childrenOf(n: TileNode) {
    if (!n.children) {
      const span = n.span / 2;
      const cols = Math.ceil(360 / span);
      const rows = Math.ceil(180 / span);
      n.children = [];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x = n.x * 2 + dx;
        const y = n.y * 2 + dy;
        if (x < cols && y < rows) n.children.push(this.node(n.level + 1, x, y));
      }
    }
    return n.children;
  }

  /** Returns on-screen pixels per degree of latitude, or 0 if the tile is not visible. */
  private measure(n: TileNode, ctx: TileViewContext) {
    if (!ctx.frustum.intersectsSphere(n.sphere)) return 0;
    // Closest point of the tile to the point directly under the camera.
    const lat = THREE.MathUtils.clamp(ctx.camLat, n.south, n.north);
    let lon = ctx.camLon;
    if (lon < n.west || lon > n.east) {
      lon = Math.abs(wrapLon(lon - n.west)) < Math.abs(wrapLon(lon - n.east)) ? n.west : n.east;
    }
    const p = latLonToVec3(lat, lon, 1, tmpV);
    const horizon = 1 / ctx.camDist;
    if (p.dot(ctx.camDir) < horizon - 0.002 && n.sphere.center.dot(ctx.camDir) < horizon - 0.002) return 0;
    const toCam = ctx.camDir.clone().multiplyScalar(ctx.camDist).sub(p);
    const dist = Math.max(toCam.length(), 1e-6);
    const foreshorten = Math.max(0.3, p.dot(toCam.divideScalar(dist)));
    n.priority = -dist;
    return (DEG / dist) * ctx.focalPx * Math.sqrt(foreshorten);
  }

  private texelsPerDeg(n: TileNode, isRoot: boolean) {
    if (isRoot && !this.opt.drawRoots) return this.opt.rootTexelsPerDeg;
    return this.opt.scheme.tileSize / n.span;
  }

  private visit(n: TileNode, ctx: TileViewContext, draw: TileNode[], isRoot = false) {
    const pxPerDeg = this.measure(n, ctx);
    if (pxPerDeg === 0) return;
    n.lastUsed = ctx.frame;
    const drawable = !isRoot || this.opt.drawRoots;
    const refine = n.level < this.opt.scheme.maxLevel &&
      pxPerDeg > this.texelsPerDeg(n, isRoot) * (1 / this.opt.detail);

    if (refine) {
      let ready = true;
      for (const c of this.childrenOf(n)) {
        if (this.measure(c, ctx) === 0) continue;
        c.lastUsed = ctx.frame;
        if (c.state !== 'ready') {
          ready = false;
          if (c.state === 'idle') this.queue.push(c);
        }
      }
      if (ready) {
        for (const c of n.children!) this.visit(c, ctx, draw);
        return;
      }
    }
    if (!drawable) return;
    if (n.state === 'ready') draw.push(n);
    else if (n.state === 'idle') this.queue.push(n);
  }

  private async load(n: TileNode) {
    n.state = 'loading';
    this.inflight++;
    const ctrl = new AbortController();
    n.abort = ctrl;
    try {
      const res = await fetch(this.opt.scheme.url(n.level, n.x, n.y), { signal: ctrl.signal, mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none' });
      if (ctrl.signal.aborted) {
        bitmap.close();
        throw new DOMException('aborted', 'AbortError');
      }
      const tex = new THREE.Texture(bitmap);
      tex.flipY = false; // geometry UVs below put the image's first row at the tile's north edge
      tex.colorSpace = this.opt.colorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      n.texture = tex;
      n.mesh = this.buildMesh(n, tex);
      this.group.add(n.mesh);
      n.state = 'ready';
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      n.failures += aborted ? 0 : 1;
      n.state = aborted || n.failures < 3 ? 'idle' : 'failed';
    } finally {
      n.abort = undefined;
      this.inflight--;
    }
  }

  private buildMesh(n: TileNode, tex: THREE.Texture) {
    const seg = THREE.MathUtils.clamp(Math.ceil(n.span / 0.75), 4, 32);
    const north0 = n.north;
    const west0 = n.west;
    const geo = createPatchGeometry({
      west: n.west,
      east: n.east,
      south: n.south,
      north: n.north,
      segX: seg,
      segY: seg,
      radius: this.opt.radius,
      uv: (lat, lon) => [(lon - west0) / n.span, (north0 - lat) / n.span],
    });
    const mesh = new THREE.Mesh(geo, this.opt.material(tex));
    mesh.renderOrder = this.opt.renderOrder + n.level * 0.01;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  private release(n: TileNode) {
    if (n.mesh) {
      this.group.remove(n.mesh);
      n.mesh.geometry.dispose();
      (n.mesh.material as THREE.Material).dispose();
      n.mesh = undefined;
    }
    n.texture?.dispose();
    (n.texture?.image as ImageBitmap | undefined)?.close?.();
    n.texture = undefined;
    n.state = 'idle';
  }

  private evict(frame: number) {
    const ready = [...this.nodes.values()].filter((n) => n.state === 'ready');
    if (ready.length <= this.opt.maxCached) return;
    ready.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const n of ready.slice(0, ready.length - this.opt.maxCached)) {
      if (n.lastUsed < frame) this.release(n);
    }
  }
}
