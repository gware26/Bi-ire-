import { Component, type ReactNode } from 'react'
import { ArrowClockwise, Warning } from '@phosphor-icons/react'

interface State {
  error: Error | null
}

/** Shows the error and a way back instead of a blank page when a screen crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Screen crashed:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 bg-background p-6 text-foreground">
        <h1 className="flex items-center gap-3 text-4xl font-bold text-destructive">
          <Warning aria-hidden="true" weight="bold" className="size-10 shrink-0" />
          Something went wrong
        </h1>
        <p role="alert" className="text-2xl">
          This screen crashed. Your recordings and notes are saved.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-muted p-4 text-base whitespace-pre-wrap text-muted-foreground">
          {this.state.error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-accent p-6 font-display text-3xl font-bold text-on-accent transition-[filter] duration-200 hover:brightness-110"
        >
          <ArrowClockwise aria-hidden="true" weight="bold" className="size-8" />
          Reload Biʼire
        </button>
      </main>
    )
  }
}
