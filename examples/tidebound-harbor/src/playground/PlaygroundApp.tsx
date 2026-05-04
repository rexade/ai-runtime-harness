import { useEffect, useRef, useState } from 'react'
import { PlaygroundScene } from './PlaygroundScene'

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<PlaygroundScene | null>(null)
  const url = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const initialPreset = (url.get('preset') === 'storm' ? 'storm' : 'calm') as 'calm' | 'storm'
  const initialDebug = Math.max(0, Math.min(3, Number(url.get('debug') ?? '0'))) as 0 | 1 | 2 | 3
  const [preset, setPreset] = useState<'calm' | 'storm'>(initialPreset)
  const [debug, setDebug] = useState<0 | 1 | 2 | 3>(initialDebug)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scene = new PlaygroundScene()
    sceneRef.current = scene
    let cancelled = false
    scene.mount(canvas).catch((err) => {
      console.error('Playground mount failed', err)
    }).then(() => {
      if (cancelled) scene.dispose()
    })
    return () => {
      cancelled = true
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setPreset(preset)
  }, [preset])

  useEffect(() => {
    sceneRef.current?.setDebugMode(debug)
  }, [debug])

  return (
    <div className="pg-root">
      <canvas ref={canvasRef} className="pg-canvas" />
      <div className="pg-controls">
        <fieldset>
          <legend>Regime</legend>
          <button className={preset === 'calm' ? 'on' : ''} onClick={() => setPreset('calm')}>calm</button>
          <button className={preset === 'storm' ? 'on' : ''} onClick={() => setPreset('storm')}>storm</button>
        </fieldset>
        <fieldset>
          <legend>Debug</legend>
          <button className={debug === 0 ? 'on' : ''} onClick={() => setDebug(0)}>off</button>
          <button className={debug === 1 ? 'on' : ''} onClick={() => setDebug(1)}>height</button>
          <button className={debug === 2 ? 'on' : ''} onClick={() => setDebug(2)}>shore</button>
          <button className={debug === 3 ? 'on' : ''} onClick={() => setDebug(3)}>ripple</button>
        </fieldset>
      </div>
    </div>
  )
}
