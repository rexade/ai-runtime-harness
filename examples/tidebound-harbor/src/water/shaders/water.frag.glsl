precision mediump float;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vWaveHeight;
varying float vRipple;
varying vec2 vUV;

uniform sampler2D uShoreSDF;
uniform float uSeafloorY;          // baseline seafloor height (e.g. -1.5)
uniform vec3 uSunDir;
uniform vec3 uPaletteShallow;
uniform vec3 uPaletteMid;
uniform vec3 uPaletteDeep;
uniform vec3 uPaletteFoam;
uniform float uShoreFoamWidth;     // world-space band width for shore foam
uniform float uCrestFoamThreshold; // wave height above which crest foam appears
uniform int uDebugMode;            // 0 = stylized, 1 = height, 2 = shore SDF, 3 = ripple

void main() {
  if (uDebugMode == 1) {
    float h = clamp(vWorldPos.y * 0.5 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(1.0 - h, 0.2, h, 1.0);
    return;
  }
  if (uDebugMode == 2) {
    float d = clamp(texture2D(uShoreSDF, vUV).r * 0.1 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(d, d, 1.0 - d, 1.0);
    return;
  }
  if (uDebugMode == 3) {
    float r = clamp(vRipple * 5.0 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(r, 1.0 - r, 0.0, 1.0);
    return;
  }

  // --- Stylized M0 (smallest beautiful) ---

  // 1. Depth band — water column thickness from this fragment's surface to the seafloor.
  //    Use the shore SDF as a proxy: deeper offshore = larger SDF value.
  float shoreDist = texture2D(uShoreSDF, vUV).r;

  // 2. Banded depth color (3 bands tuned for a 12-unit basin so mid teal dominates the open water)
  vec3 base;
  if (shoreDist < 1.4) {
    base = uPaletteShallow;
  } else if (shoreDist < 5.0) {
    base = uPaletteMid;
  } else {
    base = uPaletteDeep;
  }

  // 3. Banded toon shading from analytical normal (2 bands)
  float ndl = max(dot(vNormalW, normalize(uSunDir)), 0.0);
  float shade = ndl > 0.55 ? 1.0 : (ndl > 0.25 ? 0.88 : 0.78);
  vec3 lit = base * shade;

  // 4. Shore foam — narrow band at the water/land boundary
  bool isShoreFoam = (shoreDist >= 0.0 && shoreDist < uShoreFoamWidth);

  // 5. Crest foam — wave tops above threshold
  bool isCrestFoam = (vWaveHeight > uCrestFoamThreshold);

  // 6. Ripple foam — strong positive bumps from the impulse buffer
  bool isRippleFoam = (vRipple > 0.18);

  if (isShoreFoam || isCrestFoam || isRippleFoam) {
    lit = uPaletteFoam;
  }

  gl_FragColor = vec4(lit, 1.0);
}
