import { EditorState } from '@tiptap/pm/state'

enum CharClass {
  Whitespace,
  Word,
  Punctuation,
}

function classifyChar(ch: string): CharClass {
  if (/\s/.test(ch)) return CharClass.Whitespace
  if (/\w/.test(ch)) return CharClass.Word
  return CharClass.Punctuation
}

function getNextBlockStart(state: EditorState, pos: number): number | null {
  const $pos = state.doc.resolve(pos)
  const after = $pos.after()
  if (after < state.doc.content.size) {
    let target: number | null = null
    state.doc.nodesBetween(after, state.doc.content.size, (node, p) => {
      if (target !== null) return false
      if (node.isTextblock) {
        target = p + 1
        return false
      }
    })
    return target
  }
  return null
}

function getPrevBlockEnd(state: EditorState, pos: number): number | null {
  const $pos = state.doc.resolve(pos)
  const before = $pos.before()
  if (before > 0) {
    let target: number | null = null
    state.doc.nodesBetween(0, before, (node, p) => {
      if (node.isTextblock && p + node.nodeSize <= before) {
        const textLen = node.textContent.length
        target = p + 1 + Math.max(0, textLen - 1)
      }
    })
    return target
  }
  return null
}

/**
 * Move forward to start of next word (w)
 */
export function moveWordForward(state: EditorState, pos: number, count = 1): number {
  let currentPos = pos

  for (let i = 0; i < count; i++) {
    const $pos = state.doc.resolve(currentPos)
    const blockEnd = $pos.end()
    const text = $pos.parent.textContent
    let offset = $pos.parentOffset

    if (offset >= text.length) {
      const nextStart = getNextBlockStart(state, currentPos)
      if (nextStart !== null) {
        currentPos = nextStart
      }
      continue
    }

    const startClass = classifyChar(text[offset])

    // 1. If starting on non-whitespace, consume the current word/punctuation run
    if (startClass !== CharClass.Whitespace) {
      while (offset < text.length && classifyChar(text[offset]) === startClass) {
        offset++
      }
    }

    // 2. Consume whitespace
    while (offset < text.length && classifyChar(text[offset]) === CharClass.Whitespace) {
      offset++
    }

    // If reached end of block
    if (offset >= text.length) {
      const nextStart = getNextBlockStart(state, currentPos)
      if (nextStart !== null) {
        currentPos = nextStart
      } else {
        currentPos = blockEnd - (text.length > 0 ? 1 : 0)
      }
    } else {
      currentPos = $pos.start() + offset
    }
  }

  return currentPos
}

/**
 * Move backward to start of previous word (b)
 */
export function moveWordBackward(state: EditorState, pos: number, count = 1): number {
  let currentPos = pos

  for (let i = 0; i < count; i++) {
    const $pos = state.doc.resolve(currentPos)
    const text = $pos.parent.textContent
    let offset = $pos.parentOffset

    // If at start of block, step into previous block
    if (offset <= 0) {
      const prevEnd = getPrevBlockEnd(state, currentPos)
      if (prevEnd !== null) {
        currentPos = prevEnd
      }
      continue
    }

    // Step back 1 char to inspect
    offset--

    // 1. Skip whitespace backwards
    while (offset > 0 && classifyChar(text[offset]) === CharClass.Whitespace) {
      offset--
    }

    // 2. Classify word character and consume backwards
    const targetClass = classifyChar(text[offset])
    if (targetClass !== CharClass.Whitespace) {
      while (offset > 0 && classifyChar(text[offset - 1]) === targetClass) {
        offset--
      }
    }

    currentPos = $pos.start() + offset
  }

  return currentPos
}

/**
 * Move forward to end of current/next word (e)
 */
export function moveWordEnd(state: EditorState, pos: number, count = 1): number {
  let currentPos = pos

  for (let i = 0; i < count; i++) {
    const $pos = state.doc.resolve(currentPos)
    const text = $pos.parent.textContent
    let offset = $pos.parentOffset

    if (offset >= text.length - 1) {
      const nextStart = getNextBlockStart(state, currentPos)
      if (nextStart !== null) {
        currentPos = nextStart
      }
      continue
    }

    // Advance 1 character first
    offset++

    // 1. Skip whitespace
    while (offset < text.length && classifyChar(text[offset]) === CharClass.Whitespace) {
      offset++
    }

    // 2. Consume word or punctuation until its end
    const targetClass = classifyChar(text[offset])
    if (targetClass !== CharClass.Whitespace) {
      while (offset < text.length - 1 && classifyChar(text[offset + 1]) === targetClass) {
        offset++
      }
    }

    currentPos = $pos.start() + offset
  }

  return currentPos
}

/**
 * Move forward to start of next WORD (W) - whitespace delimited
 */
export function moveBigWordForward(state: EditorState, pos: number, count = 1): number {
  let currentPos = pos

  for (let i = 0; i < count; i++) {
    const $pos = state.doc.resolve(currentPos)
    const blockEnd = $pos.end()
    const text = $pos.parent.textContent
    let offset = $pos.parentOffset

    if (offset >= text.length) {
      const nextStart = getNextBlockStart(state, currentPos)
      if (nextStart !== null) {
        currentPos = nextStart
      }
      continue
    }

    // 1. Skip non-whitespace run
    while (offset < text.length && !/\s/.test(text[offset])) {
      offset++
    }

    // 2. Skip whitespace
    while (offset < text.length && /\s/.test(text[offset])) {
      offset++
    }

    if (offset >= text.length) {
      const nextStart = getNextBlockStart(state, currentPos)
      if (nextStart !== null) {
        currentPos = nextStart
      } else {
        currentPos = blockEnd - (text.length > 0 ? 1 : 0)
      }
    } else {
      currentPos = $pos.start() + offset
    }
  }

  return currentPos
}

/**
 * Move backward to start of previous WORD (B) - whitespace delimited
 */
export function moveBigWordBackward(state: EditorState, pos: number, count = 1): number {
  let currentPos = pos

  for (let i = 0; i < count; i++) {
    const $pos = state.doc.resolve(currentPos)
    const text = $pos.parent.textContent
    let offset = $pos.parentOffset

    if (offset <= 0) {
      const prevEnd = getPrevBlockEnd(state, currentPos)
      if (prevEnd !== null) {
        currentPos = prevEnd
      }
      continue
    }

    offset--

    // 1. Skip whitespace backwards
    while (offset > 0 && /\s/.test(text[offset])) {
      offset--
    }

    // 2. Skip non-whitespace backwards
    while (offset > 0 && !/\s/.test(text[offset - 1])) {
      offset--
    }

    currentPos = $pos.start() + offset
  }

  return currentPos
}

/**
 * Move forward to end of current/next WORD (E) - whitespace delimited
 */
export function moveBigWordEnd(state: EditorState, pos: number, count = 1): number {
  let currentPos = pos

  for (let i = 0; i < count; i++) {
    const $pos = state.doc.resolve(currentPos)
    const text = $pos.parent.textContent
    let offset = $pos.parentOffset

    if (offset >= text.length - 1) {
      const nextStart = getNextBlockStart(state, currentPos)
      if (nextStart !== null) {
        currentPos = nextStart
      }
      continue
    }

    offset++

    // 1. Skip whitespace
    while (offset < text.length && /\s/.test(text[offset])) {
      offset++
    }

    // 2. Skip non-whitespace until last char of WORD
    while (offset < text.length - 1 && !/\s/.test(text[offset + 1])) {
      offset++
    }

    currentPos = $pos.start() + offset
  }

  return currentPos
}

