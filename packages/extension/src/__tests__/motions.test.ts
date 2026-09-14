import { describe, it, expect } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
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

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: { inline: true },
  },
})

function createState(text: string) {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, text ? [schema.text(text)] : []),
  ])
  return EditorState.create({ doc, schema })
}

function createMultiBlockState(lines: string[]) {
  const paragraphs = lines.map(line =>
    schema.nodes.paragraph.create(null, line ? [schema.text(line)] : [])
  )
  const doc = schema.nodes.doc.create(null, paragraphs)
  return EditorState.create({ doc, schema })
}

describe('Vim Character Motions', () => {
  it('moves right with boundary clamp in normal mode', () => {
    // "Hello" is at positions 1..6 (pos 1: 'H', 2: 'e', 3: 'l', 4: 'l', 5: 'o', 6: after 'o')
    // In normal mode, max pos is 5 ('o')
    const state = createState('Hello')
    expect(moveRight(state, 1, 1)).toBe(2)
    expect(moveRight(state, 1, 2)).toBe(3)
    expect(moveRight(state, 1, 10)).toBe(5) // Clamped to 'o'
  })

  it('moves right to block end in visual mode', () => {
    const state = createState('Hello')
    expect(moveRight(state, 1, 10, 'visual')).toBe(6) // Can reach end of block
  })

  it('moves left with boundary clamp', () => {
    const state = createState('Hello')
    expect(moveLeft(state, 5, 2)).toBe(3)
    expect(moveLeft(state, 5, 10)).toBe(1) // Clamped to start of block
  })

  it('moves to line start (0) and line end ($)', () => {
    const state = createState('Hello World')
    expect(moveToLineStart(state, 8)).toBe(1)
    expect(moveToLineEnd(state, 1, 'normal')).toBe(11) // pos of 'd'
    expect(moveToLineEnd(state, 1, 'visual')).toBe(12) // pos after 'd'
  })

  it('moves to first non-whitespace character (^)', () => {
    const state = createState('   Indented')
    // ' ' is at 1, 2, 3. 'I' is at 4.
    expect(moveToFirstNonWhitespace(state, 1)).toBe(4)
  })
})

describe('Vim Word Motions', () => {
  it('navigates forward through words (w)', () => {
    // "const foo = 42"
    // pos 1: 'c'
    // pos 7: 'f'
    // pos 11: '='
    // pos 13: '4'
    const state = createState('const foo = 42')
    const p1 = moveWordForward(state, 1)
    expect(p1).toBe(7)

    const p2 = moveWordForward(state, p1)
    expect(p2).toBe(11)

    const p3 = moveWordForward(state, p2)
    expect(p3).toBe(13)
  })

  it('navigates backward through words (b)', () => {
    const state = createState('const foo = 42')
    const p1 = moveWordBackward(state, 13) // from '4'
    expect(p1).toBe(11) // to '='

    const p2 = moveWordBackward(state, p1)
    expect(p2).toBe(7) // to 'foo'

    const p3 = moveWordBackward(state, p2)
    expect(p3).toBe(1) // to 'const'
  })

  it('navigates to word ends (e)', () => {
    const state = createState('const foo = 42')
    // pos 1 is 'c'. End of 'const' is pos 5 ('t')
    const e1 = moveWordEnd(state, 1)
    expect(e1).toBe(5)

    // Next word end is 'foo' pos 9 ('o')
    const e2 = moveWordEnd(state, e1)
    expect(e2).toBe(9)
  })

  it('crosses block boundaries with w', () => {
    const state = createMultiBlockState(['First line', 'Second line'])
    // End of first paragraph -> jumps to start of second paragraph
    const p1 = moveWordForward(state, 7) // on 'line'
    // Jump to 'Second'
    expect(p1).toBeGreaterThan(11)
  })
})

describe('Vim Document Motions', () => {
  it('jumps to start (gg) and bottom (G) of document', () => {
    const state = createMultiBlockState(['Line 1', 'Line 2', 'Line 3'])
    const top = jumpToTop(state)
    expect(top).toBe(1) // First line pos

    const bottom = jumpToBottom(state)
    // Last line pos should be in the last block
    expect(bottom).toBeGreaterThan(top)
  })

  it('jumps to specific line number with count', () => {
    const state = createMultiBlockState(['Line 1', 'Line 2', 'Line 3'])
    const line2Pos = jumpToTop(state, 2)
    expect(line2Pos).toBe(9) // Start of second paragraph
  })
})

describe('Vim Vertical Line Motions (j / k)', () => {
  it('moves down to next paragraph and stays strictly inside textblock', () => {
    const state = createMultiBlockState(['Line 1', 'Line 2'])
    const viewMock = {} as any
    const res = moveDown(viewMock, state, 1, 1)
    expect(res.pos).toBe(9)
    const $pos = state.doc.resolve(res.pos)
    expect($pos.parent.isTextblock).toBe(true)
  })

  it('moves up to previous paragraph', () => {
    const state = createMultiBlockState(['Line 1', 'Line 2'])
    const viewMock = {} as any
    const res = moveUp(viewMock, state, 9, 1)
    expect(res.pos).toBe(1)
    const $pos = state.doc.resolve(res.pos)
    expect($pos.parent.isTextblock).toBe(true)
  })

  it('does not escape document boundary when moving up on line 1', () => {
    const state = createMultiBlockState(['Line 1', 'Line 2'])
    const viewMock = {} as any
    const res = moveUp(viewMock, state, 1, 1)
    expect(res.pos).toBe(1)
  })

  it('does not escape document boundary when moving down on last line', () => {
    const state = createMultiBlockState(['Line 1', 'Line 2'])
    const viewMock = {} as any
    const res = moveDown(viewMock, state, 9, 1)
    expect(res.pos).toBe(9)
  })
})

describe('Vim WORD Motions (W, B, E)', () => {
  it('skips punctuation and moves to next whitespace-delimited WORD (W)', () => {
    // "foo.bar(baz) 123"
    // 'f' is at 1. 'foo.bar(baz)' has punctuation, but is 1 WORD.
    // '1' of '123' is at pos 14.
    const state = createState('foo.bar(baz) 123')
    const pos = moveBigWordForward(state, 1)
    expect(pos).toBe(14)
  })

  it('moves backward across punctuation to start of WORD (B)', () => {
    const state = createState('foo.bar(baz) 123')
    // from '1' at pos 14 -> jumps all the way to 'f' at pos 1
    const pos = moveBigWordBackward(state, 14)
    expect(pos).toBe(1)
  })

  it('moves to end of current/next WORD (E)', () => {
    const state = createState('foo.bar(baz) 123')
    // from 'f' at pos 1 -> jumps to ')' at pos 12
    const pos = moveBigWordEnd(state, 1)
    expect(pos).toBe(12)
  })
})

describe('Vim Paragraph Motions ({ and })', () => {
  it('jumps down paragraphs with }', () => {
    const state = createMultiBlockState(['Para 1', 'Para 2', 'Para 3'])
    const p1 = moveParagraphDown(state, 1)
    expect(p1).toBe(9) // Start of Para 2

    const p2 = moveParagraphDown(state, p1)
    expect(p2).toBe(17) // Start of Para 3
  })

  it('jumps up paragraphs with {', () => {
    const state = createMultiBlockState(['Para 1', 'Para 2', 'Para 3'])
    const p1 = moveParagraphUp(state, 17)
    expect(p1).toBe(9) // Start of Para 2

    const p2 = moveParagraphUp(state, p1)
    expect(p2).toBe(1) // Start of Para 1
  })
})

describe('Vim In-line Find (f, F, t, T)', () => {
  it('finds character forward on line with f', () => {
    const state = createState('hello, world!')
    // ',' is at offset 5 -> pos 6
    const res = findCharInLine(state, 1, 'f', ',')
    expect(res).toBe(6)
  })

  it('moves till character forward on line with t', () => {
    const state = createState('hello, world!')
    // character before ',' is 'o' at offset 4 -> pos 5
    const res = findCharInLine(state, 1, 't', ',')
    expect(res).toBe(5)
  })

  it('finds character backward on line with F', () => {
    const state = createState('hello, world!')
    // from 'w' at pos 8, find 'h' backward at pos 1
    const res = findCharInLine(state, 8, 'F', 'h')
    expect(res).toBe(1)
  })

  it('moves till character backward on line with T', () => {
    const state = createState('hello, world!')
    // from 'w' at pos 8, till 'h' backward stops at 'e' (pos 2)
    const res = findCharInLine(state, 8, 'T', 'h')
    expect(res).toBe(2)
  })
})

describe('Vim Bracket Matching (%)', () => {
  it('jumps between matching parentheses', () => {
    const state = createState('foo(bar, baz)')
    // '(' is at pos 4, ')' is at pos 13
    const match = matchBracket(state, 4)
    expect(match).toBe(13)

    const matchBack = matchBracket(state, 13)
    expect(matchBack).toBe(4)
  })

  it('handles nested brackets', () => {
    const state = createState('arr[x[y]]')
    // '[' is at pos 4, matching ']' is at pos 9
    const match = matchBracket(state, 4)
    expect(match).toBe(9)
  })

  it('scans forward on line to find first bracket if not on one', () => {
    const state = createState('function(abc)')
    // cursor at pos 1 ('f'), should find '(' at pos 9 and jump to ')' at pos 13
    const match = matchBracket(state, 1)
    expect(match).toBe(13)
  })
})

