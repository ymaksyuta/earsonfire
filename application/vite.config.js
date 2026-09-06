import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Baked in at build time so the running app can show "which commit is
// this" on the Selection screen — see src/core/buildInfo.js. Falls back
// to 'unknown' rather than failing the build if .git isn't available
// (e.g. a source-only deploy with no git history).
function getCommitInfo() {
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim()
    const time = execSync('git log -1 --format=%cI').toString().trim()
    return { hash, time }
  } catch {
    return { hash: 'unknown', time: '' }
  }
}

const commit = getCommitInfo()

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commit.hash),
    __COMMIT_TIME__: JSON.stringify(commit.time)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Ears on Fire',
        short_name: 'Ears on Fire',
        description: 'MIDI-based fingering training game',
        theme_color: '#14171c',
        background_color: '#14171c',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // pre-cache everything the build emits so the app boots with no network
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Without these, a new service worker installs but sits in a
        // "waiting" state until every open tab of the app is fully
        // closed — on a phone that's rare, so the app can look stuck
        // on an old build indefinitely even with a network connection.
        skipWaiting: true, // activate the new service worker as soon as it's installed
        clientsClaim: true, // ...and immediately take control of any already-open tabs
        cleanupOutdatedCaches: true // drop precached assets left over from the previous version
      }
    })
  ]
})
