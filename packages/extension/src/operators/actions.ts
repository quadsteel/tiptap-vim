import { TextSelection } from '@tiptap/pm/state'
import { CommandContext } from '../types'
import { registers } from '../state/registers'
import { moveToFirstNonWhitespace } from '../motions/charMotions'

/**
 * Delete character under cursor (x)
 */
export function deleteChar(ctx: CommandContext, count = 1) {
  const { state, dispatch, resetBuffer } = ctx
  const { selection } = state
  const pos = selection.from
  const $pos = state.doc.resolve(pos)
  const blockEnd = $pos.end()

  if (pos >= blockEnd) {
    resetBuffer()
    return
  }

  const endPos = Math.min(blockEnd, pos + count)
  const deletedText = state.doc.textBetween(pos, endPos)
  registers.set({ text: deletedText, type: 'char' })

  const tr = state.tr.delete(pos, endPos)

  // Clamp cursor in normal mode
  const new$pos = tr.doc.resolve(pos)
  const newBlockEnd = new$pos.end()
  const newPos = Math.min(Math.max(new$pos.start(), newBlockEnd - 1), pos)

  tr.setSelection(TextSelection.create(tr.doc, Math.max(new$pos.start(), newPos)))
  dispatch(tr)
  resetBuffer()
}

/**
 * Delete current line/block (dd)
 */
export function deleteLine(ctx: CommandContext, count = 1) {
  const { state, dispatch, resetBuffer } = ctx
  const pos = state.selection.from
  const $pos = state.doc.resolve(pos)

  // Determine line range across 'count' blocks
  let startBefore = $pos.before()
  let endAfter = $pos.after()
  let deletedText = $pos.parent.textContent + '\n'

  let currentBlockEnd = endAfter
  for (let i = 1; i < count; i++) {
    if (currentBlockEnd < state.doc.content.size) {
      const $next = state.doc.resolve(currentBlockEnd)
      deletedText += $next.parent.textContent + '\n'
      endAfter = $next.after()
      currentBlockEnd = endAfter
    }
  }

  registers.set({ text: deletedText, type: 'line' })

  // If entire doc would be deleted, just empty the current block
  if (startBefore === 0 && endAfter >= state.doc.content.size) {
    const tr = state.tr.delete($pos.start(), $pos.end())
    tr.setSelection(TextSelection.create(tr.doc, $pos.start()))
    dispatch(tr)
    resetBuffer()
    return
  }

  const tr = state.tr.delete(startBefore, endAfter)
  // Ensure cursor stays valid
  const safePos = Math.min(startBefore + 1, tr.doc.content.size - 1)
  const safe$pos = tr.doc.resolve(Math.max(0, safePos))
  const targetPos = safe$pos.parent.isTextblock ? safe$pos.start() : safePos
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, targetPos))))
  dispatch(tr)
  resetBuffer()
}

/**
 * Delete motion range (d{motion})
 */
export function deleteRange(ctx: CommandContext, from: number, to: number, lineWise = false) {
  const { state, dispatch, resetBuffer } = ctx
  const start = Math.min(from, to)
  const end = Math.max(from, to)

  if (start === end) {
    resetBuffer()
    return
  }

  const deletedText = state.doc.textBetween(start, end)
  registers.set({ text: deletedText, type: lineWise ? 'line' : 'char' })

  const tr = state.tr.delete(start, end)
  const $new = tr.doc.resolve(Math.min(start, tr.doc.content.size))
  const newPos = Math.min(Math.max($new.start(), $new.end() - 1), start)

  tr.setSelection(TextSelection.create(tr.doc, Math.max($new.start(), newPos)))
  dispatch(tr)
  resetBuffer()
}

/**
 * Change current line/block (cc)
 */
export function changeLine(ctx: CommandContext) {
  const { state, dispatch, updateVimState, resetBuffer } = ctx
  const $pos = state.selection.$from
  const blockStart = $pos.start()
  const blockEnd = $pos.end()

  const text = $pos.parent.textContent + '\n'
  registers.set({ text, type: 'line' })

  const tr = state.tr.delete(blockStart, blockEnd)
  tr.setSelection(TextSelection.create(tr.doc, blockStart))
  dispatch(tr)

  updateVimState({ mode: 'insert' })
  resetBuffer()
}

/**
 * Change motion range (c{motion})
 */
export function changeRange(ctx: CommandContext, from: number, to: number) {
  const { state, dispatch, updateVimState, resetBuffer } = ctx
  const start = Math.min(from, to)
  const end = Math.max(from, to)

  const deletedText = state.doc.textBetween(start, end)
  registers.set({ text: deletedText, type: 'char' })

  const tr = state.tr.delete(start, end)
  tr.setSelection(TextSelection.create(tr.doc, start))
  dispatch(tr)

  updateVimState({ mode: 'insert' })
  resetBuffer()
}

/**
 * Yank line (yy)
 */
export function yankLine(ctx: CommandContext, count = 1) {
  const { state, resetBuffer } = ctx
  const $pos = state.selection.$from

  let text = $pos.parent.textContent + '\n'
  let currentAfter = $pos.after()

  for (let i = 1; i < count; i++) {
    if (currentAfter < state.doc.content.size) {
      const $next = state.doc.resolve(currentAfter)
      text += $next.parent.textContent + '\n'
      currentAfter = $next.after()
    }
  }

  registers.set({ text, type: 'line' })
  resetBuffer()
}

/**
 * Yank motion range (y{motion})
 */
export function yankRange(ctx: CommandContext, from: number, to: number, lineWise = false) {
  const { state, resetBuffer } = ctx
  const start = Math.min(from, to)
  const end = Math.max(from, to)

  const text = state.doc.textBetween(start, end)
  registers.set({ text, type: lineWise ? 'line' : 'char' })
  resetBuffer()
}

/**
 * Put / Paste after (p) or before (P)
 */
export function put(ctx: CommandContext, before = false) {
  const { state, dispatch, resetBuffer } = ctx
  const entry = registers.get()
  if (!entry) {
    resetBuffer()
    return
  }

  const $pos = state.selection.$from
  const tr = state.tr

  if (entry.type === 'line') {
    // Insert block above or below
    const insertPos = before ? $pos.before() : $pos.after()
    const cleanLines = entry.text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')

    const nodesToInsert = cleanLines.map(line =>
      state.schema.nodes.paragraph.create(null, line.length > 0 ? state.schema.text(line) : undefined)
    )

    tr.insert(insertPos, nodesToInsert)
    // Position cursor in the first inserted paragraph
    const targetPos = insertPos + 1
    tr.setSelection(TextSelection.create(tr.doc, targetPos))
  } else {
    // Character paste
    const insertPos = before ? state.selection.from : Math.min($pos.end(), state.selection.from + 1)
    tr.insertText(entry.text, insertPos)
    const endPos = insertPos + entry.text.length - 1
    tr.setSelection(TextSelection.create(tr.doc, Math.max(insertPos, endPos)))
  }

  dispatch(tr)
  resetBuffer()
}

/**
 * Open new line below (o) and enter insert mode
 */
export function openBelow(ctx: CommandContext) {
  const { state, dispatch, updateVimState, resetBuffer } = ctx
  const $pos = state.selection.$from
  const targetPos = $pos.after()

  const p = state.schema.nodes.paragraph.create()
  const tr = state.tr.insert(targetPos, p)
  tr.setSelection(TextSelection.create(tr.doc, targetPos + 1))
  dispatch(tr)

  updateVimState({ mode: 'insert' })
  resetBuffer()
}

/**
 * Open new line above (O) and enter insert mode
 */
export function openAbove(ctx: CommandContext) {
  const { state, dispatch, updateVimState, resetBuffer } = ctx
  const $pos = state.selection.$from
  const targetPos = $pos.before()

  const p = state.schema.nodes.paragraph.create()
  const tr = state.tr.insert(targetPos, p)
  tr.setSelection(TextSelection.create(tr.doc, targetPos + 1))
  dispatch(tr)

  updateVimState({ mode: 'insert' })
  resetBuffer()
}

/**
 * Enter insert mode variations
 */
export function enterInsert(ctx: CommandContext, variation: 'i' | 'a' | 'I' | 'A') {
  const { state, dispatch, updateVimState, resetBuffer } = ctx
  const $pos = state.selection.$from
  let targetPos = state.selection.from

  if (variation === 'a') {
    if (targetPos < $pos.end()) {
      targetPos++
    }
  } else if (variation === 'I') {
    targetPos = moveToFirstNonWhitespace(state, targetPos)
  } else if (variation === 'A') {
    targetPos = $pos.end()
  }

  const tr = state.tr.setSelection(TextSelection.create(state.doc, targetPos))
  dispatch(tr)
  updateVimState({ mode: 'insert' })
  resetBuffer()
}

/**
 * Exit to normal mode (<Esc>)
 */
export function exitToNormal(ctx: CommandContext) {
  const { state, dispatch, updateVimState, resetBuffer } = ctx
  const $pos = state.selection.$from
  let targetPos = state.selection.from

  if ($pos.parent.isTextblock) {
    const textLen = $pos.parent.textContent.length
    if (textLen > 0) {
      if ($pos.parentOffset >= textLen) {
        targetPos = $pos.start() + textLen - 1
      } else if ($pos.parentOffset > 0) {
        targetPos = Math.max($pos.start(), targetPos - 1)
      }
    } else {
      targetPos = $pos.start()
    }
  }

  const tr = state.tr.setSelection(TextSelection.create(state.doc, targetPos))
  dispatch(tr)
  updateVimState({ mode: 'normal', visualAnchor: null, visualHead: null })
  resetBuffer()
}

/**
 * Replace single character (r<char>)
 */
export function replaceChar(ctx: CommandContext, char: string) {
  const { state, dispatch, resetBuffer } = ctx
  const pos = state.selection.from
  const $pos = state.doc.resolve(pos)

  if (pos >= $pos.end()) {
    resetBuffer()
    return
  }

  const tr = state.tr.replaceWith(pos, pos + 1, state.schema.text(char))
  tr.setSelection(TextSelection.create(tr.doc, pos))
  dispatch(tr)
  resetBuffer()
}
