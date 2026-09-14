import { EditorState } from '@tiptap/pm/state'
import { VimMode } from '../types'

/**
 * Move left within the current block
 */
export function moveLeft(state: EditorState, pos: number, count = 1): number {
  const $pos = state.doc.resolve(pos)
  const blockStart = $pos.start()
  return Math.max(blockStart, pos - count)
}

/**
 * Move right within the current block
 */
export function moveRight(state: EditorState, pos: number, count = 1, mode: VimMode = 'normal'): number {
  const $pos = state.doc.resolve(pos)
  const blockStart = $pos.start()
  const blockEnd = $pos.end()

  if (blockStart === blockEnd) {
    return blockStart
  }

  const maxPos = mode === 'visual' || mode === 'visual-line' ? blockEnd : blockEnd - 1
  return Math.min(Math.max(blockStart, maxPos), pos + count)
}

/**
 * Move to start of current block (0)
 */
export function moveToLineStart(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  return $pos.start()
}

/**
 * Move to first non-whitespace character in block (^)
 */
export function moveToFirstNonWhitespace(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  const blockStart = $pos.start()
  const text = $pos.parent.textContent
  const match = text.search(/\S/)

  if (match === -1) {
    return blockStart
  }
  return blockStart + match
}

/**
 * Move to end of current block ($)
 */
export function moveToLineEnd(state: EditorState, pos: number, mode: VimMode = 'normal'): number {
  const $pos = state.doc.resolve(pos)
  const blockStart = $pos.start()
  const blockEnd = $pos.end()

  if (blockStart === blockEnd) {
    return blockStart
  }

  if (mode === 'visual' || mode === 'visual-line') {
    return blockEnd
  }

  return blockEnd - 1
}

/**
 * Find character on current line (f, F, t, T)
 */
export function findCharInLine(
  state: EditorState,
  pos: number,
  type: 'f' | 'F' | 't' | 'T',
  char: string,
  count = 1
): number | null {
  const $pos = state.doc.resolve(pos)
  const text = $pos.parent.textContent
  const offset = $pos.parentOffset
  const blockStart = $pos.start()

  if (type === 'f' || type === 't') {
    let matches = 0
    for (let i = offset + 1; i < text.length; i++) {
      if (text[i] === char) {
        matches++
        if (matches === count) {
          const targetOffset = type === 't' ? i - 1 : i
          return blockStart + Math.max(offset, targetOffset)
        }
      }
    }
  } else if (type === 'F' || type === 'T') {
    let matches = 0
    for (let i = offset - 1; i >= 0; i--) {
      if (text[i] === char) {
        matches++
        if (matches === count) {
          const targetOffset = type === 'T' ? i + 1 : i
          return blockStart + Math.min(offset, targetOffset)
        }
      }
    }
  }

  return null
}

const BRACKET_PAIRS: Record<string, { match: string; dir: 1 | -1 }> = {
  '(': { match: ')', dir: 1 },
  ')': { match: '(', dir: -1 },
  '[': { match: ']', dir: 1 },
  ']': { match: '[', dir: -1 },
  '{': { match: '}', dir: 1 },
  '}': { match: '{', dir: -1 },
}

/**
 * Jump to matching bracket/parenthesis (%)
 */
export function matchBracket(state: EditorState, pos: number): number | null {
  const $pos = state.doc.resolve(pos)
  const text = $pos.parent.textContent
  let offset = $pos.parentOffset
  const blockStart = $pos.start()

  let bracketChar = text[offset]
  if (!BRACKET_PAIRS[bracketChar]) {
    let found = -1
    for (let i = offset + 1; i < text.length; i++) {
      if (BRACKET_PAIRS[text[i]]) {
        found = i
        break
      }
    }
    if (found === -1) return null
    offset = found
    bracketChar = text[offset]
  }

  const { match, dir } = BRACKET_PAIRS[bracketChar]
  let depth = 1
  let cur = offset + dir

  while (cur >= 0 && cur < text.length) {
    if (text[cur] === bracketChar) {
      depth++
    } else if (text[cur] === match) {
      depth--
      if (depth === 0) {
        return blockStart + cur
      }
    }
    cur += dir
  }

  return null
}

