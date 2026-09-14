import { EditorState } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import { Node as PMNode } from '@tiptap/pm/model'

export interface TextBlockInfo {
  start: number
  end: number
  node: PMNode
}

/**
 * Helper to collect all textblocks in document with their start and end positions
 */
export function getAllTextBlocks(doc: PMNode): TextBlockInfo[] {
  const blocks: TextBlockInfo[] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      const start = pos + 1
      const end = pos + node.nodeSize - 1
      blocks.push({ start, end, node })
    }
  })
  return blocks
}

/**
 * Find the index of the textblock containing or closest to pos
 */
function findBlockIndex(blocks: TextBlockInfo[], pos: number): number {
  if (blocks.length === 0) return -1

  for (let i = 0; i < blocks.length; i++) {
    if (pos >= blocks[i].start && pos <= blocks[i].end) {
      return i
    }
  }

  // If outside, find the closest preceding block
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (pos >= blocks[i].end) {
      return i
    }
  }

  return 0
}

/**
 * Clamp a position to valid normal mode character bounds within a textblock
 */
function clampToBlock(block: TextBlockInfo, pos: number): number {
  const textLen = block.node.textContent.length
  if (textLen === 0) {
    return block.start
  }
  const maxPos = block.start + textLen - 1
  return Math.min(Math.max(block.start, pos), maxPos)
}

/**
 * Move vertically down (j)
 */
export function moveDown(
  view: EditorView,
  state: EditorState,
  pos: number,
  count = 1,
  desiredColumn: number | null = null
): { pos: number; column: number } {
  const blocks = getAllTextBlocks(state.doc)
  if (blocks.length === 0) {
    return { pos, column: 0 }
  }

  let blockIdx = findBlockIndex(blocks, pos)
  let currentPos = clampToBlock(blocks[blockIdx], pos)
  let activeColumn = desiredColumn

  for (let c = 0; c < count; c++) {
    const curBlock = blocks[blockIdx]
    let nextPos: number | null = null

    // 1. Try DOM coordinate movement within the current block (handles wrapped lines)
    if (view && typeof view.coordsAtPos === 'function') {
      try {
        const coords = view.coordsAtPos(currentPos)
        if (coords && coords.bottom > coords.top) {
          const colX = activeColumn ?? coords.left
          activeColumn = colX
          const lineHeight = Math.max(16, coords.bottom - coords.top)
          const targetY = coords.bottom + lineHeight / 2

          const result = view.posAtCoords({ left: colX, top: targetY })
          if (result && result.pos >= curBlock.start && result.pos <= curBlock.end) {
            // Verify it actually moved down to a new visual line
            const newCoords = view.coordsAtPos(result.pos)
            if (newCoords && newCoords.top >= coords.bottom - 4) {
              nextPos = clampToBlock(curBlock, result.pos)
            }
          }
        }
      } catch {
        // Layout lookup fallback
      }
    }

    // 2. If no lower visual line in current block, transition to the next block
    if (nextPos === null) {
      if (blockIdx < blocks.length - 1) {
        blockIdx++
        const nextBlock = blocks[blockIdx]

        // Try to land on the first visual line of nextBlock at activeColumn
        let landed = false
        if (view && typeof view.coordsAtPos === 'function' && activeColumn !== null) {
          try {
            const nextCoords = view.coordsAtPos(nextBlock.start)
            if (nextCoords && nextCoords.bottom > nextCoords.top) {
              const targetY = nextCoords.top + (nextCoords.bottom - nextCoords.top) / 2
              const result = view.posAtCoords({ left: activeColumn, top: targetY })
              if (result && result.pos >= nextBlock.start && result.pos <= nextBlock.end) {
                nextPos = clampToBlock(nextBlock, result.pos)
                landed = true
              }
            }
          } catch {
            // fallback to AST offset
          }
        }

        if (!landed) {
          // AST offset fallback
          const $cur = state.doc.resolve(currentPos)
          const targetOffset = Math.min(nextBlock.node.content.size, $cur.parentOffset)
          nextPos = clampToBlock(nextBlock, nextBlock.start + targetOffset)
        }
      } else {
        // Already on the last block, stay on the last valid position
        break
      }
    }

    if (nextPos !== null) {
      currentPos = nextPos
    }
  }

  return { pos: currentPos, column: activeColumn ?? 0 }
}

/**
 * Move vertically up (k)
 */
export function moveUp(
  view: EditorView,
  state: EditorState,
  pos: number,
  count = 1,
  desiredColumn: number | null = null
): { pos: number; column: number } {
  const blocks = getAllTextBlocks(state.doc)
  if (blocks.length === 0) {
    return { pos, column: 0 }
  }

  let blockIdx = findBlockIndex(blocks, pos)
  let currentPos = clampToBlock(blocks[blockIdx], pos)
  let activeColumn = desiredColumn

  for (let c = 0; c < count; c++) {
    const curBlock = blocks[blockIdx]
    let nextPos: number | null = null

    // 1. Try DOM coordinate movement within the current block (handles wrapped lines)
    if (view && typeof view.coordsAtPos === 'function') {
      try {
        const coords = view.coordsAtPos(currentPos)
        if (coords && coords.bottom > coords.top) {
          const colX = activeColumn ?? coords.left
          activeColumn = colX
          const lineHeight = Math.max(16, coords.bottom - coords.top)
          const targetY = coords.top - lineHeight / 2

          const result = view.posAtCoords({ left: colX, top: targetY })
          if (result && result.pos >= curBlock.start && result.pos <= curBlock.end) {
            // Verify it actually moved up to a higher visual line
            const newCoords = view.coordsAtPos(result.pos)
            if (newCoords && newCoords.bottom <= coords.top + 4) {
              nextPos = clampToBlock(curBlock, result.pos)
            }
          }
        }
      } catch {
        // Fallback
      }
    }

    // 2. If no higher visual line in current block, transition to previous block
    if (nextPos === null) {
      if (blockIdx > 0) {
        blockIdx--
        const prevBlock = blocks[blockIdx]

        // Try to land on the last visual line of prevBlock at activeColumn
        let landed = false
        if (view && typeof view.coordsAtPos === 'function' && activeColumn !== null) {
          try {
            const prevEndPos = clampToBlock(prevBlock, prevBlock.end)
            const prevCoords = view.coordsAtPos(prevEndPos)
            if (prevCoords && prevCoords.bottom > prevCoords.top) {
              const targetY = prevCoords.top + (prevCoords.bottom - prevCoords.top) / 2
              const result = view.posAtCoords({ left: activeColumn, top: targetY })
              if (result && result.pos >= prevBlock.start && result.pos <= prevBlock.end) {
                nextPos = clampToBlock(prevBlock, result.pos)
                landed = true
              }
            }
          } catch {
            // fallback
          }
        }

        if (!landed) {
          const $cur = state.doc.resolve(currentPos)
          const targetOffset = Math.min(prevBlock.node.content.size, $cur.parentOffset)
          nextPos = clampToBlock(prevBlock, prevBlock.start + targetOffset)
        }
      } else {
        // Already on the first block, stay where we are
        break
      }
    }

    if (nextPos !== null) {
      currentPos = nextPos
    }
  }

  return { pos: currentPos, column: activeColumn ?? 0 }
}

/**
 * Jump to top of document (gg) or specified line
 */
export function jumpToTop(state: EditorState, lineNumber: number | null = null): number {
  const blocks = getAllTextBlocks(state.doc)
  if (blocks.length === 0) return 0

  if (lineNumber !== null && lineNumber > 0) {
    const idx = Math.min(lineNumber - 1, blocks.length - 1)
    return clampToBlock(blocks[idx], blocks[idx].start)
  }

  return clampToBlock(blocks[0], blocks[0].start)
}

/**
 * Jump to bottom of document (G) or specified line
 */
export function jumpToBottom(state: EditorState, lineNumber: number | null = null): number {
  const blocks = getAllTextBlocks(state.doc)
  if (blocks.length === 0) return 0

  if (lineNumber !== null && lineNumber > 0) {
    const idx = Math.min(lineNumber - 1, blocks.length - 1)
    return clampToBlock(blocks[idx], blocks[idx].start)
  }

  const last = blocks[blocks.length - 1]
  return clampToBlock(last, last.end)
}

/**
 * Jump to next paragraph / block boundary (})
 */
export function moveParagraphDown(state: EditorState, pos: number, count = 1): number {
  const blocks = getAllTextBlocks(state.doc)
  if (blocks.length === 0) return pos

  const curIdx = findBlockIndex(blocks, pos)
  const targetIdx = Math.min(blocks.length - 1, curIdx + count)
  return clampToBlock(blocks[targetIdx], blocks[targetIdx].start)
}

/**
 * Jump to previous paragraph / block boundary ({)
 */
export function moveParagraphUp(state: EditorState, pos: number, count = 1): number {
  const blocks = getAllTextBlocks(state.doc)
  if (blocks.length === 0) return pos

  const curIdx = findBlockIndex(blocks, pos)
  const targetIdx = Math.max(0, curIdx - count)
  return clampToBlock(blocks[targetIdx], blocks[targetIdx].start)
}

