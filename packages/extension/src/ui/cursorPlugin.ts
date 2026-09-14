import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { vimPluginKey } from '../state/vimState'

export const vimCursorPluginKey = new PluginKey('vim-cursor-plugin')

export function createCursorPlugin(): Plugin {
  return new Plugin({
    key: vimCursorPluginKey,
    props: {
      decorations(state) {
        const vimState = vimPluginKey.getState(state)
        if (!vimState || vimState.mode !== 'normal') {
          return DecorationSet.empty
        }

        const { selection } = state
        if (!selection.empty) {
          return DecorationSet.empty
        }

        const pos = selection.from
        const $pos = state.doc.resolve(pos)

        // Safety: If position is outside a textblock, render widget cursor without error
        if (!$pos.parent.isTextblock) {
          const widget = Decoration.widget(pos, () => {
            const span = document.createElement('span')
            span.className = 'vim-cursor-block vim-cursor-empty'
            span.innerHTML = '&nbsp;'
            return span
          })
          return DecorationSet.create(state.doc, [widget])
        }

        const blockEnd = $pos.end()

        // If there is text under the cursor
        if (pos < blockEnd) {
          try {
            const dec = Decoration.inline(pos, pos + 1, {
              class: 'vim-cursor-block',
            })
            return DecorationSet.create(state.doc, [dec])
          } catch {
            // If inline decoration cannot span (e.g. edge boundary), fallback to widget
          }
        }

        // Empty block or end of block widget
        const widget = Decoration.widget(pos, () => {
          const span = document.createElement('span')
          span.className = 'vim-cursor-block vim-cursor-empty'
          span.innerHTML = '&nbsp;'
          return span
        })

        return DecorationSet.create(state.doc, [widget])
      },
    },
  })
}
