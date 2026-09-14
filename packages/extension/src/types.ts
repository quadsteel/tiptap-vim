import { EditorView } from '@tiptap/pm/view'
import { EditorState, Transaction } from '@tiptap/pm/state'
import { Editor } from '@tiptap/core'

export type VimMode = 'normal' | 'insert' | 'visual' | 'visual-line'

export type RegisterType = 'char' | 'line'

export interface RegisterEntry {
  text: string
  type: RegisterType
}

export interface VimState {
  mode: VimMode
  keyBuffer: string
  count: number | null
  pendingOperator: string | null
  operatorCount: number | null
  visualAnchor: number | null
  visualHead: number | null
  desiredColumn: number | null
  pendingFind: 'f' | 'F' | 't' | 'T' | null
  lastFind: { type: 'f' | 'F' | 't' | 'T'; char: string } | null
}

export interface CommandContext {
  editor: Editor
  view: EditorView
  state: EditorState
  dispatch: (tr: Transaction) => void
  vimState: VimState
  updateVimState: (updates: Partial<VimState>) => void
  resetBuffer: () => void
}

export interface MotionRange {
  from: number
  to: number
  lineWise?: boolean
}

export interface VimExtensionStorage {
  mode: VimMode
  keyBuffer: string
  count: number | null
  register: RegisterEntry | null
}
