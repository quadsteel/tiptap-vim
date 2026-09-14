import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { VimMode, VimState, VimExtensionStorage, CommandContext } from './types'
import { vimPluginKey, initialVimState } from './state/vimState'
import { registers } from './state/registers'
import { createCursorPlugin } from './ui/cursorPlugin'
import { handleKeyDown } from './input/keyDispatcher'

export interface VimOptions {
  defaultMode?: VimMode
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vim: {
      /**
       * Set the active Vim mode
       */
      setVimMode: (mode: VimMode) => ReturnType
    }
  }
}

export const Vim = Extension.create<VimOptions, VimExtensionStorage>({
  name: 'vim',

  addOptions() {
    return {
      defaultMode: 'normal',
    }
  },

  addStorage() {
    return {
      mode: this.options.defaultMode ?? 'normal',
      keyBuffer: '',
      count: null,
      register: null,
    }
  },

  addCommands() {
    return {
      setVimMode:
        (mode: VimMode) =>
        ({ editor, tr, dispatch }) => {
          if (dispatch) {
            editor.storage.vim.mode = mode
            editor.view.dom.setAttribute('data-vim-mode', mode)
            tr.setMeta(vimPluginKey, { mode })
            dispatch(tr)
          }
          return true
        },
    }
  },

  onCreate() {
    const defaultMode = this.options.defaultMode ?? 'normal'
    this.storage.mode = defaultMode
    if (this.editor.view && this.editor.view.dom) {
      this.editor.view.dom.setAttribute('data-vim-mode', defaultMode)
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor

    const vimStatePlugin = new Plugin<VimState>({
      key: vimPluginKey,
      state: {
        init: () => ({
          ...initialVimState,
          mode: this.options.defaultMode ?? 'normal',
        }),
        apply: (tr, value) => {
          const meta = tr.getMeta(vimPluginKey)
          if (meta) {
            return { ...value, ...meta }
          }
          return value
        },
      },
      props: {
        handleKeyDown: (view, event) => {
          const currentState = vimPluginKey.getState(view.state) ?? initialVimState

          const updateVimState = (updates: Partial<VimState>) => {
            const newState = { ...currentState, ...updates }
            const tr = view.state.tr.setMeta(vimPluginKey, updates)
            view.dispatch(tr)

            // Sync with editor.storage for UI/Vue/React bindings
            editor.storage.vim.mode = newState.mode
            editor.storage.vim.keyBuffer = newState.keyBuffer
            editor.storage.vim.count = newState.count
            editor.storage.vim.register = registers.get()

            if (updates.mode) {
              view.dom.setAttribute('data-vim-mode', updates.mode)
            }
          }

          const resetBuffer = () => {
            updateVimState({
              keyBuffer: '',
              count: null,
              pendingOperator: null,
              operatorCount: null,
              pendingFind: null,
            })
          }

          const ctx: CommandContext = {
            editor,
            view,
            state: view.state,
            dispatch: (tr) => view.dispatch(tr),
            vimState: currentState,
            updateVimState,
            resetBuffer,
          }

          return handleKeyDown(ctx, event)
        },

        handleTextInput: (view) => {
          const currentState = vimPluginKey.getState(view.state)
          // In normal and visual modes, prevent direct text input
          if (currentState && currentState.mode !== 'insert') {
            return true
          }
          return false
        },
      },
    })

    return [vimStatePlugin, createCursorPlugin()]
  },
})
