import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Clean chunking strategy: isolates Supabase & Three.js 3D runtime from core UI runtime
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            // Keep Supabase isolated — large and not needed for first paint gestures.
            if (id.includes('@supabase')) return 'supabase';
            // Three.js and 3D rendering chunk
            if (id.includes('three') || id.includes('@react-three')) {
              return 'three-bundle';
            }
            // Core interactive UI → single chunk for fast one-shot parse on device.
            if (
              id.includes('motion') ||
              id.includes('framer-motion') ||
              id.includes('lucide-react') ||
              id.includes('react-dom') ||
              id.includes('/react/') ||
              id.includes('\\react\\') ||
              id.includes('/scheduler/') ||
              id.includes('@capacitor')
            ) {
              return 'app-runtime';
            }
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/*.apk'] },
    },
  };
});
