import * as THREE from 'three';

/**
 * Shared WebGL renderer + camera framing for bowl & flying marbles.
 * Both canvases MUST use these so tone-mapped color output matches at handoff.
 */
export const MARBLE_CANVAS_DPR: [number, number] = [1, 1.5];

/** WebGLRenderer constructor args only (tone mapping applied in configureMarbleRenderer). */
export const MARBLE_CANVAS_GL = {
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance' as const,
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
 * Shared lighting rig (~35% softer than the prior 0.4 / 1.1 / 0.45 / 0.3 setup)
 * so Normal Blue (#2563eb) and Light Blue (#60a5fa) stay distinguishable.
 */
export const MARBLE_LIGHTS = {
  ambient: 0.25,
  key: 0.65,
  fill: 0.25,
  rim: 0.2,
  /** PMREM / RoomEnvironment contribution on MeshPhysicalMaterial. */
  environmentIntensity: 0.4,
} as const;

/** Apply after Canvas mounts — locks tone mapping / color space / exposure. */
export function configureMarbleRenderer(gl: THREE.WebGLRenderer): void {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = MARBLE_TONE_EXPOSURE;
  gl.outputColorSpace = THREE.SRGBColorSpace;
}

/**
 * RigidMarble / FlyingSphereMesh — sharp clearcoat highlight without white-out glare.
 */
export const MARBLE_PHYSICAL_MATERIAL = {
  roughness: 0.15,
  metalness: 0.12,
  clearcoat: 0.6,
  clearcoatRoughness: 0.22,
} as const;
