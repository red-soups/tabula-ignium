import * as THREE from 'three';
import { GlobeControls, type GeoView } from './GlobeControls';
import { TileLayer, type TileScheme, type TileViewContext } from './TileLayer';
import { DEG, createPatchGeometry, latLonToVec3, raySphere, subsolarPoint, vec3ToLatLon, wrapLon } from './geo';
import * as S from './shaders';

/**
 * Fire detections in columnar form, so a week of FIRMS data (~1.5M rows) costs a few
 * typed arrays instead of a million objects.
 */
export interface HotspotSet {
  count: number;
  lat: Float32Array;
  lon: Float32Array;
  /** Fire radiative power, MW. */
  frp: Float32Array;
  /** Region id per detection; 255 = no region. */
  region: Uint8Array;
  /** Tooltip text for one detection, built on demand. */
  describe(i: number): HotspotDetail;
}

export interface HotspotDetail {
  sensor: string;
  confidence: string;
  when: string;
}

export interface RegionMarker {
  id: number;
  name: string;
  lat: number;
  lon: number;
  /** Rough extent in degrees, used for picking and the selection ring. */
  radius: number;
  score: number;
}

export interface LayerState {
  heatmap: boolean;
  hotspots: boolean;
  clouds: boolean;
  labels: boolean;
  realSun: boolean;
}

export interface ViewInfo {
  lat: number;
  lon: number;
  altKm: number;
  level: number;
  loading: number;
}

export interface HoverInfo {
  x: number;
  y: number;
  lat: number;
  lon: number;
  frp: number;
  detail: HotspotDetail;
}

export interface GlobeCallbacks {
  onRegionClick?: (id: number | null) => void;
  onHover?: (info: HoverInfo | null) => void;
  onView?: (info: ViewInfo) => void;
  onAutoRotate?: (on: boolean) => void;
  onReady?: () => void;
}

export const EARTH_RADIUS_KM = 6371;
export const HOME_VIEW: GeoView = { lat: 12, lon: -62, alt: 2.15 };

// Shell radii (Earth radii). Each mesh's chords sag below its radius by up to
// 1 - cos(half the cell diagonal), so the gaps below keep finer layers from poking through.
const R = {
  tiles: 1.00012,
  clouds: 1.004,
  overlay: 1.00025,
  heat: 1.0006,
  ring: 1.0007,
  hotspots: 1.00025,
  atmosphere: 1.07,
};

const ORDER = { base: 0, tiles: 1, clouds: 2, overlay: 3, heat: 4, ring: 5, atmosphere: 6, hotspots: 7 };

// Sentinel-2 cloudless 2024 by EOX (CC BY-NC-SA 4.0), WGS84 grid: level 0 = 2×1 tiles of 180°.
const SENTINEL2: TileScheme = {
  tileSize: 256,
  level0Span: 180,
  rootLevel: 3,
  maxLevel: 13,
  url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024/default/WGS84/${z}/${y}/${x}.jpg`,
};

// Borders, coastlines and place names (OpenStreetMap data, rendered by EOX).
const OVERLAY: TileScheme = {
  tileSize: 256,
  level0Span: 180,
  rootLevel: 2,
  maxLevel: 13,
  url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright/default/WGS84/${z}/${y}/${x}.png`,
};

const BASE_TEXELS_PER_DEG = 4096 / 360;

const EMPTY_HOTSPOTS: HotspotSet = {
  count: 0,
  lat: new Float32Array(0),
  lon: new Float32Array(0),
  frp: new Float32Array(0),
  region: new Uint8Array(0),
  describe: () => ({ sensor: '', confidence: '', when: '' }),
};

/** 1° cells for the hover/click spatial index. */
const CELLS_X = 360;
const CELLS_Y = 180;
const cellOf = (lat: number, lon: number) =>
  Math.min(CELLS_Y - 1, Math.max(0, Math.floor(lat + 90))) * CELLS_X +
  Math.min(CELLS_X - 1, Math.max(0, Math.floor(lon + 180)));

export class EarthGlobe {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.001, 50);
  private starScene = new THREE.Scene();
  private starCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private controls: GlobeControls;
  private imagery: TileLayer;
  private overlay: TileLayer;
  private clouds: THREE.Mesh;
  private heatMesh: THREE.Mesh;
  private hotspots?: THREE.Points;
  private previewMarkers?: THREE.Points;
  private ring?: THREE.Mesh;
  private labelLayer = document.createElement('div');
  private labels = new Map<number, HTMLDivElement>();

  private uniforms = {
    uDay: { value: null as THREE.Texture | null },
    uNight: { value: null as THREE.Texture | null },
    uWater: { value: null as THREE.Texture | null },
    uClouds: { value: null as THREE.Texture | null },
    uSunDir: { value: new THREE.Vector3(1, 0.3, 1).normalize() },
    uCloudShift: { value: 0 },
    uCloudShadow: { value: 0.3 },
    uSpecular: { value: 1 },
    uAltitude: { value: HOME_VIEW.alt },
  };
  private cloudUniforms = { uClouds: this.uniforms.uClouds, uSunDir: this.uniforms.uSunDir, uOpacity: { value: 0 } };
  private overlayOpacity = { value: 0 };
  private heatUniforms = { uHeat: { value: null as THREE.Texture | null }, uOpacity: { value: 0 } };
  private hotspotUniforms = {
    uSize: { value: 3 },
    uPixelRatio: { value: 1 },
    uTime: { value: 0 },
    uSelected: { value: -1 },
    uAlpha: { value: 1 },
  };
  private ringUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(1, 0.55, 0.2) } };

  private layers: LayerState = { heatmap: true, hotspots: true, clouds: true, labels: true, realSun: false };
  private hs: HotspotSet = EMPTY_HOTSPOTS;
  private pointDirs = new Float32Array(0);
  private cellStart = new Int32Array(CELLS_X * CELLS_Y + 1);
  private cellItems = new Uint32Array(0);
  private regions: RegionMarker[] = [];
  private selected: number | null = null;

  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private raycaster = new THREE.Raycaster();
  private timer = new THREE.Timer();
  private frame = 0;
  private elapsed = 0;
  private lastViewEmit = 0;
  private sunTarget = new THREE.Vector3();
  private hoverAt: { x: number; y: number } | null = null;
  private hovered = -1;
  private hoverDirty = false;
  private hoverEmitted = { x: 0, y: 0 };
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private container: HTMLElement;
  private cb: GlobeCallbacks;

  constructor(container: HTMLElement, cb: GlobeCallbacks = {}, initialView: GeoView = HOME_VIEW) {
    this.container = container;
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x02040a, 1);
    this.renderer.autoClear = false;
    const canvas = this.renderer.domElement;
    canvas.className = 'globe-canvas';
    container.appendChild(canvas);
    this.labelLayer.className = 'globe-labels';
    container.appendChild(this.labelLayer);

    this.loadTextures();
    this.buildStars();

    const earth = new THREE.Mesh(
      createPatchGeometry({ west: -180, east: 180, south: -90, north: 90, segX: 256, segY: 128, radius: 1 }),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: S.earthVertex, fragmentShader: S.earthFragment }),
    );
    earth.renderOrder = ORDER.base;
    this.scene.add(earth);

    this.imagery = new TileLayer({
      scheme: SENTINEL2,
      radius: R.tiles,
      drawRoots: false,
      rootTexelsPerDeg: BASE_TEXELS_PER_DEG,
      colorSpace: THREE.SRGBColorSpace,
      renderOrder: ORDER.tiles,
      detail: 1.15,
      material: (tex) => new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uDay: { value: tex } },
        vertexShader: S.earthVertex,
        fragmentShader: S.earthFragment,
      }),
    }, this.renderer);
    this.scene.add(this.imagery.group);

    this.overlay = new TileLayer({
      scheme: OVERLAY,
      radius: R.overlay,
      drawRoots: true,
      colorSpace: THREE.SRGBColorSpace,
      renderOrder: ORDER.overlay,
      maxConcurrent: 6,
      maxCached: 200,
      detail: 1.3,
      material: (tex) => new THREE.ShaderMaterial({
        uniforms: { uDay: { value: tex }, uSunDir: this.uniforms.uSunDir, uOpacity: this.overlayOpacity },
        vertexShader: S.earthVertex,
        fragmentShader: S.overlayFragment,
        transparent: true,
        depthWrite: false,
      }),
    }, this.renderer);
    this.scene.add(this.overlay.group);

    this.clouds = new THREE.Mesh(
      createPatchGeometry({ west: -180, east: 180, south: -90, north: 90, segX: 192, segY: 96, radius: R.clouds }),
      new THREE.ShaderMaterial({
        uniforms: this.cloudUniforms,
        vertexShader: S.cloudVertex,
        fragmentShader: S.cloudFragment,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.clouds.renderOrder = ORDER.clouds;
    this.scene.add(this.clouds);

    this.heatMesh = new THREE.Mesh(
      createPatchGeometry({ west: -180, east: 180, south: -90, north: 90, segX: 360, segY: 180, radius: R.heat }),
      new THREE.ShaderMaterial({
        uniforms: this.heatUniforms,
        vertexShader: S.heatVertex,
        fragmentShader: S.heatFragment,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.heatMesh.renderOrder = ORDER.heat;
    this.heatMesh.visible = false;
    this.scene.add(this.heatMesh);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R.atmosphere, 128, 64),
      new THREE.ShaderMaterial({
        uniforms: { uSunDir: this.uniforms.uSunDir, uInner: { value: 1 }, uOuter: { value: R.atmosphere } },
        vertexShader: S.atmosphereVertex,
        fragmentShader: S.atmosphereFragment,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    atmosphere.renderOrder = ORDER.atmosphere;
    this.scene.add(atmosphere);

    this.controls = new GlobeControls(canvas, this.camera, (x, y) => this.pickLatLon(x, y), initialView);
    this.controls.onInteract = () => {
      if (this.controls.autoRotate) {
        this.controls.autoRotate = false;
        this.cb.onAutoRotate?.(false);
      }
    };
    this.controls.onClick = (x, y) => this.handleClick(x, y);
    canvas.addEventListener('pointermove', this.onHoverMove);
    canvas.addEventListener('pointerleave', this.onHoverLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  // ---------------------------------------------------------------- public API

  setData(hotspots: HotspotSet, regions: RegionMarker[]) {
    this.hs = hotspots;
    this.hovered = -1;
    this.cb.onHover?.(null);
    this.regions = regions;
    this.buildHotspots();
    this.buildHeatmap();
    this.buildLabels();
    if (this.selected !== null && !regions.some((r) => r.id === this.selected)) this.selectRegion(null);
    else this.selectRegion(this.selected);
  }

  setLayers(layers: LayerState) {
    this.layers = { ...layers };
    this.overlay.enabled = layers.labels;
  }

  setPreviewMarkers(locations: readonly { latitude: number; longitude: number }[]) {
    if (this.previewMarkers) {
      this.scene.remove(this.previewMarkers);
      this.previewMarkers.geometry.dispose();
      (this.previewMarkers.material as THREE.Material).dispose();
      this.previewMarkers = undefined;
    }
    if (locations.length === 0) return;

    const positions = new Float32Array(locations.length * 3);
    locations.forEach((location, index) => {
      const point = latLonToVec3(location.latitude, location.longitude, 1.002);
      positions.set([point.x, point.y, point.z], index * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: this.renderer.getPixelRatio() } },
      vertexShader: `
        uniform float uPixelRatio;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 7.0 * uPixelRatio;
        }
      `,
      fragmentShader: `
        void main() {
          float alpha = 1.0 - smoothstep(0.38, 0.5, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(1.0, 0.18, 0.18, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.previewMarkers = new THREE.Points(geometry, material);
    this.previewMarkers.renderOrder = ORDER.hotspots + 1;
    this.previewMarkers.frustumCulled = false;
    this.scene.add(this.previewMarkers);
  }

  selectRegion(id: number | null) {
    this.selected = id;
    this.hotspotUniforms.uSelected.value = id ?? -1;
    if (this.ring) {
      this.scene.remove(this.ring);
      this.ring.geometry.dispose();
      (this.ring.material as THREE.Material).dispose();
      this.ring = undefined;
    }
    const region = this.regions.find((r) => r.id === id);
    if (!region) return;
    this.ring = new THREE.Mesh(
      ringGeometry(region.lat, region.lon, region.radius, region.radius * 0.07),
      new THREE.ShaderMaterial({
        uniforms: this.ringUniforms,
        vertexShader: S.heatVertex,
        fragmentShader: S.ringFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.ring.renderOrder = ORDER.ring;
    this.scene.add(this.ring);
  }

  flyToRegion(id: number) {
    const r = this.regions.find((x) => x.id === id);
    if (!r) return;
    this.stopAutoRotate();
    this.controls.flyTo({ lat: r.lat, lon: r.lon, alt: THREE.MathUtils.clamp(r.radius * 0.11, 0.3, 1.2) });
  }

  flyTo(view: GeoView) {
    this.stopAutoRotate();
    this.controls.flyTo(view);
  }

  zoom(factor: number) {
    this.controls.zoomBy(factor);
  }

  resetView() {
    this.controls.flyTo(HOME_VIEW);
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
    this.cb.onAutoRotate?.(on);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.imagery.dispose();
    this.overlay.dispose();
    this.renderer.domElement.removeEventListener('pointermove', this.onHoverMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.onHoverLeave);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    for (const u of [this.uniforms.uDay, this.uniforms.uNight, this.uniforms.uWater, this.uniforms.uClouds, this.heatUniforms.uHeat]) {
      u.value?.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
  }

  // ---------------------------------------------------------------- setup

  private loadTextures() {
    const loader = new THREE.TextureLoader();
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    const base = import.meta.env.BASE_URL + 'textures/';
    const load = (file: string, color: boolean, slot: { value: THREE.Texture | null }) =>
      new Promise<void>((resolve) => {
        loader.load(base + file, (tex) => {
          tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          tex.anisotropy = aniso;
          if (slot === this.uniforms.uClouds) tex.wrapS = THREE.RepeatWrapping;
          slot.value = tex;
          resolve();
        }, undefined, () => resolve());
      });
    // Placeholders keep the shader valid until the real images arrive.
    const blank = new THREE.DataTexture(new Uint8Array([8, 18, 40, 255]), 1, 1);
    blank.needsUpdate = true;
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.needsUpdate = true;
    this.uniforms.uDay.value = blank;
    this.uniforms.uNight.value = black;
    this.uniforms.uWater.value = black;
    this.uniforms.uClouds.value = black;
    Promise.all([
      load('earth_day.jpg', true, this.uniforms.uDay),
      load('earth_night.jpg', true, this.uniforms.uNight),
      load('earth_water.jpg', false, this.uniforms.uWater),
      load('earth_clouds.jpg', false, this.uniforms.uClouds),
    ]).then(() => {
      if (!this.disposed) this.cb.onReady?.();
    });
  }

  private buildStars() {
    const n = 7000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      v.randomDirection().multiplyScalar(100);
      pos.set([v.x, v.y, v.z], i * 3);
      const t = Math.random();
      c.setHSL(t < 0.7 ? 0.6 : 0.08, 0.25 + Math.random() * 0.3, 0.75 + Math.random() * 0.25);
      const b = Math.pow(Math.random(), 3) * 0.85 + 0.15;
      col.set([c.r * b, c.g * b, c.b * b], i * 3);
      size.set([Math.random() < 0.02 ? 2.6 : 0.8 + Math.random() * 1.2], i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: this.hotspotUniforms.uPixelRatio },
      vertexShader: /* glsl */ `
        attribute float aSize;
        uniform float uPixelRatio;
        varying vec3 vColor;
        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(vColor, smoothstep(1.0, 0.2, d));
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.starScene.add(new THREE.Points(g, m));
  }

  private buildHotspots() {
    if (this.hotspots) {
      this.scene.remove(this.hotspots);
      this.hotspots.geometry.dispose();
    }
    const hs = this.hs;
    const n = hs.count;
    const pos = new Float32Array(n * 3);
    const dirs = new Float32Array(n * 3);
    const intensity = new Float32Array(n);
    const seed = new Float32Array(n);
    const region = new Float32Array(n);
    const logMax = Math.log(400);
    for (let i = 0; i < n; i++) {
      const phi = hs.lat[i] * DEG;
      const th = hs.lon[i] * DEG;
      const c = Math.cos(phi);
      const x = c * Math.sin(th);
      const y = Math.sin(phi);
      const z = c * Math.cos(th);
      dirs[i * 3] = x;
      dirs[i * 3 + 1] = y;
      dirs[i * 3 + 2] = z;
      pos[i * 3] = x * R.hotspots;
      pos[i * 3 + 1] = y * R.hotspots;
      pos[i * 3 + 2] = z * R.hotspots;
      intensity[i] = Math.min(1, Math.max(0, Math.log(1 + hs.frp[i]) / logMax));
      seed[i] = Math.random();
      region[i] = hs.region[i];
    }
    this.pointDirs = dirs;
    this.buildIndex();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aIntensity', new THREE.BufferAttribute(intensity, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
    const material = (this.hotspots?.material as THREE.ShaderMaterial | undefined) ?? new THREE.ShaderMaterial({
      uniforms: this.hotspotUniforms,
      vertexShader: S.hotspotVertex,
      fragmentShader: S.hotspotFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.hotspots = new THREE.Points(g, material);
    this.hotspots.renderOrder = ORDER.hotspots;
    this.hotspots.frustumCulled = false;
    this.scene.add(this.hotspots);
  }

  /** Counting-sort detections into 1° cells so hover and click only test nearby points. */
  private buildIndex() {
    const hs = this.hs;
    const start = new Int32Array(CELLS_X * CELLS_Y + 1);
    const cell = new Int32Array(hs.count);
    for (let i = 0; i < hs.count; i++) {
      cell[i] = cellOf(hs.lat[i], hs.lon[i]);
      start[cell[i] + 1]++;
    }
    for (let c = 0; c < CELLS_X * CELLS_Y; c++) start[c + 1] += start[c];
    const fill = start.slice(0, CELLS_X * CELLS_Y);
    const items = new Uint32Array(hs.count);
    for (let i = 0; i < hs.count; i++) items[fill[cell[i]]++] = i;
    this.cellStart = start;
    this.cellItems = items;
  }

  /** Bins detections into an equirectangular grid, splats each bin and colours it as a heatmap. */
  private buildHeatmap() {
    const W = 1024;
    const H = 512;
    const hs = this.hs;
    const bins = new Float32Array(W * H);
    for (let i = 0; i < hs.count; i++) {
      const bx = Math.min(W - 1, Math.max(0, Math.floor(((hs.lon[i] + 180) / 360) * W)));
      const by = Math.min(H - 1, Math.max(0, Math.floor(((hs.lat[i] + 90) / 180) * H)));
      bins[by * W + bx] += Math.pow(Math.max(hs.frp[i], 0.1), 0.35);
    }
    const grid = new Float32Array(W * H);
    const rad = 4;
    for (let cy = 0; cy < H; cy++) {
      const sx = rad / Math.max(Math.cos(((cy + 0.5) / H * 180 - 90) * DEG), 0.2);
      const reach = Math.ceil(sx);
      for (let cx = 0; cx < W; cx++) {
        const w = bins[cy * W + cx];
        if (!w) continue;
        for (let dy = -rad; dy <= rad; dy++) {
          const y = cy + dy;
          if (y < 0 || y >= H) continue;
          for (let dx = -reach; dx <= reach; dx++) {
            const d2 = (dx / sx) ** 2 + (dy / rad) ** 2;
            if (d2 > 1) continue;
            grid[y * W + ((cx + dx + W) % W)] += w * (1 - d2) * (1 - d2);
          }
        }
      }
    }
    const nz = Array.from(grid.filter((x) => x > 0)).sort((a, b) => a - b);
    // A high percentile plus a gamma keeps dense multi-day fire belts from saturating.
    const ref = nz.length ? nz[Math.floor(nz.length * 0.995)] : 1;
    const data = new Uint8Array(W * H * 4);
    const lo = [0.55, 0.05, 0.02];
    const mid = [1.0, 0.36, 0.05];
    const hi = [1.0, 0.86, 0.45];
    for (let i = 0; i < W * H; i++) {
      const t = Math.min(1, Math.pow(grid[i] / ref, 0.7));
      if (t <= 0) continue;
      const [a, b, k] = t < 0.5 ? [lo, mid, t * 2] : [mid, hi, (t - 0.5) * 2];
      data[i * 4] = (a[0] + (b[0] - a[0]) * k) * 255;
      data[i * 4 + 1] = (a[1] + (b[1] - a[1]) * k) * 255;
      data[i * 4 + 2] = (a[2] + (b[2] - a[2]) * k) * 255;
      data[i * 4 + 3] = THREE.MathUtils.smoothstep(t, 0.02, 0.6) * 0.82 * 255;
    }
    const tex = new THREE.DataTexture(data, W, H);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    this.heatUniforms.uHeat.value?.dispose();
    this.heatUniforms.uHeat.value = tex;
    this.heatMesh.visible = true;
  }

  private buildLabels() {
    this.labelLayer.replaceChildren();
    this.labels.clear();
    for (const r of this.regions) {
      const el = document.createElement('div');
      el.className = 'globe-label';
      el.innerHTML = `<span class="globe-label-dot"></span><span class="globe-label-name"></span><span class="globe-label-score"></span>`;
      (el.children[1] as HTMLElement).textContent = r.name;
      (el.children[2] as HTMLElement).textContent = String(r.score);
      el.addEventListener('click', () => this.cb.onRegionClick?.(r.id));
      this.labelLayer.appendChild(el);
      this.labels.set(r.id, el);
    }
  }

  // ---------------------------------------------------------------- frame loop

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = this.starCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.starCamera.updateProjectionMatrix();
    this.hotspotUniforms.uPixelRatio.value = this.renderer.getPixelRatio();
  }

  private tick = (time: number) => {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.elapsed += dt;
    this.frame++;

    this.controls.update(dt);
    const view = this.controls.view;
    const alt = view.alt;
    const D = 1 + alt;
    this.camera.near = Math.max(alt * 0.35, 0.0005);
    this.camera.far = Math.sqrt(D * D - 1) + 0.8;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    // Sun: real sub-solar point, or a "studio" light that follows the camera.
    if (this.layers.realSun) {
      const s = subsolarPoint(new Date());
      latLonToVec3(s.lat, s.lon, 1, this.sunTarget);
    } else {
      latLonToVec3(THREE.MathUtils.clamp(view.lat + 20, -60, 60), view.lon - 40, 1, this.sunTarget);
    }
    this.uniforms.uSunDir.value.lerp(this.sunTarget, 1 - Math.exp(-dt * 4)).normalize();
    this.uniforms.uAltitude.value = alt;

    const cloudFade = this.layers.clouds ? THREE.MathUtils.smoothstep(alt, 0.3, 1.1) : 0;
    this.cloudUniforms.uOpacity.value += (cloudFade * 0.9 - this.cloudUniforms.uOpacity.value) * Math.min(1, dt * 5);
    this.uniforms.uCloudShadow.value = 0.32 * this.cloudUniforms.uOpacity.value;
    this.clouds.rotation.y += dt * 0.003;
    this.clouds.visible = this.cloudUniforms.uOpacity.value > 0.01;
    this.uniforms.uCloudShift.value = this.clouds.rotation.y / (2 * Math.PI);

    this.overlayOpacity.value = 1 - THREE.MathUtils.smoothstep(alt, 1.5, 2.6);
    const heatTarget = this.layers.heatmap ? THREE.MathUtils.smoothstep(alt, 0.12, 0.9) : 0;
    this.heatUniforms.uOpacity.value += (heatTarget - this.heatUniforms.uOpacity.value) * Math.min(1, dt * 6);
    this.heatMesh.visible = this.heatUniforms.uOpacity.value > 0.01 && !!this.heatUniforms.uHeat.value;

    if (this.hotspots) {
      this.hotspots.visible = this.layers.hotspots;
      this.hotspotUniforms.uSize.value = THREE.MathUtils.clamp(3.3 * Math.pow(alt, -0.42), 2.4, 20) *
        (this.layers.heatmap && alt > 1 ? 0.85 : 1);
      // Dim individual glows when hundreds of thousands overlap at globe scale.
      const crowd = THREE.MathUtils.clamp(Math.sqrt(40000 / Math.max(1, this.hs.count)), 0.22, 1);
      this.hotspotUniforms.uAlpha.value = THREE.MathUtils.lerp(1, crowd, THREE.MathUtils.smoothstep(alt, 0.08, 0.8));
    }
    this.hotspotUniforms.uTime.value = this.elapsed;
    this.ringUniforms.uTime.value = this.elapsed;

    // Stream imagery tiles for the current view.
    this.projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const ctx: TileViewContext = {
      camera: this.camera,
      frustum: this.frustum,
      camDir: this.camera.position.clone().normalize(),
      camDist: D,
      camLat: view.lat,
      camLon: view.lon,
      focalPx: this.container.clientHeight / 2 / Math.tan((this.camera.fov * DEG) / 2),
      frame: this.frame,
    };
    this.imagery.update(ctx);
    this.overlay.update(ctx);

    this.updateLabels();
    // Re-test hover when the pointer moves, and a few times a second as the globe turns.
    if (this.hoverAt && (this.hoverDirty || this.frame % 8 === 0)) this.updateHover();

    this.starCamera.quaternion.copy(this.camera.quaternion);
    this.renderer.clear();
    this.renderer.render(this.starScene, this.starCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);

    if (this.elapsed - this.lastViewEmit > 0.15) {
      this.lastViewEmit = this.elapsed;
      this.cb.onView?.({
        lat: view.lat,
        lon: wrapLon(view.lon),
        altKm: alt * EARTH_RADIUS_KM,
        level: this.imagery.drawnLevel,
        loading: this.imagery.pending + (this.layers.labels ? this.overlay.pending : 0),
      });
    }
  };

  private updateLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const camDir = this.camera.position.clone().normalize();
    const horizon = 1 / this.camera.position.length();
    const alt = this.controls.view.alt;
    const v = new THREE.Vector3();
    for (const r of this.regions) {
      const el = this.labels.get(r.id)!;
      latLonToVec3(r.lat, r.lon, 1, v);
      const facing = v.dot(camDir);
      const show = facing > horizon + 0.05 && (r.id === this.selected || alt < 1.35) && alt > 0.05;
      if (!show) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        continue;
      }
      v.project(this.camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.opacity = String(THREE.MathUtils.smoothstep(facing, horizon + 0.05, horizon + 0.2));
      el.style.pointerEvents = 'auto';
      el.classList.toggle('is-selected', r.id === this.selected);
    }
  }

  // ---------------------------------------------------------------- picking

  private pickLatLon(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const hit = this.pickLocal(clientX - rect.left, clientY - rect.top);
    return hit && vec3ToLatLon(hit);
  }

  /** Surface point under a container-relative screen position. */
  private pickLocal(x: number, y: number) {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.camera);
    const t = raySphere(this.raycaster.ray.origin, this.raycaster.ray.direction, 1);
    return t === null ? null : this.raycaster.ray.at(t, new THREE.Vector3());
  }

  /** Index of the nearest visible hotspot within `maxPx` of a container-relative point, or -1. */
  private nearestHotspot(x: number, y: number, maxPx: number) {
    if (!this.layers.hotspots || !this.hs.count) return -1;
    const hit = this.pickLocal(x, y);
    if (!hit) return -1;
    const { lat, lon } = vec3ToLatLon(hit);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const focalPx = h / 2 / Math.tan((this.camera.fov * DEG) / 2);
    const pxPerDeg = (DEG / Math.max(hit.distanceTo(this.camera.position), 1e-6)) * focalPx;
    const rLat = (maxPx / pxPerDeg) * 1.6 + 0.02;
    const rLon = Math.min(180, rLat / Math.max(Math.cos(lat * DEG), 0.05));

    const m = this.projScreen.elements;
    const cam = this.camera.position;
    const D = cam.length();
    const horizon = 1 / D;
    const d = this.pointDirs;
    const region = this.hs.region;
    let best = -1;
    let bestD2 = maxPx * maxPx;
    const y0 = Math.max(0, Math.floor(lat - rLat + 90));
    const y1 = Math.min(CELLS_Y - 1, Math.floor(lat + rLat + 90));
    const x0 = Math.floor(lon - rLon + 180);
    const x1 = Math.min(x0 + CELLS_X - 1, Math.floor(lon + rLon + 180));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cxw = x0; cxw <= x1; cxw++) {
        const c = cy * CELLS_X + (((cxw % CELLS_X) + CELLS_X) % CELLS_X);
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          const i = this.cellItems[k];
          if (this.selected !== null && region[i] !== this.selected) continue;
          const px = d[i * 3], py = d[i * 3 + 1], pz = d[i * 3 + 2];
          if ((px * cam.x + py * cam.y + pz * cam.z) / D < horizon + 0.01) continue;
          const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
          const sx = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / cw + 1) * 0.5 * w;
          const sy = (1 - (m[1] * px + m[5] * py + m[9] * pz + m[13]) / cw) * 0.5 * h;
          const d2 = (sx - x) ** 2 + (sy - y) ** 2;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = i;
          }
        }
      }
    }
    return best;
  }

  private handleClick(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const hit = this.nearestHotspot(clientX - rect.left, clientY - rect.top, 14);
    if (hit >= 0 && this.regions.some((r) => r.id === this.hs.region[hit])) {
      return this.cb.onRegionClick?.(this.hs.region[hit]);
    }
    const p = this.pickLatLon(clientX, clientY);
    if (p) {
      let best: RegionMarker | null = null;
      let bestD = Infinity;
      for (const r of this.regions) {
        const dLat = p.lat - r.lat;
        const dLon = wrapLon(p.lon - r.lon) * Math.cos(r.lat * DEG);
        const dist = Math.hypot(dLat, dLon);
        if (dist < r.radius * 1.1 && dist < bestD) {
          best = r;
          bestD = dist;
        }
      }
      if (best) return this.cb.onRegionClick?.(best.id);
    }
    this.cb.onRegionClick?.(null);
  }

  private onHoverMove = (e: PointerEvent) => {
    if (e.buttons) {
      this.hoverAt = null;
      this.setHovered(-1, 0, 0);
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.hoverAt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.hoverDirty = true;
  };

  private onHoverLeave = () => {
    this.hoverAt = null;
    this.setHovered(-1, 0, 0);
  };

  private updateHover() {
    const { x, y } = this.hoverAt!;
    this.hoverDirty = false;
    this.setHovered(this.nearestHotspot(x, y, 10), x, y);
  }

  private setHovered(i: number, x: number, y: number) {
    if (i === this.hovered && (i < 0 || (x === this.hoverEmitted.x && y === this.hoverEmitted.y))) return;
    this.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : '';
    this.hovered = i;
    this.hoverEmitted = { x, y };
    const hs = this.hs;
    this.cb.onHover?.(i >= 0 ? { x, y, lat: hs.lat[i], lon: hs.lon[i], frp: hs.frp[i], detail: hs.describe(i) } : null);
  }

  private stopAutoRotate() {
    if (this.controls.autoRotate) this.setAutoRotate(false);
  }
}

/** A band on the sphere at angular radius `radius` (degrees) around a centre. */
function ringGeometry(lat: number, lon: number, radius: number, width: number) {
  const seg = 160;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const lat1 = lat * DEG;
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const brg = (i / seg) * Math.PI * 2;
    for (const [k, rr] of [[0, radius - width / 2], [1, radius + width / 2]] as const) {
      const d = rr * DEG;
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
      const lon2 = lon * DEG + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
      latLonToVec3(lat2 / DEG, lon2 / DEG, R.ring, v);
      pos.push(v.x, v.y, v.z);
      uv.push(i / seg, k);
    }
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
