import { PluginKey } from '@tiptap/pm/state'
import { VimState } from '../types'

export const vimPluginKey = new PluginKey<VimState>('tiptap-vim')

export const initialVimState: VimState = {
  mode: 'normal',
  keyBuffer: '',
  count: null,
  pendingOperator: null,
  operatorCount: null,
  visualAnchor: null,
  visualHead: null,
  desiredColumn: null,
  pendingFind: null,
  lastFind: null,
}
