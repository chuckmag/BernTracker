import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseRepoFromPrUrl,
  normalizeFeedback,
  diffNew,
  mergeSeen,
} from '../lib/pr-feedback.mjs'

describe('parseRepoFromPrUrl', () => {
  it('extracts owner and repo from a standard PR URL', () => {
    assert.deepEqual(
      parseRepoFromPrUrl('https://github.com/chuckmag/WODalytics/pull/447'),
      { owner: 'chuckmag', repo: 'WODalytics' },
    )
  })

  it('returns null for non-PR URLs', () => {
    assert.equal(parseRepoFromPrUrl('https://github.com/chuckmag/WODalytics'), null)
    assert.equal(parseRepoFromPrUrl('not a url'), null)
  })
})

describe('normalizeFeedback', () => {
  it('flattens the three GitHub shapes into a single list', () => {
    const got = normalizeFeedback({
      issueComments: [
        { id: 'IC_1', author: { login: 'alice' }, body: 'top-level', createdAt: '2026-05-20T00:00:00Z', url: 'u1' },
      ],
      reviews: [
        { id: 'PRR_1', author: { login: 'bob' }, body: 'review body', state: 'COMMENTED', submittedAt: '2026-05-20T00:01:00Z', url: 'u2' },
      ],
      reviewComments: [
        { id: 9001, user: { login: 'carol' }, body: 'inline', path: 'src/x.ts', line: 12, created_at: '2026-05-20T00:02:00Z', html_url: 'u3' },
      ],
    })
    assert.equal(got.length, 3)
    assert.deepEqual(got.map(e => e.kind), ['issue_comment', 'review', 'review_comment'])
    assert.equal(got[2].id, '9001')   // numeric IDs become strings
    assert.equal(got[2].path, 'src/x.ts')
    assert.equal(got[2].line, 12)
  })

  it('drops reviews whose body is empty (APPROVED with no comment is noise)', () => {
    const got = normalizeFeedback({
      reviews: [
        { id: 'PRR_x', author: { login: 'bob' }, body: '', state: 'APPROVED' },
        { id: 'PRR_y', author: { login: 'bob' }, body: '   ', state: 'APPROVED' },
        { id: 'PRR_z', author: { login: 'bob' }, body: 'real text', state: 'COMMENTED' },
      ],
    })
    assert.equal(got.length, 1)
    assert.equal(got[0].id, 'PRR_z')
  })

  it('tolerates missing optional fields', () => {
    const got = normalizeFeedback({
      issueComments: [{ id: 'IC_2' }],
      reviewComments: [{ id: 'PRRC_2', body: 'hi' }],
    })
    assert.equal(got.length, 2)
    assert.equal(got[0].author, 'unknown')
    assert.equal(got[1].path, null)
  })

  it('skips entries with no id', () => {
    const got = normalizeFeedback({
      issueComments: [{ body: 'orphan' }, { id: 'IC_3', body: 'ok' }],
    })
    assert.equal(got.length, 1)
    assert.equal(got[0].id, 'IC_3')
  })
})

describe('diffNew', () => {
  const seen = {
    issueComments: ['IC_1'],
    reviews: ['PRR_1'],
    reviewComments: ['PRRC_1'],
  }
  const entries = [
    { kind: 'issue_comment', id: 'IC_1' },
    { kind: 'issue_comment', id: 'IC_2' },
    { kind: 'review', id: 'PRR_1' },
    { kind: 'review', id: 'PRR_2' },
    { kind: 'review_comment', id: 'PRRC_2' },
  ]

  it('returns only entries whose IDs are absent from the matching bucket', () => {
    const fresh = diffNew(entries, seen)
    assert.deepEqual(
      fresh.map(e => e.id),
      ['IC_2', 'PRR_2', 'PRRC_2'],
    )
  })

  it('treats an empty seen state as nothing-seen', () => {
    const fresh = diffNew(entries, null)
    assert.equal(fresh.length, entries.length)
  })
})

describe('mergeSeen', () => {
  it('adds new IDs to the right bucket and preserves seededAt', () => {
    const before = {
      issueComments: ['IC_1'],
      reviews: [],
      reviewComments: [],
      seededAt: '2026-01-01T00:00:00Z',
    }
    const after = mergeSeen(before, [
      { kind: 'issue_comment', id: 'IC_2' },
      { kind: 'review', id: 'PRR_1' },
      { kind: 'review_comment', id: 'PRRC_1' },
    ])
    assert.deepEqual(after.issueComments, ['IC_1', 'IC_2'])
    assert.deepEqual(after.reviews, ['PRR_1'])
    assert.deepEqual(after.reviewComments, ['PRRC_1'])
    assert.equal(after.seededAt, '2026-01-01T00:00:00Z')
  })

  it('does not mutate the input', () => {
    const before = { issueComments: ['IC_1'], reviews: [], reviewComments: [] }
    mergeSeen(before, [{ kind: 'issue_comment', id: 'IC_2' }])
    assert.deepEqual(before.issueComments, ['IC_1'])
  })
})
