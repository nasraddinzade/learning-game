import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })

// After a deploy the page may still reference chunks whose hashes are gone from the server
// (the old page under a new service worker). Vite reports that as a preload error: reload once
// to pick up the fresh index.html instead of hanging on the loading screen.
let unloading = false
window.addEventListener('pagehide', () => {
  unloading = true
})
window.addEventListener('beforeunload', () => {
  unloading = true
})
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  // A navigation away aborts pending chunk loads too; that is not a stale page.
  if (unloading || document.visibilityState === 'hidden') return
  const key = 'nemesis.reloadedAfterPreloadError'
  try {
    if (sessionStorage.getItem(key)) return
  } catch {
    /* ignore */
  }
  // Give a navigation that is already under way a moment to announce itself before reloading.
  setTimeout(() => {
    if (unloading || document.visibilityState === 'hidden') return
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      /* ignore */
    }
    location.reload()
  }, 800)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
