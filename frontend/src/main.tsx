import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

if (import.meta.env.DEV) {
  // Run `await window.a11y()` in the browser console for a WCAG 2.2 AA scan of the current screen.
  import('axe-core').then(({ default: axe }) => {
    Object.assign(window, {
      a11y: async () => {
        const r = await axe.run(document, {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
        })
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }))
      },
    })
  })
}

// No StrictMode: its double-run effects would open two recording sessions in development.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
