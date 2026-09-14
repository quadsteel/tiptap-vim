import { TextSelection } from '@tiptap/pm/state'
import { Node as PMNode } from '@tiptap/pm/model'
import { CommandContext, VimMode } from '../types'
import {
  moveLeft,
  moveRight,
  moveToLineStart,
  moveToFirstNonWhitespace,
  moveToLineEnd,
  findCharInLine,
  matchBracket,
} from '../motions/charMotions'
import {
  moveWordForward,
  moveWordBackward,
  moveWordEnd,
  moveBigWordForward,
  moveBigWordBackward,
  moveBigWordEnd,
} from '../motions/wordMotions'
import {
  moveDown,
  moveUp,
  jumpToTop,
  jumpToBottom,
  moveParagraphDown,
  moveParagraphUp,
} from '../motions/lineMotions'
import {
  deleteChar,
  deleteLine,
  deleteRange,
  changeLine,
  changeRange,
  yankLine,
  yankRange,
  put,
  openBelow,
  openAbove,
  enterInsert,
  exitToNormal,
  replaceChar,
} from '../operators/actions'

export function handleKeyDown(ctx: CommandContext, event: KeyboardEvent): boolean {
  const { vimState } = ctx
  const { key, ctrlKey, metaKey, altKey } = event

  // Let browser hotkeys through (Cmd+Option+I, F12, etc.)
  if (metaKey || altKey) {
    return false
  }

  // Handle INSERT mode
  if (vimState.mode === 'insert') {
    if (key === 'Escape' || (ctrlKey && key === '[') || (ctrlKey && key === 'c')) {
      event.preventDefault()
      exitToNormal(ctx)
      return true
    }
    return false
  }

  // Handle Undo / Redo in normal mode
  if (ctrlKey) {
    if (key.toLowerCase() === 'r' && vimState.mode === 'normal') {
      event.preventDefault()
      ctx.editor.commands.redo()
      return true
    }
    if (key === '[') {
      event.preventDefault()
      exitToNormal(ctx)
      return true
    }
    // Don't intercept other Ctrl shortcuts (like Ctrl+Shift+I)
    return false
  }

  // From here on, in NORMAL or VISUAL mode, intercept all handled keys
  event.preventDefault()

  // Escape clears buffers or exits visual mode
  if (key === 'Escape') {
    exitToNormal(ctx)
    return true
  }

  const count = vimState.count ?? 1

  // Pending 'r' (replace single char)
  if (vimState.pendingOperator === 'r') {
    if (key.length === 1) {
      replaceChar(ctx, key)
    } else {
      ctx.resetBuffer()
    }
    return true
  }

  // Pending Find (f, F, t, T)
  if (vimState.pendingFind) {
    if (key.length === 1) {
      handleFindChar(ctx, vimState.pendingFind, key, count)
    } else {
      ctx.resetBuffer()
    }
    return true
  }

  // Digits (counts)
  if (/^[0-9]$/.test(key)) {
    // '0' as line-start motion when count is empty
    if (key === '0' && vimState.count === null && !vimState.pendingOperator) {
      executeMotion(ctx, (s, p) => moveToLineStart(s, p))
      return true
    }

    const newCount = (vimState.count ?? 0) * 10 + parseInt(key, 10)
    ctx.updateVimState({
      count: newCount,
      keyBuffer: (vimState.keyBuffer || '') + key,
    })
    return true
  }

  // Repeat in-line find (; and ,)
  if (key === ';' || key === ',') {
    if (vimState.lastFind) {
      let findType = vimState.lastFind.type
      if (key === ',') {
        if (findType === 'f') findType = 'F'
        else if (findType === 'F') findType = 'f'
        else if (findType === 't') findType = 'T'
        else if (findType === 'T') findType = 't'
      }
      handleFindChar(ctx, findType, vimState.lastFind.char, count)
      return true
    }
    ctx.resetBuffer()
    return true
  }

  // Initiate in-line find (f, F, t, T)
  if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
    ctx.updateVimState({
      pendingFind: key,
      keyBuffer: (vimState.keyBuffer || '') + key,
    })
    return true
  }

  // VISUAL MODE HANDLING
  if (vimState.mode === 'visual' || vimState.mode === 'visual-line') {
    return handleVisualKey(ctx, key, count)
  }

  // NORMAL MODE HANDLING

  // 1. Pending Operator + Motion or Double Operator
  if (vimState.pendingOperator) {
    return handlePendingOperatorKey(ctx, key, count)
  }

  // 2. Normal Mode Mode Switchers
  switch (key) {
    case 'i':
      enterInsert(ctx, 'i')
      return true
    case 'a':
      enterInsert(ctx, 'a')
      return true
    case 'I':
      enterInsert(ctx, 'I')
      return true
    case 'A':
      enterInsert(ctx, 'A')
      return true
    case 'o':
      openBelow(ctx)
      return true
    case 'O':
      openAbove(ctx)
      return true
    case 'v':
      enterVisualMode(ctx, 'visual')
      return true
    case 'V':
      enterVisualMode(ctx, 'visual-line')
      return true
  }

  // 3. Normal Mode Single Actions
  switch (key) {
    case 'x':
      deleteChar(ctx, count)
      return true
    case 'u':
      ctx.editor.commands.undo()
      ctx.resetBuffer()
      return true
    case 'p':
      put(ctx, false)
      return true
    case 'P':
      put(ctx, true)
      return true
    case 'D':
      deleteRange(ctx, ctx.state.selection.from, moveToLineEnd(ctx.state, ctx.state.selection.from, 'visual'))
      return true
    case 'C':
      changeRange(ctx, ctx.state.selection.from, moveToLineEnd(ctx.state, ctx.state.selection.from, 'visual'))
      return true
    case 'Y':
      yankLine(ctx, count)
      return true
    case 's':
      changeRange(ctx, ctx.state.selection.from, ctx.state.selection.from + 1)
      return true
    case 'S':
      changeLine(ctx)
      return true
  }

  // 4. Operator Initiation (d, c, y, r)
  if (key === 'd' || key === 'c' || key === 'y' || key === 'r') {
    ctx.updateVimState({
      pendingOperator: key,
      operatorCount: count,
      count: null,
      keyBuffer: (vimState.keyBuffer || '') + key,
    })
    return true
  }

  // 5. Normal Mode Motions
  if (key === 'g') {
    if (vimState.keyBuffer.endsWith('g')) {
      // gg
      const targetPos = jumpToTop(ctx.state, vimState.count)
      setCursorPos(ctx, targetPos)
      ctx.resetBuffer()
    } else {
      ctx.updateVimState({
        keyBuffer: (vimState.keyBuffer || '') + 'g',
      })
    }
    return true
  }

  if (key === 'G') {
    const targetPos = jumpToBottom(ctx.state, vimState.count)
    setCursorPos(ctx, targetPos)
    ctx.resetBuffer()
    return true
  }

  // Standard Motions
  return dispatchMotion(ctx, key, count)
}

function handleFindChar(
  ctx: CommandContext,
  findType: 'f' | 'F' | 't' | 'T',
  char: string,
  count: number
) {
  const { state, vimState, updateVimState, resetBuffer } = ctx
  const currentPos =
    vimState.mode === 'visual'
      ? (vimState.visualHead ?? state.selection.from)
      : state.selection.from

  const totalCount = (vimState.operatorCount ?? 1) * count
  const targetPos = findCharInLine(state, currentPos, findType, char, totalCount)

  updateVimState({
    lastFind: { type: findType, char },
    pendingFind: null,
  })

  if (targetPos === null) {
    resetBuffer()
    return
  }

  // If pending operator (e.g. dfx, cfx, ytx)
  if (vimState.pendingOperator) {
    const op = vimState.pendingOperator
    const from = targetPos < currentPos ? targetPos : currentPos
    const to = targetPos >= currentPos ? targetPos + 1 : currentPos + 1
    if (op === 'd') deleteRange(ctx, from, to)
    else if (op === 'c') changeRange(ctx, from, to)
    else if (op === 'y') yankRange(ctx, from, to)
    return
  }

  // If visual mode
  if (vimState.mode === 'visual' || vimState.mode === 'visual-line') {
    applyMotionPosition(ctx, targetPos, null)
    resetBuffer()
    return
  }

  // Normal mode motion
  setCursorPos(ctx, targetPos)
  resetBuffer()
}

function handlePendingOperatorKey(ctx: CommandContext, key: string, count: number): boolean {
  const { vimState, state } = ctx
  const op = vimState.pendingOperator
  const totalCount = (vimState.operatorCount ?? 1) * count
  const currentPos = state.selection.from

  // Double operator (dd, cc, yy)
  if (key === op) {
    if (op === 'd') deleteLine(ctx, totalCount)
    else if (op === 'c') changeLine(ctx)
    else if (op === 'y') yankLine(ctx, totalCount)
    return true
  }

  // Motions with operator
  let targetPos: number | null = null
  let lineWise = false

  switch (key) {
    case 'h':
      targetPos = moveLeft(state, currentPos, totalCount)
      break
    case 'l':
      targetPos = moveRight(state, currentPos, totalCount, 'visual')
      break
    case 'w':
      targetPos = moveWordForward(state, currentPos, totalCount)
      break
    case 'b':
      targetPos = moveWordBackward(state, currentPos, totalCount)
      break
    case 'e':
      targetPos = moveWordEnd(state, currentPos, totalCount) + 1
      break
    case 'W':
      targetPos = moveBigWordForward(state, currentPos, totalCount)
      break
    case 'B':
      targetPos = moveBigWordBackward(state, currentPos, totalCount)
      break
    case 'E':
      targetPos = moveBigWordEnd(state, currentPos, totalCount) + 1
      break
    case '0':
      targetPos = moveToLineStart(state, currentPos)
      break
    case '^':
      targetPos = moveToFirstNonWhitespace(state, currentPos)
      break
    case '$':
      targetPos = moveToLineEnd(state, currentPos, 'visual')
      break
    case '_':
      targetPos = moveToFirstNonWhitespace(state, currentPos)
      break
    case '{':
      targetPos = moveParagraphUp(state, currentPos, totalCount)
      lineWise = true
      break
    case '}':
      targetPos = moveParagraphDown(state, currentPos, totalCount)
      lineWise = true
      break
    case '%': {
      const matchPos = matchBracket(state, currentPos)
      if (matchPos !== null) {
        targetPos = matchPos >= currentPos ? matchPos + 1 : matchPos
      }
      break
    }
    case 'j': {
      const res = moveDown(ctx.view, state, currentPos, totalCount)
      targetPos = res.pos
      lineWise = true
      break
    }
    case 'k': {
      const res = moveUp(ctx.view, state, currentPos, totalCount)
      targetPos = res.pos
      lineWise = true
      break
    }
    case 'G':
      targetPos = jumpToBottom(state, null)
      lineWise = true
      break
  }

  if (targetPos !== null) {
    if (op === 'd') {
      deleteRange(ctx, currentPos, targetPos, lineWise)
    } else if (op === 'c') {
      changeRange(ctx, currentPos, targetPos)
    } else if (op === 'y') {
      yankRange(ctx, currentPos, targetPos, lineWise)
    }
    return true
  }

  ctx.resetBuffer()
  return true
}

function handleVisualKey(ctx: CommandContext, key: string, count: number): boolean {
  const { state } = ctx
  const { from, to } = state.selection

  // Visual Operators
  if (key === 'd' || key === 'x') {
    deleteRange(ctx, from, to, ctx.vimState.mode === 'visual-line')
    ctx.updateVimState({ mode: 'normal', visualAnchor: null, visualHead: null })
    return true
  }
  if (key === 'c' || key === 's') {
    changeRange(ctx, from, to)
    ctx.updateVimState({ mode: 'insert', visualAnchor: null, visualHead: null })
    return true
  }
  if (key === 'y') {
    yankRange(ctx, from, to, ctx.vimState.mode === 'visual-line')
    ctx.updateVimState({ mode: 'normal', visualAnchor: null, visualHead: null })
    return true
  }

  // Toggle visual modes
  if (key === 'v') {
    if (ctx.vimState.mode === 'visual') {
      exitToNormal(ctx)
    } else {
      enterVisualMode(ctx, 'visual')
    }
    return true
  }
  if (key === 'V') {
    if (ctx.vimState.mode === 'visual-line') {
      exitToNormal(ctx)
    } else {
      enterVisualMode(ctx, 'visual-line')
    }
    return true
  }

  // Motions in Visual Mode
  return dispatchMotion(ctx, key, count)
}

function dispatchMotion(ctx: CommandContext, key: string, count: number): boolean {
  const { state, view, vimState } = ctx
  const currentPos = vimState.mode === 'visual'
    ? (vimState.visualHead ?? state.selection.from)
    : (state.selection.head ?? state.selection.from)

  let targetPos: number | null = null
  let nextColumn = vimState.desiredColumn

  switch (key) {
    case 'h':
      targetPos = moveLeft(state, currentPos, count)
      nextColumn = null
      break
    case 'l':
      targetPos = moveRight(state, currentPos, count, vimState.mode)
      nextColumn = null
      break
    case '0':
      targetPos = moveToLineStart(state, currentPos)
      nextColumn = null
      break
    case '^':
      targetPos = moveToFirstNonWhitespace(state, currentPos)
      nextColumn = null
      break
    case '$':
      targetPos = moveToLineEnd(state, currentPos, vimState.mode)
      nextColumn = null
      break
    case 'w':
      targetPos = moveWordForward(state, currentPos, count)
      nextColumn = null
      break
    case 'b':
      targetPos = moveWordBackward(state, currentPos, count)
      nextColumn = null
      break
    case 'e':
      targetPos = moveWordEnd(state, currentPos, count)
      nextColumn = null
      break
    case 'j': {
      const res = moveDown(view, state, currentPos, count, vimState.desiredColumn)
      targetPos = res.pos
      nextColumn = res.column
      break
    }
    case 'k': {
      const res = moveUp(view, state, currentPos, count, vimState.desiredColumn)
      targetPos = res.pos
      nextColumn = res.column
      break
    }
    case 'W':
      targetPos = moveBigWordForward(state, currentPos, count)
      nextColumn = null
      break
    case 'B':
      targetPos = moveBigWordBackward(state, currentPos, count)
      nextColumn = null
      break
    case 'E':
      targetPos = moveBigWordEnd(state, currentPos, count)
      nextColumn = null
      break
    case '{':
      targetPos = moveParagraphUp(state, currentPos, count)
      nextColumn = null
      break
    case '}':
      targetPos = moveParagraphDown(state, currentPos, count)
      nextColumn = null
      break
    case '%':
      targetPos = matchBracket(state, currentPos)
      nextColumn = null
      break
    case '_':
      targetPos = moveToFirstNonWhitespace(state, currentPos)
      nextColumn = null
      break
    default:
      ctx.resetBuffer()
      return false
  }

  if (targetPos !== null) {
    applyMotionPosition(ctx, targetPos, nextColumn)
  }
  ctx.resetBuffer()
  return true
}

function applyMotionPosition(ctx: CommandContext, targetPos: number, column: number | null) {
  const { state, dispatch, vimState, updateVimState } = ctx

  if (vimState.mode === 'visual') {
    const anchor = vimState.visualAnchor ?? state.selection.anchor
    const $target = state.doc.resolve(targetPos)

    let tr
    if (targetPos >= anchor) {
      // Forward selection: includes the character at targetPos
      const to = Math.min($target.end(), targetPos + 1)
      tr = state.tr.setSelection(TextSelection.create(state.doc, anchor, to))
    } else {
      // Backward selection: includes the anchor character
      const anchor$pos = state.doc.resolve(anchor)
      const anchorTo = Math.min(anchor$pos.end(), anchor + 1)
      tr = state.tr.setSelection(TextSelection.create(state.doc, anchorTo, targetPos))
    }

    dispatch(tr)
    updateVimState({ desiredColumn: column, visualHead: targetPos })
  } else if (vimState.mode === 'visual-line') {
    const anchor = vimState.visualAnchor ?? state.selection.anchor
    const $anchor = state.doc.resolve(anchor)
    const $target = state.doc.resolve(targetPos)

    const from = Math.min($anchor.start(), $target.start())
    const to = Math.max($anchor.end(), $target.end())

    const tr = state.tr.setSelection(TextSelection.create(state.doc, from, to))
    dispatch(tr)
    updateVimState({ desiredColumn: column, visualHead: targetPos })
  } else {
    // Normal mode cursor
    setCursorPos(ctx, targetPos)
    updateVimState({ desiredColumn: column, visualHead: null })
  }
}

function executeMotion(ctx: CommandContext, motionFn: (state: any, pos: number) => number) {
  const currentPos = ctx.state.selection.from
  const targetPos = motionFn(ctx.state, currentPos)
  setCursorPos(ctx, targetPos)
  ctx.resetBuffer()
}

export function sanitizeNormalModePos(doc: PMNode, pos: number): number {
  const safePos = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(safePos)

  if ($pos.parent.isTextblock) {
    const textLen = $pos.parent.textContent.length
    if (textLen === 0) {
      return $pos.start()
    }
    const maxPos = $pos.start() + textLen - 1
    return Math.min(Math.max($pos.start(), safePos), maxPos)
  }

  // If outside a textblock, find nearest textblock
  const sel = TextSelection.near($pos)
  const $valid = sel.$from
  if ($valid.parent.isTextblock) {
    const textLen = $valid.parent.textContent.length
    if (textLen === 0) return $valid.start()
    return Math.min($valid.pos, $valid.start() + textLen - 1)
  }

  return sel.from
}

function setCursorPos(ctx: CommandContext, pos: number) {
  const validPos = sanitizeNormalModePos(ctx.state.doc, pos)
  const tr = ctx.state.tr.setSelection(TextSelection.create(ctx.state.doc, validPos))
  ctx.dispatch(tr)
}

function enterVisualMode(ctx: CommandContext, mode: 'visual' | 'visual-line') {
  const pos = ctx.state.selection.from
  const { state, dispatch, updateVimState, resetBuffer } = ctx

  if (mode === 'visual-line') {
    const $pos = state.doc.resolve(pos)
    const tr = state.tr.setSelection(TextSelection.create(state.doc, $pos.start(), $pos.end()))
    dispatch(tr)
  } else {
    // Select current char
    const $pos = state.doc.resolve(pos)
    const to = Math.min($pos.end(), pos + 1)
    const tr = state.tr.setSelection(TextSelection.create(state.doc, pos, to))
    dispatch(tr)
  }

  updateVimState({ mode, visualAnchor: pos, visualHead: pos })
  resetBuffer()
}
