#define MAX_WAVES 6

uniform float uTime;
uniform int uWaveCount;
uniform vec4 uWavesA[MAX_WAVES]; // amplitude, wavelength, speed, phase
uniform vec4 uWavesB[MAX_WAVES]; // dirX, dirZ, steepness, _unused
uniform sampler2D uRipple;
uniform float uRippleStrength;
uniform vec4 uExtent; // minX, maxX, minZ, maxZ

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vWaveHeight;
varying float vRipple;
varying vec2 vUV;

void main() {
  vec3 pos = position;
  float h = 0.0;
  vec2 dh = vec2(0.0);

  for (int i = 0; i < MAX_WAVES; i++) {
    if (i >= uWaveCount) break;
    float A = uWavesA[i].x;
    float L = uWavesA[i].y;
    float S = uWavesA[i].z;
    float P = uWavesA[i].w;
    vec2 D = vec2(uWavesB[i].x, uWavesB[i].y);
    float k = 6.2831853 / max(L, 0.0001);
    float phase = k * dot(D, pos.xz) - S * k * uTime + P;
    h += A * sin(phase);
    dh += A * k * D * cos(phase);
  }

  vec2 uv = vec2(
    (pos.x - uExtent.x) / (uExtent.y - uExtent.x),
    (pos.z - uExtent.z) / (uExtent.w - uExtent.z)
  );
  float ripple = texture2D(uRipple, uv).r * uRippleStrength;

  pos.y += h + ripple;

  vec3 nW = normalize(vec3(-dh.x, 1.0, -dh.y));
  vWorldPos = pos;
  vNormalW = nW;
  vWaveHeight = h;
  vRipple = ripple;
  vUV = uv;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
