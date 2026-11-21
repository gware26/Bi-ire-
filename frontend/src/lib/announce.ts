// One persistent live region for status messages (WCAG 4.1.3). Regions created on the fly are
// often missed by screen readers, so this element is mounted once and reused.

let region: HTMLElement | null = null

function getRegion() {
  if (!region) {
    region = document.createElement('div')
    region.setAttribute('role', 'status')
    region.setAttribute('aria-live', 'polite')
    region.className = 'sr-only'
    document.body.appendChild(region)
  }
  return region
}

export function announce(message: string) {
  const el = getRegion()
  el.textContent = ''
  window.setTimeout(() => (el.textContent = message), 50)
}
