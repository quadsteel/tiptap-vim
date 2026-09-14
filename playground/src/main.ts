import './style.css'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Vim } from 'tiptap-extension-vim'

const defaultContent = `
<h1>Welcome to Vim for Tiptap</h1>
<p>This is a native <strong>Vim modal editing extension</strong> for rich text editing with Tiptap and ProseMirror.</p>
<p>Try standard motions like <code>h</code>, <code>j</code>, <code>k</code>, <code>l</code>, <code>w</code>, <code>b</code>, <code>e</code>, <code>0</code>, and <code>$</code>.</p>
<p>Test operators such as <code>dw</code>, <code>dd</code>, <code>cw</code>, <code>cc</code>, <code>yy</code>, and <code>p</code> to paste.</p>
<p>Press <code>v</code> for character visual mode or <code>V</code> for line visual mode, then expand your selection and hit <code>d</code> or <code>c</code>.</p>
<p>To enter Insert mode, use <code>i</code>, <code>a</code>, <code>I</code>, <code>A</code>, <code>o</code>, or <code>O</code>. Hit <code>Esc</code> or <code>Ctrl-[</code> to return to Normal mode.</p>
`

const editorContainer = document.getElementById('editor-container')!
const modeBadge = document.getElementById('mode-badge')!
const keyBufferSpan = document.getElementById('key-buffer')!
const registerInfoSpan = document.getElementById('register-info')!
const posInfoSpan = document.getElementById('pos-info')!
const docStatsSpan = document.getElementById('doc-stats')!

const editor = new Editor({
  element: editorContainer,
  extensions: [
    StarterKit,
    Vim.configure({
      defaultMode: 'normal',
    }),
  ],
  content: defaultContent,
  autofocus: 'start',
  onTransaction({ editor }) {
    updateStatus(editor)
  },
  onSelectionUpdate({ editor }) {
    updateStatus(editor)
  },
})

function updateStatus(editor: Editor) {
  const vimStorage = editor.storage.vim
  const mode = vimStorage?.mode ?? 'normal'
  const keyBuffer = vimStorage?.keyBuffer ?? ''
  const register = vimStorage?.register

  // Update Mode Badge
  modeBadge.textContent = `-- ${mode.toUpperCase().replace('-', ' ')} --`
  modeBadge.className = `mode-badge mode-${mode}`

  // Update Key Buffer
  keyBufferSpan.textContent = keyBuffer ? `[${keyBuffer}]` : ''

  // Update Register info
  if (register && register.text) {
    const preview = register.text.replace(/\n/g, '\\n').slice(0, 20)
    registerInfoSpan.textContent = `yank: "${preview}${register.text.length > 20 ? '...' : ''}"`
  } else {
    registerInfoSpan.textContent = ''
  }

  // Calculate Line and Column
  const { state } = editor
  const pos = state.selection.from
  const $pos = state.doc.resolve(pos)

  let lineNumber = 1
  let colNumber = 1

  if ($pos.parent.isTextblock) {
    state.doc.nodesBetween(0, $pos.start() - 1, (node) => {
      if (node.isTextblock) {
        lineNumber++
      }
    })
    colNumber = $pos.parentOffset + 1
  } else {
    let blockCount = 0
    state.doc.descendants((node, p) => {
      if (node.isTextblock) {
        blockCount++
        if (p < pos) {
          lineNumber = blockCount
        }
      }
    })
    colNumber = 1
  }

  posInfoSpan.textContent = `Ln ${lineNumber}, Col ${colNumber}`

  // Doc stats
  let totalBlocks = 0
  state.doc.descendants((node) => {
    if (node.isTextblock) totalBlocks++
  })
  docStatsSpan.textContent = `${totalBlocks} blocks`
}

// Initial status render
updateStatus(editor)

// Buttons
document.getElementById('btn-reset')?.addEventListener('click', () => {
  editor.commands.setContent(defaultContent)
  editor.commands.focus()
  updateStatus(editor)
})

document.getElementById('btn-focus')?.addEventListener('click', () => {
  editor.commands.focus()
})
