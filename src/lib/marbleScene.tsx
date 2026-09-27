import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { MARBLE_LIGHTS } from './marbleRenderer';

const envCache = new WeakMap<THREE.WebGLRenderer, { texture: THREE.Texture; refCount: number }>();

/**
 * Shared RoomEnvironment PMREM — cached per WebGL context and deferred after first paint
 * to eliminate main-thread blocking synchronous compilation lag on fresh install.
 */
export function StudioEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    let active = true;
    let localTexture: THREE.Texture | null = null;

    // Check if texture is already cached for this WebGLRenderer context
    const cached = envCache.get(gl);
    if (cached) {
      cached.refCount++;
      localTexture = cached.texture;
      scene.environment = cached.texture;
      scene.environmentIntensity = MARBLE_LIGHTS.environmentIntensity;
    } else {
      // Defer PMREM compilation to microtask/frame after initial paint
      const timer = window.setTimeout(() => {
        if (!active) return;
        try {
          const pmremGenerator = new THREE.PMREMGenerator(gl);
          pmremGenerator.compileEquirectangularShader();
          const room = new RoomEnvironment();
          const envTexture = pmremGenerator.fromScene(room, 0.04).texture;
          room.dispose();
          pmremGenerator.dispose();

          if (!active) {
            envTexture.dispose();
            return;
          }

          envCache.set(gl, { texture: envTexture, refCount: 1 });
          localTexture = envTexture;
          scene.environment = envTexture;
          scene.environmentIntensity = MARBLE_LIGHTS.environmentIntensity;
        } catch (err) {
          console.warn('Deferred PMREM generation error:', err);
        }
      }, 50);

      return () => {
        active = false;
        window.clearTimeout(timer);
        scene.environment = null;
        scene.environmentIntensity = 1;
        if (localTexture) {
          const entry = envCache.get(gl);
          if (entry) {
            entry.refCount--;
            if (entry.refCount <= 0) {
              entry.texture.dispose();
              envCache.delete(gl);
            }
          }
        }
      };
    }

    return () => {
      active = false;
      scene.environment = null;
      scene.environmentIntensity = 1;
      if (localTexture) {
        const entry = envCache.get(gl);
        if (entry) {
          entry.refCount--;
          if (entry.refCount <= 0) {
            entry.texture.dispose();
            envCache.delete(gl);
          }
        }
      }
    };
  }, [gl, scene]);

  return null;
}

/** Shared light rig — same positions, colors, and intensities in both canvases. */
export function MarbleLightRig({ castShadow = false }: { castShadow?: boolean }) {
  return (
    <>
      <ambientLight intensity={MARBLE_LIGHTS.ambient} />
      <directionalLight
        position={[2, 5, 3]}
        intensity={MARBLE_LIGHTS.key}
        color="#ffffff"
        castShadow={castShadow}
        shadow-mapSize-width={castShadow ? 512 : undefined}
        shadow-mapSize-height={castShadow ? 512 : undefined}
        shadow-camera-near={castShadow ? 1 : undefined}
        shadow-camera-far={castShadow ? 12 : undefined}
        shadow-camera-left={castShadow ? -2 : undefined}
        shadow-camera-right={castShadow ? 2 : undefined}
        shadow-camera-top={castShadow ? 2 : undefined}
        shadow-camera-bottom={castShadow ? -2 : undefined}
        shadow-bias={castShadow ? -0.001 : undefined}
        shadow-normalBias={castShadow ? 0.02 : undefined}
      />
      <directionalLight position={[-3, 3, 2]} intensity={MARBLE_LIGHTS.fill} color="#ffffff" />
      <directionalLight position={[0, 4, -3]} intensity={MARBLE_LIGHTS.rim} color="#f1f5f9" />
    </>
  );
}
