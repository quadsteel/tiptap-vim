# tiptap-vim

A modal Vim keybindings extension for [Tiptap](https://tiptap.dev/) and ProseMirror.

## Installation

```bash
npm install tiptap-extension-vim
```

```bash
# Or with pnpm / yarn
pnpm add tiptap-extension-vim
yarn add tiptap-extension-vim
```

> **Important**: You must import the extension's stylesheet to enable the Vim block cursor and suppress the default browser text caret:
> ```ts
> import 'tiptap-extension-vim/style.css'
> ```

---

## Quickstart

### Vanilla JavaScript / TypeScript

```ts
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Vim } from 'tiptap-extension-vim'

// 1. Import cursor styles
import 'tiptap-extension-vim/style.css'

// 2. Initialize Tiptap with the Vim extension
const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [
    StarterKit,
    Vim.configure({
      defaultMode: 'normal', // 'normal' | 'insert' (default: 'normal')
    }),
  ],
})
```

### React (`@tiptap/react`)

```tsx
import React, { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Vim } from 'tiptap-extension-vim'

// Import cursor styles
import 'tiptap-extension-vim/style.css'

export function TipTapVimEditor() {
  const [mode, setMode] = useState('normal')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Vim.configure({
        defaultMode: 'normal',
      }),
    ],
    content: '<p>Hello from Vim in Tiptap!</p>',
    onTransaction({ editor }) {
      // Keep UI in sync with active Vim mode
      setMode(editor.storage.vim.mode)
    },
  })

  return (
    <div className="editor-wrapper">
      <div className="status-bar">
        <span className={`badge mode-${mode}`}>-- {mode.toUpperCase()} --</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
```

---

## Status Bar & UI Integration

### Reading Vim State

The extension stores reactive state inside `editor.storage.vim`:

```ts
const {
  mode,       // 'normal' | 'insert' | 'visual' | 'visual-line'
  keyBuffer,  // Pending input keys (e.g. "3", "d", "f")
  count,      // Current parsed count multiplier (e.g. 3)
  register,   // Current yank/cut register object { text, type: 'char' | 'line' }
} = editor.storage.vim
```

To update your UI when the state changes:
- **Vanilla JS**: Listen to `editor.on('transaction', () => ...)` or `editor.on('selectionUpdate', () => ...)`.
- **React**: Update state in `onTransaction` or use `useEditorState`.
- **Vue 3**: `editor.storage.vim.mode` is natively reactive in Vue templates: `{{ editor?.storage.vim.mode }}`.

### Programmatic Mode Switching

You can switch modes programmatically from buttons or commands:

```ts
// Switch to Insert mode
editor.commands.setVimMode('insert')

// Switch back to Normal mode
editor.commands.setVimMode('normal')
```

### Styling with `data-vim-mode`

The extension automatically applies a `data-vim-mode` attribute to the `.ProseMirror` container element. You can style the editor or external indicators purely with CSS:

```css
/* Custom border or glow based on mode */
[data-vim-mode="normal"] {
  border-color: #38bdf8; /* Blue for Normal */
}

[data-vim-mode="insert"] {
  border-color: #4ade80; /* Green for Insert */
}

[data-vim-mode="visual"],
[data-vim-mode="visual-line"] {
  border-color: #fbbf24; /* Amber for Visual */
}

/* Custom cursor color customization */
:root {
  --vim-cursor-bg: #60a5fa;
  --vim-cursor-fg: #0f172a;
}
```

---

## Features & Supported Motions

- **Modes**:
  - `Normal`: Block cursor, modal key navigation and operator execution.
  - `Insert`: Standard typing. Return to normal with `<Esc>`, `Ctrl-[`, or `Ctrl-c`.
  - `Visual`: Character-inclusive selection. Operators (`d`, `c`, `y`) operate on selection.
  - `Visual Line`: Line/block-wise selection spanning whole blocks.
- **Motions**:
  - `h`, `j`, `k`, `l`: Left, down, up, right.
  - `w`, `b`, `e`: Word start, backward word start, word end (crosses block boundaries).
  - `W`, `B`, `E`: Whitespace-delimited WORD navigation.
  - `0`, `^`, `_`, `$`: Line start, first non-blank char, line end.
  - `f{char}`, `F{char}`: Jump forward/back to `{char}` on current line.
  - `t{char}`, `T{char}`: Jump forward/back till `{char}`.
  - `;`, `,`: Repeat last find motion in same/opposite direction.
  - `%`: Jump to matching bracket pair (`()`, `{}`, `[]`).
  - `{`, `}`: Jump backward/forward by paragraph.
  - `gg`, `G`: Jump to start/end of document (or specific line with count e.g. `10gg`).
  - `[count]`: Numeric prefixes supported on motions & operators (e.g. `3w`, `2W`, `5j`, `2dd`, `3fa`).
- **Operators & Actions**:
  - `x`: Delete character under cursor.
  - `r{char}`: Replace character under cursor.
  - `d{motion}` / `dd` / `D`: Delete motion range, current line, or to line end.
  - `c{motion}` / `cc` / `C` / `s` / `S`: Change motion range, line, or char.
  - `y{motion}` / `yy` / `Y`: Yank to register and system clipboard.
  - `p` / `P`: Paste after or before cursor/line.
  - `o` / `O`: Open new line below or above and enter Insert mode.
  - `i` / `a` / `I` / `A`: Insert before/after cursor, at line start (`^`), or at line end (`$`).
  - `u` / `Ctrl-r`: Undo / redo using Tiptap history.

## Repository Structure

This repo is organized as an npm workspaces monorepo:
- `packages/extension`: The core `tiptap-extension-vim` package.
- `playground`: A Vite development environment with a live Vim status bar and cheatsheet.

## Development

Install dependencies:
```bash
npm install
```

Run tests:
```bash
npm test
```

Build packages:
```bash
npm run build
```

Start the interactive playground:
```bash
npm run dev
```

## License

MIT