declare module 'claude-code' {
  interface PluginState {
    'context-canary': {
      canary: {
        alive: boolean
        responses: number
        streak: number
        lastTurnId: string | null
        death: { response: number; at: number; preview: string; turnId: string; lost?: { n: number; heading: string }[] } | null
        lastAutoCompactAt: number | null
        blocked: boolean
        recovery: 'idle' | 'pending' | 'compacting' | 'recovered' | 'skipped' | 'failed' | 'notifyOnly' | 'blocked' | 'interrupted'
        detail: string
      }
    }
  }
}
