import { useEffect, useRef, useState } from 'react'
import {
  AdditiveBlending, BackSide, DataTexture, Group, MathUtils, Mesh, MeshBasicMaterial,
  NoColorSpace, PerspectiveCamera, RingGeometry, Scene, ShaderMaterial, SphereGeometry,
  Spherical, SRGBColorSpace, Texture, TextureLoader, Vector3, WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import earthDayUrl from '../assets/earth-day.jpg'
import earthNightUrl from '../assets/earth-night.jpg'
import earthCloudsUrl from '../assets/earth-clouds.jpg'
import earthWaterUrl from '../assets/earth-water.jpg'
import { mockFireLocations, type FireLocation } from '../data/mockFireLocations'
import { atmosphereFragment, cloudFragment, earthFragment, earthVertex } from './globeShaders'

const EARTH_RADIUS = 1
const CAMERA_DISTANCE = 3.35
const INITIAL_CENTER = { latitude: 32, longitude: 131 }

type GlobeActions = {
  focus: (location: Pick<FireLocation, 'latitude' | 'longitude'>, distance?: number) => void
  zoom: (factor: number) => void
}

function positionOnGlobe(latitude: number, longitude: number, radius: number) {
  const lat = MathUtils.degToRad(latitude)
  const lng = MathUtils.degToRad(longitude)
  // SphereGeometry's equirectangular map puts longitude 0 at +X.
  return new Vector3(
    radius * Math.cos(lat) * Math.cos(lng),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lng),
  )
}

function formatCoordinates({ latitude, longitude }: FireLocation) {
  const northSouth = latitude < 0 ? '남위' : '북위'
  const eastWest = longitude < 0 ? '서경' : '동경'
  return `${northSouth} ${Math.abs(latitude).toFixed(2)}°, ${eastWest} ${Math.abs(longitude).toFixed(2)}°`
}

function placeholder(r: number, g: number, b: number) {
  const texture = new DataTexture(new Uint8Array([r, g, b, 255]), 1, 1)
  texture.needsUpdate = true
  return texture
}

export default function FireGlobe() {
  const viewport = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const actions = useRef<GlobeActions | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'texture-error' | 'unavailable'>('loading')
  const selectedLocation = mockFireLocations.find((location) => location.id === selectedId)

  useEffect(() => {
    const viewportElement = viewport.current
    const canvasElement = canvas.current
    if (!viewportElement || !canvasElement) return

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas: canvasElement, antialias: true, alpha: true })
    } catch {
      const frame = requestAnimationFrame(() => setStatus('unavailable'))
      return () => cancelAnimationFrame(frame)
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = SRGBColorSpace
    const scene = new Scene()
    const camera = new PerspectiveCamera(42, 1, 0.1, 20)
    camera.position.copy(positionOnGlobe(INITIAL_CENTER.latitude, INITIAL_CENTER.longitude, CAMERA_DISTANCE))

    const controls = new OrbitControls(camera, canvasElement)
    controls.enablePan = false
    controls.minDistance = 1.6
    controls.maxDistance = 5.5
    controls.rotateSpeed = 0.6
    controls.update()

    // The reference globe uses separate day, night, ocean and cloud layers.
    const darkMap = placeholder(0, 0, 0)
    const dayMap = placeholder(25, 58, 71)
    const sun = positionOnGlobe(22, 115, 1).normalize()
    const earthUniforms = {
      uDay: { value: dayMap as Texture },
      uNight: { value: darkMap as Texture },
      uWater: { value: darkMap as Texture },
      uSun: { value: sun },
    }
    const cloudUniforms = { uClouds: { value: darkMap as Texture }, uSun: earthUniforms.uSun }
    const earthGeometry = new SphereGeometry(EARTH_RADIUS, 128, 64)
    const earthMaterial = new ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
    })
    scene.add(new Mesh(earthGeometry, earthMaterial))

    const cloudGeometry = new SphereGeometry(1.008, 128, 64)
    const cloudMaterial = new ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: earthVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
    })
    scene.add(new Mesh(cloudGeometry, cloudMaterial))

    const atmosphereGeometry = new SphereGeometry(1.08, 96, 48)
    const atmosphereMaterial = new ShaderMaterial({
      uniforms: { uSun: earthUniforms.uSun },
      vertexShader: earthVertex,
      fragmentShader: atmosphereFragment,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    scene.add(new Mesh(atmosphereGeometry, atmosphereMaterial))

    const pointGeometry = new SphereGeometry(0.013, 12, 10)
    const ringGeometry = new RingGeometry(0.019, 0.027, 24)
    const pointMaterial = new MeshBasicMaterial({ color: '#ff3939' })
    const ringMaterial = new MeshBasicMaterial({
      color: '#ff5757', opacity: 0.58, transparent: true, depthWrite: false,
    })
    const upFromSurface = new Vector3(0, 0, 1)
    const markers: Group[] = []
    for (const fire of mockFireLocations) {
      const marker = new Group()
      marker.position.copy(positionOnGlobe(fire.latitude, fire.longitude, EARTH_RADIUS))
      marker.quaternion.setFromUnitVectors(upFromSurface, marker.position.clone().normalize())
      const point = new Mesh(pointGeometry, pointMaterial)
      const ring = new Mesh(ringGeometry, ringMaterial)
      point.position.z = 0.0075
      ring.position.z = 0.003
      marker.add(point, ring)
      scene.add(marker)
      markers.push(marker)
    }

    function render() {
      for (const marker of markers) {
        marker.visible = camera.position.dot(marker.position) > EARTH_RADIUS ** 2
      }
      renderer.render(scene, camera)
    }

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = viewportElement
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      render()
    }

    let flightFrame = 0
    const stopFlight = () => {
      cancelAnimationFrame(flightFrame)
      flightFrame = 0
    }
    const focus = ({ latitude, longitude }: Pick<FireLocation, 'latitude' | 'longitude'>, distance = CAMERA_DISTANCE) => {
      stopFlight()
      const from = new Spherical().setFromVector3(camera.position)
      const to = new Spherical().setFromVector3(positionOnGlobe(latitude, longitude, distance))
      const thetaDelta = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta))
      const startedAt = performance.now()
      const animate = (now: number) => {
        const progress = Math.min((now - startedAt) / 720, 1)
        const eased = progress * progress * (3 - 2 * progress)
        const view = new Spherical(
          from.radius + (to.radius - from.radius) * eased,
          from.phi + (to.phi - from.phi) * eased,
          from.theta + thetaDelta * eased,
        )
        camera.position.setFromSpherical(view)
        controls.update()
        render()
        if (progress < 1) flightFrame = requestAnimationFrame(animate)
      }
      flightFrame = requestAnimationFrame(animate)
    }
    actions.current = {
      focus,
      zoom: (factor) => {
        stopFlight()
        camera.position.setLength(MathUtils.clamp(camera.position.length() * factor, controls.minDistance, controls.maxDistance))
        controls.update()
        render()
      },
    }

    const rotationKeys: Record<string, [number, number]> = {
      ArrowLeft: [-0.17, 0], ArrowRight: [0.17, 0],
      ArrowUp: [0, -0.17], ArrowDown: [0, 0.17],
    }
    function rotateWithKeyboard(event: KeyboardEvent) {
      const delta = rotationKeys[event.key]
      if (!delta) return
      event.preventDefault()
      stopFlight()
      setSelectedId(null)
      const view = new Spherical().setFromVector3(camera.position)
      view.theta += delta[0]
      view.phi += delta[1]
      camera.position.setFromSpherical(view.makeSafe())
      controls.update()
      render()
    }

    let active = true
    const loadedTextures: Texture[] = []
    const loader = new TextureLoader()
    const loadTexture = (url: string, color: boolean, onLoad: (texture: Texture) => void, required = false) => {
      loader.load(url, (texture) => {
        if (!active) { texture.dispose(); return }
        texture.colorSpace = color ? SRGBColorSpace : NoColorSpace
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
        loadedTextures.push(texture)
        onLoad(texture)
        render()
        if (required) setStatus('ready')
      }, undefined, () => { if (active && required) setStatus('texture-error') })
    }
    loadTexture(earthDayUrl, true, (texture) => { earthUniforms.uDay.value = texture }, true)
    loadTexture(earthNightUrl, true, (texture) => { earthUniforms.uNight.value = texture })
    loadTexture(earthWaterUrl, false, (texture) => { earthUniforms.uWater.value = texture })
    loadTexture(earthCloudsUrl, false, (texture) => { cloudUniforms.uClouds.value = texture })

    const onInteract = () => { stopFlight(); setSelectedId(null) }
    controls.addEventListener('start', onInteract)
    controls.addEventListener('change', render)
    canvasElement.addEventListener('keydown', rotateWithKeyboard)
    const observer = new ResizeObserver(resize)
    observer.observe(viewportElement)
    resize()

    return () => {
      active = false
      actions.current = null
      stopFlight()
      observer.disconnect()
      controls.removeEventListener('start', onInteract)
      controls.removeEventListener('change', render)
      controls.dispose()
      canvasElement.removeEventListener('keydown', rotateWithKeyboard)
      earthGeometry.dispose()
      earthMaterial.dispose()
      cloudGeometry.dispose()
      cloudMaterial.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      pointGeometry.dispose()
      ringGeometry.dispose()
      pointMaterial.dispose()
      ringMaterial.dispose()
      dayMap.dispose()
      darkMap.dispose()
      loadedTextures.forEach((texture) => texture.dispose())
      renderer.dispose()
    }
  }, [])

  return (
    <div className="fire-globe-layout">
      <div ref={viewport} className="fire-globe-viewport">
        <canvas
          ref={canvas}
          tabIndex={status === 'unavailable' ? -1 : 0}
          aria-label="시연 화재 위치가 표시된 3D 지구본. 방향키로 회전할 수 있습니다."
        />
        <div className="fire-globe-viewport-label"><span className="fire-globe-live-dot" /> 지구 관측 미리보기 <small>· 시연 데이터</small></div>
        <div className="fire-globe-tools" aria-label="지구본 조작">
          <button type="button" onClick={() => actions.current?.zoom(0.78)} disabled={status === 'unavailable'} aria-label="지구본 확대" title="확대">+</button>
          <button type="button" onClick={() => actions.current?.zoom(1.28)} disabled={status === 'unavailable'} aria-label="지구본 축소" title="축소">−</button>
          <button type="button" onClick={() => { setSelectedId(null); actions.current?.focus(INITIAL_CENTER) }} disabled={status === 'unavailable'} aria-label="처음 시점으로" title="처음 시점으로">⌖</button>
        </div>
        {status === 'loading' && <p className="fire-globe-status" role="status">지구 이미지를 불러오는 중입니다.</p>}
        {status === 'texture-error' && <p className="fire-globe-status" role="status">지구 이미지를 불러오지 못했습니다.</p>}
        {status === 'unavailable' && <p className="fire-globe-status" role="status">이 브라우저에서 3D 지구본을 표시할 수 없습니다.</p>}
        {selectedLocation && <div className="fire-globe-focus-label"><span className="fire-globe-dot" /> {selectedLocation.name}<small>{formatCoordinates(selectedLocation)}</small></div>}
        <div className="fire-globe-viewport-footer">
          {status !== 'unavailable' && <span>드래그로 회전 · 스크롤 또는 두 손가락으로 확대</span>}
          <a href="https://github.com/red-soups/firescope" target="_blank" rel="noreferrer">영상: Sentinel-2 © EOX · NASA (FireScope)</a>
        </div>
      </div>
      <aside className="fire-globe-locations" aria-label="시연 화재 위치">
        <div className="fire-globe-locations-heading">
          <span>DEMO LOCATIONS</span>
          <strong>{String(mockFireLocations.length).padStart(2, '0')}</strong>
        </div>
        <h3>시연 화재 위치</h3>
        <p>위치를 선택하면 지구본이 해당 좌표로 이동합니다.</p>
        <ul>
          {mockFireLocations.map((location) => (
            <li key={location.id}>
              <button
                type="button"
                className={selectedId === location.id ? 'is-selected' : undefined}
                aria-pressed={selectedId === location.id}
                onClick={() => { setSelectedId(location.id); actions.current?.focus(location) }}
                disabled={status === 'unavailable'}
              >
                <span className="fire-globe-dot" aria-hidden="true" />
                <span>
                  <strong>{location.name}</strong>
                  <small>{formatCoordinates(location)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="fire-globe-demo-note">빨간 표시는 실제 화재 정보가 아닌 시연용 좌표입니다.</div>
      </aside>
    </div>
  )
}
