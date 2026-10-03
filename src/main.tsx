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
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const key = 'nemesis.reloadedAfterPreloadError'
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch {
    /* ignore */
  }
  location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
