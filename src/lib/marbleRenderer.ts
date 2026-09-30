import * as THREE from 'three';

/**
 * Shared WebGL renderer + camera framing for bowl & flying marbles.
 * Clamped up to 2.5 DPR to guarantee crystal-clear sharpness on 1080p/1440p
 * high-DPI Android OLED screens without GPU memory exhaustion.
 */
export const MARBLE_CANVAS_DPR: [number, number] = [1, 2.5];

/** WebGLRenderer constructor args: highp precision, high-performance, and native antialiasing. */
export const MARBLE_CANVAS_GL = {
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance' as const,
  precision: 'highp' as const,
};

/** Bowl overview camera (looks at origin). */
export const BOWL_CAMERA = {
  position: [0, 2.5, 4.5] as [number, number, number],
  fov: 45,
};

/**
 * Same viewing angle as the bowl camera, scaled so a unit sphere fills the
 * tiny flight viewport — keeps specular/env response identical.
 * Bowl direction (0, 2.5, 4.5) → unit * ~2.15 ≈ (0, 1.04, 1.88).
 */
export const FLIGHT_CAMERA = {
  position: [0, 1.04, 1.88] as [number, number, number],
  fov: 45,
};

/** Slightly conservative exposure so speculars don't crush diffuse hue. */
export const MARBLE_TONE_EXPOSURE = 0.92;

/** Shared flight → bowl handoff (screen + world). */
export const FLIGHT_DURATION_MS = 520;
/** Rim aperture Y in bowl world space (spawn at handoff). */
export const HANDOFF_RIM_Y = 0.72;
/** Fallback world-space handoff velocity if flight sample fails. */
export const HANDOFF_DEFAULT_VEL = { vx: 0, vy: -3.4, vz: 0 } as const;
/**
 * Convert CSS px/s → bowl world units/s.
 * Screen Y+ is down; bowl Y+ is up — callers flip the Y sign.
 */
export const HANDOFF_PX_TO_WORLD = 0.0046;

/**
 * Shared lighting rig with calibrated specular response
 * so Normal Blue (#2563eb) and Light Blue (#60a5fa) stay distinguishable.
 */
export const MARBLE_LIGHTS = {
  ambient: 0.25,
  key: 0.65,
  fill: 0.25,
  rim: 0.2,
  /** PMREM / RoomEnvironment contribution on MeshPhysicalMaterial. */
  environmentIntensity: 0.6,
} as const;

/** Apply after Canvas mounts — locks tone mapping / color space / exposure and scales DPR dynamically. */
export function configureMarbleRenderer(gl: THREE.WebGLRenderer): void {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = MARBLE_TONE_EXPOSURE;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  if (typeof window !== 'undefined') {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gl.setPixelRatio(dpr);
  }
}

/**
 * RigidMarble / FlyingSphereMesh — sharp clearcoat highlight with crystal reflection without glare.
 */
export const MARBLE_PHYSICAL_MATERIAL = {
  roughness: 0.12,
  metalness: 0.15,
  clearcoat: 0.8,
  clearcoatRoughness: 0.15,
} as const;
