// Shared by the base sphere and every imagery tile, so zoomed-in tiles get the exact same
// lighting (day/night terminator, city lights, ocean glint, cloud shadows) as the globe.
export const earthVertex = /* glsl */ `
  attribute vec2 gUv;
  varying vec2 vUv;
  varying vec2 vGUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vGUv = gUv;
    vNormalW = normalize(normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uWater;
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uCloudShift;
  uniform float uCloudShadow;
  uniform float uSpecular;
  uniform float uAltitude;
  varying vec2 vUv;
  varying vec2 vGUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float ndl = dot(n, uSunDir);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vGUv).rgb;
    float water = texture2D(uWater, vGUv).r;

    // Cloud shadows, offset slightly away from the sun.
    vec2 cuv = vec2(vGUv.x - uCloudShift - uSunDir.x * 0.0015, vGUv.y - uSunDir.y * 0.0015);
    float cloud = texture2D(uClouds, cuv).r;
    day *= 1.0 - smoothstep(0.2, 0.9, cloud) * uCloudShadow;

    float dayMix = smoothstep(-0.10, 0.22, ndl);
    float diffuse = clamp(ndl * 1.15 + 0.08, 0.0, 1.0);
    vec3 lit = day * (diffuse * 1.25 + 0.035);

    // Warm band along the terminator.
    float twilight = exp(-pow(ndl * 6.0, 2.0));
    lit += day * vec3(0.55, 0.22, 0.08) * twilight * 0.35;

    // Sun glint on oceans: tight highlight plus a broad sheen.
    vec3 h = normalize(uSunDir + v);
    float nh = max(dot(n, h), 0.0);
    float glint = (pow(nh, 400.0) * 0.28 + pow(nh, 40.0) * 0.05) * water * uSpecular;
    lit += vec3(1.0, 0.93, 0.8) * glint * smoothstep(0.0, 0.15, ndl);

    // City lights on the night side.
    vec3 lights = pow(night, vec3(1.6)) * 2.4 + night * 0.06;
    vec3 color = mix(lights, lit, dayMix);

    // Atmospheric haze toward the limb (only meaningful from orbit).
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float haze = rim * smoothstep(0.02, 0.6, uAltitude);
    color = mix(color, vec3(0.32, 0.55, 1.0) * (0.25 + diffuse), haze * 0.55 * (0.3 + 0.7 * dayMix));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

// Transparent label/border overlay tiles, lifted out of the dark on the night side.
export const overlayFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vec4 t = texture2D(uDay, vUv);
    float lightF = 0.55 + 0.45 * smoothstep(-0.1, 0.3, dot(normalize(vNormalW), uSunDir));
    gl_FragColor = vec4(t.rgb * lightF, t.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

export const cloudVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const cloudFragment = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    float c = texture2D(uClouds, vUv).r;
    float a = smoothstep(0.18, 0.85, c) * uOpacity;
    float ndl = dot(normalize(vNormalW), uSunDir);
    float light = smoothstep(-0.12, 0.35, ndl);
    vec3 col = mix(vec3(0.02, 0.03, 0.06), vec3(1.0), light);
    col = mix(col, vec3(1.0, 0.6, 0.35), exp(-pow(ndl * 7.0, 2.0)) * 0.4);
    gl_FragColor = vec4(col, a * (0.25 + 0.75 * light));
  }
`;

// Atmosphere shell. Glow depends on how close the view ray passes to the planet
// (its impact parameter), so it hugs the limb at any distance or zoom level.
export const atmosphereVertex = /* glsl */ `
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uInner;
  uniform float uOuter;
  varying vec3 vPosW;
  void main() {
    vec3 rd = normalize(vPosW - cameraPosition);
    float tca = -dot(cameraPosition, rd);
    vec3 pc = cameraPosition + rd * tca;
    float b = length(pc);
    float h = clamp((b - uInner) / (uOuter - uInner), 0.0, 1.0);
    float glow = exp(-h * 5.5) * (1.0 - h);
    float sunF = smoothstep(-0.35, 0.45, dot(normalize(pc), uSunDir));
    vec3 col = mix(vec3(0.18, 0.38, 1.0), vec3(0.55, 0.78, 1.0), glow);
    float a = glow * (0.12 + 0.88 * sunF);
    gl_FragColor = vec4(col * a * 1.35, a);
  }
`;

export const hotspotVertex = /* glsl */ `
  attribute float aIntensity;
  attribute float aSeed;
  attribute float aRegion;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uSelected;
  uniform float uAlpha;
  varying float vI;
  varying float vAlpha;
  void main() {
    float D = length(cameraPosition);
    float facing = dot(normalize(position), cameraPosition / D);
    float vis = smoothstep(1.0 / D - 0.004, 1.0 / D + 0.012, facing);
    float sel = (uSelected < 0.0 || abs(aRegion - uSelected) < 0.5) ? 1.0 : 0.3;
    vI = aIntensity;
    vAlpha = vis * sel * uAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float flicker = 0.82 + 0.18 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 40.0);
    gl_PointSize = uSize * (0.65 + aIntensity * 1.2) * flicker * uPixelRatio * step(0.001, vis);
  }
`;

export const hotspotFragment = /* glsl */ `
  varying float vI;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.42, 0.0, d);
    float halo = exp(-d * d * 4.5) * (1.0 - d);
    vec3 col = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.78, 0.25), vI);
    col = mix(col, vec3(1.0, 0.96, 0.82), core * 0.65);
    gl_FragColor = vec4(col, (core * 0.95 + halo * 0.6) * vAlpha);
  }
`;

export const heatVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const heatFragment = /* glsl */ `
  uniform sampler2D uHeat;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uHeat, vUv);
    gl_FragColor = vec4(t.rgb, t.a * uOpacity);
  }
`;

export const ringFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    // vUv.x runs around the ring, vUv.y across its width.
    float edge = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.65, vUv.y);
    float dash = 0.65 + 0.35 * step(0.5, fract(vUv.x * 48.0 - uTime * 0.6));
    gl_FragColor = vec4(uColor, edge * dash * 0.95);
  }
`;
