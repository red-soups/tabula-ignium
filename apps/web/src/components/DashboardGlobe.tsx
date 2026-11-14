import { useEffect, useRef } from 'react'
import { EarthGlobe } from '../globe/EarthGlobe'

export default function DashboardGlobe() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return
    try {
      const globe = new EarthGlobe(container.current, {}, { lat: 20, lon: 105, alt: 2.2 })
      globe.setLayers({ heatmap: false, hotspots: false, clouds: true, labels: false, realSun: false })
      globe.setAutoRotate(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return () => globe.dispose()
    } catch {
      // The background keeps its static appearance when WebGL is unavailable.
    }
  }, [])

  return <div className="hero-globe" ref={container} aria-hidden="true" />
}
