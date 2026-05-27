import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterUnread,
  formatContext,
  mergeRead,
} from '../hooks/lib/inbox-reader.mjs'

describe('filterUnread', () => {
  it('returns only entries whose id is not in the read set', () => {
    const entries = [
      { id: 'IC_1', body: 'a' },
      { id: 'IC_2', body: 'b' },
      { id: 'PRRC_1', body: 'c' },
    ]
    const read = new Set(['IC_1'])
    assert.deepEqual(filterUnread(entries, read).map(e => e.id), ['IC_2', 'PRRC_1'])
  })

  it('skips entries with no id (defensive)', () => {
    const entries = [{ body: 'orphan' }, { id: 'IC_1', body: 'kept' }]
    assert.deepEqual(filterUnread(entries, new Set()).map(e => e.id), ['IC_1'])
  })

  it('returns nothing when every entry has been read', () => {
    const entries = [{ id: 'IC_1' }, { id: 'IC_2' }]
    assert.equal(filterUnread(entries, new Set(['IC_1', 'IC_2'])).length, 0)
  })
})

describe('formatContext', () => {
  it('singular header for one entry, plural for multiple', () => {
    const one = formatContext([{ id: '1', author: 'alice', body: 'hi' }])
    assert.match(one, /1 new PR review comment since last turn:/)
    const two = formatContext([
      { id: '1', author: 'alice', body: 'hi' },
      { id: '2', author: 'bob', body: 'hello' },
    ])
    assert.match(two, /2 new PR review comments since last turn:/)
  })

  it('includes path:line for inline review comments', () => {
    const text = formatContext([{
      id: '1',
      kind: 'review_comment',
      author: 'alice',
      path: 'apps/api/src/foo.ts',
      line: 42,
      body: 'fix this',
      url: 'https://github.com/x/y/pull/1#discussion_r1',
    }])
    assert.match(text, /\(apps\/api\/src\/foo\.ts:42\)/)
    assert.match(text, /https:\/\/github\.com\/x\/y\/pull\/1#discussion_r1/)
  })

  it('includes review state when present', () => {
    const text = formatContext([{
      id: '1', kind: 'review', author: 'alice', state: 'CHANGES_REQUESTED', body: 'needs work',
    }])
    assert.match(text, /\[CHANGES_REQUESTED\]/)
  })

  it('clips long bodies to 500 chars', () => {
    const text = formatContext([{ id: '1', author: 'alice', body: 'x'.repeat(1000) }])
    // Bullet is "- @alice: " + body. Body portion must be capped at 500.
    const bodyPart = text.split('@alice: ')[1]
    assert.equal(bodyPart.length, 500)
  })

  it('tolerates missing author', () => {
    const text = formatContext([{ id: '1', body: 'orphan' }])
    assert.match(text, /@unknown:/)
  })
})

describe('mergeRead', () => {
  it('appends new ids and refreshes lastReadAt', () => {
    const before = { ids: ['IC_1'], lastReadAt: '2026-01-01T00:00:00Z' }
    const after = mergeRead(before, [{ id: 'IC_2' }, { id: 'PRRC_1' }])
    assert.deepEqual(after.ids, ['IC_1', 'IC_2', 'PRRC_1'])
    assert.notEqual(after.lastReadAt, before.lastReadAt)
  })

  it('does not mutate the input', () => {
    const before = { ids: ['IC_1'] }
    mergeRead(before, [{ id: 'IC_2' }])
    assert.deepEqual(before.ids, ['IC_1'])
  })

  it('handles null/undefined read state', () => {
    const after = mergeRead(null, [{ id: 'IC_1' }])
    assert.deepEqual(after.ids, ['IC_1'])
  })

  it('skips entries with no id', () => {
    const after = mergeRead({ ids: [] }, [{ body: 'no id' }, { id: 'IC_1' }])
    assert.deepEqual(after.ids, ['IC_1'])
  })
})
