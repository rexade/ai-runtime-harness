import * as THREE from 'three'
import type { GerstnerWave } from './GerstnerWaves'
import type { WaterPalette } from './WaterMesh'

export interface WaterPreset {
  id: 'calm' | 'storm'
  waves: GerstnerWave[]
  palette: WaterPalette
  shoreFoamWidth: number
  crestFoamThreshold: number
  sunDirectionDeg: number
  rippleStrength: number
  rippleDamping: number
}

export const CALM: WaterPreset = {
  id: 'calm',
  waves: [
    { amplitude: 0.18, wavelength: 6.0, steepness: 0.0, directionDeg: 305, speed: 1.1, phase: 0.0 },
    { amplitude: 0.10, wavelength: 3.4, steepness: 0.0, directionDeg: 320, speed: 1.4, phase: 1.7 },
    { amplitude: 0.05, wavelength: 1.6, steepness: 0.0, directionDeg: 280, speed: 2.0, phase: 3.1 },
  ],
  palette: {
    shallow: new THREE.Color(0x6fc8c0),
    mid: new THREE.Color(0x2c7a8a),
    deep: new THREE.Color(0x123345),
    foam: new THREE.Color(0xe8f3f4),
  },
  shoreFoamWidth: 0.55,
  crestFoamThreshold: 0.22,
  sunDirectionDeg: 225,
  rippleStrength: 1.0,
  rippleDamping: 0.985,
}

export const STORM: WaterPreset = {
  id: 'storm',
  waves: [
    { amplitude: 0.55, wavelength: 5.0, steepness: 0.0, directionDeg: 200, speed: 1.6, phase: 0.0 },
    { amplitude: 0.40, wavelength: 3.4, steepness: 0.0, directionDeg: 215, speed: 2.0, phase: 1.7 },
    { amplitude: 0.22, wavelength: 1.4, steepness: 0.0, directionDeg: 180, speed: 2.6, phase: 3.1 },
    { amplitude: 0.14, wavelength: 0.8, steepness: 0.0, directionDeg: 230, speed: 3.0, phase: 0.5 },
  ],
  palette: {
    shallow: new THREE.Color(0x537a78),
    mid: new THREE.Color(0x244046),
    deep: new THREE.Color(0x0a1820),
    foam: new THREE.Color(0xd2dee0),
  },
  shoreFoamWidth: 1.10,
  crestFoamThreshold: 0.42,
  sunDirectionDeg: 250,
  rippleStrength: 1.2,
  rippleDamping: 0.978,
}

export const PRESETS = { calm: CALM, storm: STORM }
