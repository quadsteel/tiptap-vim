import { describe, it, expect } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import {
  deleteChar,
  deleteLine,
  deleteRange,
  yankLine,
  put,
  replaceChar,
} from '../operators/actions'
import { handleKeyDown } from '../input/keyDispatcher'
import { CommandContext, VimState } from '../types'
import { registers } from '../state/registers'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: { inline: true },
  },
})

function createTestContext(initialText: string, pos = 1): CommandContext {
  return createMultiLineContext([initialText], pos)
}

function createMultiLineContext(lines: string[], pos = 1): CommandContext {
  const paragraphs = lines.map(line =>
    schema.nodes.paragraph.create(null, line ? [schema.text(line)] : [])
  )
  const doc = schema.nodes.doc.create(null, paragraphs)
  let state = EditorState.create({
    doc,
    schema,
    selection: TextSelection.create(doc, pos),
  })

  let vimState: VimState = {
    mode: 'normal',
    keyBuffer: '',
    count: null,
    pendingOperator: null,
    operatorCount: null,
    visualAnchor: null,
    visualHead: null,
    desiredColumn: null,
    pendingFind: null,
    lastFind: null,
  }

  const ctx: CommandContext = {
    editor: {} as any,
    view: {} as any,
    get state() {
      return state
    },
    dispatch(tr) {
      state = state.apply(tr)
    },
    get vimState() {
      return vimState
    },
    updateVimState(updates) {
      vimState = { ...vimState, ...updates }
    },
    resetBuffer() {
      vimState.keyBuffer = ''
      vimState.count = null
      vimState.pendingOperator = null
      vimState.pendingFind = null
    },
  }

  return ctx
}

describe('Vim Actions & Operators', () => {
  it('deletes character under cursor (x)', () => {
    const ctx = createTestContext('Hello', 1)
    deleteChar(ctx, 1)

    expect(ctx.state.doc.textContent).toBe('ello')
    expect(registers.get()?.text).toBe('H')
  })

  it('replaces single character under cursor (r)', () => {
    const ctx = createTestContext('Hello', 1)
    replaceChar(ctx, 'J')

    expect(ctx.state.doc.textContent).toBe('Jello')
  })

  it('deletes a range (e.g. dw)', () => {
    const ctx = createTestContext('foo bar baz', 1)
    // Delete 'foo ' (from pos 1 to 5)
    deleteRange(ctx, 1, 5)

    expect(ctx.state.doc.textContent).toBe('bar baz')
    expect(registers.get()?.text).toBe('foo ')
  })

  it('yanks line and pastes below (yy and p)', () => {
    const ctx = createTestContext('First line', 1)
    yankLine(ctx, 1)

    expect(registers.get()?.text).toBe('First line\n')
    expect(registers.get()?.type).toBe('line')

    put(ctx, false)

    // Should now have 2 paragraphs
    expect(ctx.state.doc.childCount).toBe(2)
    expect(ctx.state.doc.child(1).textContent).toBe('First line')
  })

  it('clears block on dd when single line', () => {
    const ctx = createTestContext('Single line', 1)
    deleteLine(ctx, 1)

    expect(ctx.state.doc.textContent).toBe('')
    expect(registers.get()?.text).toBe('Single line\n')
  })

  it('selects whole word with v -> e (inclusive of last letter)', () => {
    const ctx = createTestContext('hello world', 1)
    const mockEvent = (key: string) => ({ key, preventDefault: () => {} } as any)

    // Press 'v' to enter visual mode
    handleKeyDown(ctx, mockEvent('v'))
    expect(ctx.vimState.mode).toBe('visual')
    expect(ctx.state.selection.from).toBe(1)
    expect(ctx.state.selection.to).toBe(2) // 'h' selected

    // Press 'e' to select to end of word
    handleKeyDown(ctx, mockEvent('e'))
    expect(ctx.state.selection.from).toBe(1)
    expect(ctx.state.selection.to).toBe(6) // [1, 6] includes 'o'
    expect(ctx.state.doc.textBetween(ctx.state.selection.from, ctx.state.selection.to)).toBe('hello')

    // Press 'd' to delete selected word
    handleKeyDown(ctx, mockEvent('d'))
    expect(ctx.vimState.mode).toBe('normal')
    expect(ctx.state.doc.textContent).toBe(' world')
  })

  it('selects backwards with v -> b (inclusive of boundaries)', () => {
    // Start at 'w' of "world" (pos 7)
    const ctx = createTestContext('hello world', 7)
    const mockEvent = (key: string) => ({ key, preventDefault: () => {} } as any)

    // Press 'v'
    handleKeyDown(ctx, mockEvent('v'))
    expect(ctx.state.selection.from).toBe(7)
    expect(ctx.state.selection.to).toBe(8) // 'w' selected

    // Press 'b' to go back to 'hello'
    handleKeyDown(ctx, mockEvent('b'))
    expect(ctx.state.selection.from).toBe(1)
    expect(ctx.state.selection.to).toBe(8) // [1, 8] includes 'h' through 'w'
    expect(ctx.state.doc.textBetween(ctx.state.selection.from, ctx.state.selection.to)).toBe('hello w')
  })

  it('deletes big WORD with dW', () => {
    // "foo.bar baz" -> dW on 'f' should delete "foo.bar "
    const ctx = createTestContext('foo.bar baz', 1)
    const mockEvent = (key: string) => ({ key, preventDefault: () => {} } as any)

    handleKeyDown(ctx, mockEvent('d'))
    expect(ctx.vimState.pendingOperator).toBe('d')
    handleKeyDown(ctx, mockEvent('W'))

    expect(ctx.state.doc.textContent).toBe('baz')
  })

  it('deletes through character with df', () => {
    // "hello world" -> dfo should delete "hello"
    const ctx = createTestContext('hello world', 1)
    const mockEvent = (key: string) => ({ key, preventDefault: () => {} } as any)

    handleKeyDown(ctx, mockEvent('d'))
    expect(ctx.vimState.pendingOperator).toBe('d')
    handleKeyDown(ctx, mockEvent('f'))
    expect(ctx.vimState.pendingFind).toBe('f')
    handleKeyDown(ctx, mockEvent('o'))

    expect(ctx.state.doc.textContent).toBe(' world')
  })

  it('finds character with f and repeats with ; and ,', () => {
    // text: "banana"
    // pos 1 ('b'): fa -> jumps to first 'a' (pos 2)
    // ; -> jumps to next 'a' (pos 4)
    // , -> jumps back to previous 'a' (pos 2)
    const ctx = createTestContext('banana', 1)
    const mockEvent = (key: string) => ({ key, preventDefault: () => {} } as any)

    handleKeyDown(ctx, mockEvent('f'))
    handleKeyDown(ctx, mockEvent('a'))
    expect(ctx.state.selection.from).toBe(2)

    handleKeyDown(ctx, mockEvent(';'))
    expect(ctx.state.selection.from).toBe(4)

    handleKeyDown(ctx, mockEvent(','))
    expect(ctx.state.selection.from).toBe(2)
  })

  it('selects lines upwards with V -> k and handles j/k expansion and shrinking', () => {
    // 3 lines:
    // Line 1: [1, 7]
    // Line 2: [9, 15]
    // Line 3: [17, 23]
    const ctx = createMultiLineContext(['Line 1', 'Line 2', 'Line 3'], 10)
    const mockEvent = (key: string) => ({ key, preventDefault: () => {} } as any)

    // Press 'V' to enter visual-line mode on Line 2
    handleKeyDown(ctx, mockEvent('V'))
    expect(ctx.vimState.mode).toBe('visual-line')
    expect(ctx.state.selection.from).toBe(9)
    expect(ctx.state.selection.to).toBe(15)

    // Press 'k' to expand upwards to Line 1
    handleKeyDown(ctx, mockEvent('k'))
    expect(ctx.state.selection.from).toBe(1)
    expect(ctx.state.selection.to).toBe(15)
    // Selection direction should be backward (head at top)
    expect(ctx.state.selection.head).toBe(1)
    expect(ctx.state.selection.anchor).toBe(15)

    // Press 'j' to shrink back down to Line 2
    handleKeyDown(ctx, mockEvent('j'))
    expect(ctx.state.selection.from).toBe(9)
    expect(ctx.state.selection.to).toBe(15)

    // Press 'j' again to expand downwards to Line 3
    handleKeyDown(ctx, mockEvent('j'))
    expect(ctx.state.selection.from).toBe(9)
    expect(ctx.state.selection.to).toBe(23)
    // Selection direction should be forward (head at bottom)
    expect(ctx.state.selection.head).toBe(23)
    expect(ctx.state.selection.anchor).toBe(9)

    // Press 'k' to shrink back up to Line 2
    handleKeyDown(ctx, mockEvent('k'))
    expect(ctx.state.selection.from).toBe(9)
    expect(ctx.state.selection.to).toBe(15)
  })

  it('deletes upward visual line selection with V -> k -> d', () => {
    const ctx = createMultiLineContext(['Line 1', 'Line 2', 'Line 3'], 10)
    const mockEvent = (key: string) => ({ key, preventDefault: () => {} } as any)

    // Select Line 2 and Line 1
    handleKeyDown(ctx, mockEvent('V'))
    handleKeyDown(ctx, mockEvent('k'))
    expect(ctx.state.selection.from).toBe(1)
    expect(ctx.state.selection.to).toBe(15)

    // Press 'd' to delete both lines
    handleKeyDown(ctx, mockEvent('d'))
    expect(ctx.vimState.mode).toBe('normal')
    expect(ctx.state.doc.textContent).toBe('Line 3')
  })
})
