# tiptap-vim

A modal Vim keybindings extension for [Tiptap](https://tiptap.dev/) and ProseMirror.

## Features

- **Modes**: Normal, Insert, Visual (character-wise), and Visual Line (block-wise) modes.
- **Vim Block Cursor**: Native-feeling block cursor via ProseMirror decorations with suppressed browser caret in normal/visual modes.
- **Motions**:
  - Character & line boundaries: `h`, `l`, `0`, `^`, `_`, `$`
  - Word navigation: `w`, `b`, `e` (alphanumeric/symbol boundaries) and `W`, `B`, `E` (whitespace-delimited WORDs)
  - In-line character search: `f{char}`, `F{char}` (find forward/back), `t{char}`, `T{char}` (till forward/back), `;` (repeat), `,` (reverse repeat)
  - Bracket pair matching: `%` (jumps between matching `()`, `{}`, `[]`)
  - Vertical & paragraph navigation: `j`, `k` (handles multi-line wrapped text and inter-block jumping), `{`, `}` (paragraph jump up/down)
  - Document jumps: `gg`, `G`, and line numbers (e.g., `5gg`)
  - Numeric repetition counts: `3w`, `5j`, `2dd`, `3fa`
- **Operators & Actions**:
  - Deletion: `x`, `r<char>`, `d{motion}`, `dd`, `D`
  - Change: `c{motion}`, `cc`, `C`, `s`, `S`
  - Yank & Paste: `y{motion}`, `yy`, `p`, `P` (with internal register and clipboard sync)
  - Insert transitions: `i`, `a`, `I`, `A`, `o`, `O`
  - History: `u` (undo), `Ctrl-r` (redo)
- **Visual Mode**: Character-inclusive selection ranges with operator execution (`d`, `c`, `y`).
- **Reactive State**: Exposes `editor.storage.vim` (`mode`, `keyBuffer`, `register`, `count`) for status bar integrations.

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