import { RegisterEntry } from '../types'

class RegisterManager {
  private defaultRegister: RegisterEntry | null = null

  set(entry: RegisterEntry) {
    this.defaultRegister = entry
    // Optionally mirror to system clipboard if in browser
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(entry.text).catch(() => {})
    }
  }

  get(): RegisterEntry | null {
    return this.defaultRegister
  }
}

export const registers = new RegisterManager()
