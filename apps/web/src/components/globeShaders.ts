// FireScope's day/night, cloud and atmosphere layers informed this small preview renderer.
// The preview keeps one local Earth texture at every zoom level and uses fixed demo lighting.
export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosition = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uWater;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float light = dot(normal, uSun);
    float dayMix = smoothstep(-0.16, 0.22, light);
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    float water = texture2D(uWater, vUv).r;
    vec3 daylight = day * (0.22 + 0.9 * max(light, 0.0));
    float twilight = exp(-pow(light * 7.0, 2.0));
    daylight += day * vec3(0.34, 0.16, 0.06) * twilight;
    vec3 reflected = normalize(uSun + viewDir);
    float glint = pow(max(dot(normal, reflected), 0.0), 64.0) * water * dayMix;
    daylight += vec3(0.10, 0.16, 0.18) * glint;
    vec3 color = mix(night * 2.0 + day * 0.055, daylight, dayMix);
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    color += vec3(0.08, 0.3, 0.38) * rim * (0.28 + dayMix * 0.72);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

export const cloudFragment = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    float cover = texture2D(uClouds, vUv).r;
    float light = smoothstep(-0.2, 0.45, dot(normalize(vNormal), uSun));
    float alpha = smoothstep(0.23, 0.83, cover) * (0.05 + light * 0.22);
    gl_FragColor = vec4(mix(vec3(0.32, 0.43, 0.52), vec3(0.91, 0.96, 0.98), light), alpha);
  }
`

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vPosition;
  void main() {
    vec3 ray = normalize(vPosition - cameraPosition);
    float nearest = length(cameraPosition + ray * max(0.0, -dot(cameraPosition, ray)));
    float glow = exp(-clamp((nearest - 1.0) / 0.08, 0.0, 1.0) * 5.0);
    float daySide = smoothstep(-0.4, 0.45, dot(normalize(vPosition), uSun));
    float alpha = glow * (0.05 + daySide * 0.24);
    gl_FragColor = vec4(vec3(0.24, 0.53, 0.72) * alpha, alpha);
  }
`
