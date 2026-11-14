import * as THREE from 'three';
import { DEG, angularDistance, latLonToVec3, wrapLon } from './geo';

/** Camera state: the point under the camera and its altitude in Earth radii. */
export interface GeoView {
  lat: number;
  lon: number;
  alt: number;
}

interface Flight {
  from: GeoView;
  to: GeoView;
  t: number;
  duration: number;
  arc: number;
}

type Pick = (clientX: number, clientY: number) => { lat: number; lon: number } | null;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Google-Earth-style globe navigation: the surface follows the pointer, rotation slows
 * as you zoom in, the wheel zooms toward the cursor, with inertia and fly-to animations.
 */
export class GlobeControls {
  readonly view: GeoView;
  readonly target: GeoView;
  minAlt = 0.0022; // ≈14 km
  maxAlt = 6;
  autoRotate = true;
  autoRotateSpeed = 4; // degrees per second at full altitude
  onInteract?: () => void;
  onClick?: (clientX: number, clientY: number) => void;

  private pointers = new Map<number, { x: number; y: number }>();
  private velocity = { lat: 0, lon: 0 };
  private lastMove = 0;
  private dragDistance = 0;
  private pinchDistance = 0;
  private flight?: Flight;
  private readonly listeners: [string, EventListener, AddEventListenerOptions?][] = [];
  private dom: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private pick: Pick;

  constructor(
    dom: HTMLElement,
    camera: THREE.PerspectiveCamera,
    pick: Pick,
    initial: GeoView,
  ) {
    this.dom = dom;
    this.camera = camera;
    this.pick = pick;
    this.view = { ...initial };
    this.target = { ...initial };
    this.on('pointerdown', this.onPointerDown as EventListener);
    this.on('pointermove', this.onPointerMove as EventListener);
    this.on('pointerup', this.onPointerUp as EventListener);
    this.on('pointercancel', this.onPointerUp as EventListener);
    this.on('wheel', this.onWheel as EventListener, { passive: false });
    this.on('dblclick', this.onDoubleClick as EventListener);
    this.apply();
  }

  get dragging() {
    return this.pointers.size > 0 && this.dragDistance > 4;
  }

  dispose() {
    for (const [type, fn, opt] of this.listeners) this.dom.removeEventListener(type, fn, opt);
  }

  flyTo(to: GeoView, duration?: number) {
    const from = { ...this.view };
    const dist = angularDistance(from.lat, from.lon, to.lat, to.lon);
    const dest = { lat: to.lat, lon: to.lon, alt: THREE.MathUtils.clamp(to.alt, this.minAlt, this.maxAlt) };
    this.flight = {
      from,
      to: dest,
      t: 0,
      duration: duration ?? THREE.MathUtils.clamp(0.9 + dist / 80 + Math.abs(Math.log(dest.alt / from.alt)) * 0.18, 1, 3.4),
      arc: THREE.MathUtils.clamp(dist / 70, 0, 1.6) * Math.min(1, Math.max(from.alt, dest.alt) + 0.3),
    };
    this.velocity.lat = this.velocity.lon = 0;
  }

  zoomBy(factor: number) {
    this.flight = undefined;
    this.target.alt = THREE.MathUtils.clamp(this.target.alt * factor, this.minAlt, this.maxAlt);
  }

  update(dt: number) {
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = easeInOut(f.t);
      this.view.lat = f.from.lat + (f.to.lat - f.from.lat) * e;
      this.view.lon = wrapLon(f.from.lon + wrapLon(f.to.lon - f.from.lon) * e);
      this.view.alt = Math.exp(Math.log(f.from.alt) + (Math.log(f.to.alt) - Math.log(f.from.alt)) * e) +
        f.arc * Math.sin(Math.PI * e);
      Object.assign(this.target, this.view);
      if (f.t >= 1) this.flight = undefined;
    } else {
      if (this.pointers.size === 0) {
        this.target.lat += this.velocity.lat * dt;
        this.target.lon += this.velocity.lon * dt;
        const decay = Math.exp(-dt * 3.2);
        this.velocity.lat *= decay;
        this.velocity.lon *= decay;
        if (this.autoRotate) {
          this.target.lon += this.autoRotateSpeed * dt * THREE.MathUtils.clamp(this.target.alt / 2, 0.04, 1);
        }
      }
      this.target.lat = THREE.MathUtils.clamp(this.target.lat, -85, 85);
      this.target.lon = wrapLon(this.target.lon);
      const a = 1 - Math.exp(-dt * 16);
      const z = 1 - Math.exp(-dt * 7);
      this.view.lat += (this.target.lat - this.view.lat) * a;
      this.view.lon = wrapLon(this.view.lon + wrapLon(this.target.lon - this.view.lon) * a);
      this.view.alt = Math.exp(Math.log(this.view.alt) + (Math.log(this.target.alt) - Math.log(this.view.alt)) * z);
    }
    this.apply();
  }

  private apply() {
    latLonToVec3(this.view.lat, this.view.lon, 1 + this.view.alt, this.camera.position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
  }

  /** Degrees of arc per screen pixel at the centre of the view. */
  private degPerPixel() {
    const h = this.dom.clientHeight || 1;
    const focal = h / 2 / Math.tan((this.camera.fov * DEG) / 2);
    return (this.view.alt / focal / DEG) * (1 + 0.35 * this.view.alt);
  }

  private interact() {
    this.flight = undefined;
    this.onInteract?.();
  }

  private zoomAt(clientX: number, clientY: number, factor: number) {
    this.interact();
    const old = this.target.alt;
    const next = THREE.MathUtils.clamp(old * factor, this.minAlt, this.maxAlt);
    const p = next < 1.6 ? this.pick(clientX, clientY) : null;
    if (p) {
      // Keep the point under the cursor roughly fixed while zooming.
      const k = 1 - next / old;
      this.target.lat = THREE.MathUtils.clamp(this.target.lat + (p.lat - this.target.lat) * k, -85, 85);
      this.target.lon = wrapLon(this.target.lon + wrapLon(p.lon - this.target.lon) * k);
    }
    this.target.alt = next;
  }

  private on(type: string, fn: EventListener, opt?: AddEventListenerOptions) {
    this.dom.addEventListener(type, fn, opt);
    this.listeners.push([type, fn, opt]);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dom.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.velocity.lat = this.velocity.lon = 0;
    if (this.pointers.size === 1) this.dragDistance = 0;
    if (this.pointers.size === 2) this.pinchDistance = this.pointerSpread();
    this.lastMove = performance.now();
  };

  private onPointerMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.pointers.size >= 2) {
      const spread = this.pointerSpread();
      if (this.pinchDistance > 0 && spread > 0) {
        const [a, b] = [...this.pointers.values()];
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, this.pinchDistance / spread);
      }
      this.pinchDistance = spread;
      this.dragDistance = 99;
      return;
    }

    this.dragDistance += Math.hypot(dx, dy);
    if (this.dragDistance <= 4) return;
    this.interact();
    const k = this.degPerPixel();
    const coslat = Math.max(Math.cos(this.target.lat * DEG), 0.25);
    const dLat = dy * k;
    const dLon = (-dx * k) / coslat;
    this.target.lat = THREE.MathUtils.clamp(this.target.lat + dLat, -85, 85);
    this.target.lon = wrapLon(this.target.lon + dLon);

    const now = performance.now();
    const dt = Math.max((now - this.lastMove) / 1000, 1 / 240);
    this.lastMove = now;
    this.velocity.lat = this.velocity.lat * 0.5 + (dLat / dt) * 0.5;
    this.velocity.lon = this.velocity.lon * 0.5 + (dLon / dt) * 0.5;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId);
    if (this.pointers.size > 0) return;
    if (performance.now() - this.lastMove > 90) this.velocity.lat = this.velocity.lon = 0;
    if (this.dragDistance <= 4 && e.type === 'pointerup') this.onClick?.(e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const factor = Math.exp(THREE.MathUtils.clamp(delta * (e.ctrlKey ? 0.012 : 0.0018), -0.6, 0.6));
    this.zoomAt(e.clientX, e.clientY, factor);
  };

  private onDoubleClick = (e: MouseEvent) => {
    const p = this.pick(e.clientX, e.clientY);
    if (!p) return;
    this.interact();
    this.flyTo({ lat: p.lat, lon: p.lon, alt: this.target.alt * 0.3 }, 1.1);
  };

  private pointerSpread() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
