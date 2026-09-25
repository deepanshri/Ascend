import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { MARBLE_LIGHTS } from './marbleRenderer';

/**
 * Shared RoomEnvironment PMREM — must be identical in Bowl + FlyingPieceOverlay
 * so specular / env response matches 1:1 at handoff.
 */
export function StudioEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    pmremGenerator.compileEquirectangularShader();
    const room = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(room, 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = MARBLE_LIGHTS.environmentIntensity;
    room.dispose();
    pmremGenerator.dispose();

    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      envTexture.dispose();
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
