/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Perf-3 + Perf-4: Vendor-Chunk-Aufteilung fuer Browser-Cache.
 *
 * Ziel: vendor-Code (three/leaflet/dockview/react/radix) selten
 * geaendert → eigener Chunk → Browser-Cache-Hit-Rate steigt ueber
 * App-Deploys.
 *
 * Reihenfolge im if-Block ist relevant:
 *   1. react/jsx-runtime + react-dom MUSS zuerst matched werden,
 *      sonst gruppiert rolldown sie mit dem ersten Vendor (z.B.
 *      dockview), der sie konsumiert → vendor-dockview wird damit
 *      ungewollt in den Initial-Graph gezogen.
 *   2. Danach große Libraries (three/leaflet/dockview/radix).
 */
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (
    id.includes('node_modules/three/') ||
    id.includes('node_modules/@react-three/')
  ) {
    return 'vendor-three';
  }
  if (
    id.includes('node_modules/leaflet/') ||
    id.includes('node_modules/leaflet.markercluster/')
  ) {
    return 'vendor-leaflet';
  }
  // dockview NICHT manuell chunken — rolldown bundelt es dann
  // direkt in den WorkspacePage-Chunk (oder verwandte lazy Chunks),
  // statt ein vendor-dockview-Chunk zu erstellen, das ungewollt
  // react-jsx-runtime-Helfer mitnimmt und damit ins initial-Graph
  // gezogen wird.
  if (id.includes('node_modules/@radix-ui/')) {
    return 'vendor-radix';
  }
  if (
    id.includes('node_modules/react/') ||
    id.includes('node_modules/react-dom/') ||
    id.includes('node_modules/react-router-dom/') ||
    id.includes('node_modules/react-router/') ||
    id.includes('node_modules/scheduler/')
  ) {
    return 'vendor-react';
  }
  return undefined;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
    // Perf-3: 500 kB Default-Warning ist hier nicht praxisrelevant —
    // vendor-three + vendor-leaflet sind absichtlich gross und gut
    // gecached. App-Chunks bleiben unter dem neuen Limit.
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // globals:true aktiviert auto-cleanup von @testing-library/react
    // (afterEach Hook wird global registriert, kein leakage zw. Tests).
    globals: true,
    // e2e/ ist Playwright-Test-Dir (eigener Runner via `npm run e2e`),
    // NICHT Vitest. Sonst versucht Vitest die Specs zu laufen und
    // crasht mit "Playwright Test did not expect test.describe()".
    exclude: ['node_modules', 'dist', 'e2e'],
  },
})
