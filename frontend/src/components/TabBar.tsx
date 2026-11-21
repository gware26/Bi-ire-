import type { Icon } from '@phosphor-icons/react'

export interface TabDef<T extends string> {
  id: T
  label: string
  icon: Icon
}

interface Props<T extends string> {
  label: string
  tabs: TabDef<T>[]
  current: T
  onChange: (id: T) => void
}

/** Fixed bottom navigation; the current tab is exposed with aria-current. Say the tab name to switch by voice. */
export function TabBar<T extends string>({ label, tabs, current, onChange }: Props<T>) {
  const voiceHint = `Say ${tabs.map((t) => `"${t.label}"`).join(', ')} to switch tabs`
  return (
    <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-border bg-card">
      <p className="sr-only">{voiceHint}</p>
      <ul className="mx-auto grid max-w-5xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ id, label: tabLabel, icon: TabIcon }) => {
          const on = current === id
          return (
            <li key={id}>
              <button
                type="button"
                aria-current={on ? 'page' : undefined}
                aria-label={`${tabLabel}${on ? ', current page' : ''}. Say "${tabLabel}"`}
                onClick={() => onChange(id)}
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-sm font-bold transition-colors duration-200 sm:text-base ${
                  on ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TabIcon aria-hidden="true" weight={on ? 'fill' : 'bold'} className="size-7" />
                {tabLabel}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
