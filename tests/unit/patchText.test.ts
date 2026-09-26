import { describe, expect, it } from 'vitest';
import { hasReviewableText, patchTextOf, patchTextOfAll, type FileDiff } from '@angkorgit/core';

function diffOf(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: 'src/app.ts',
    oldPath: null,
    status: 'modified',
    hunks: [
      {
        header: '@@ -1,3 +1,3 @@',
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [
          { kind: 'context', oldLineNo: 1, newLineNo: 1, content: 'const a = 1;' },
          { kind: 'deletion', oldLineNo: 2, newLineNo: null, content: 'const b = 2;' },
          { kind: 'addition', oldLineNo: null, newLineNo: 2, content: 'const b = 3;' },
          { kind: 'context', oldLineNo: 3, newLineNo: 3, content: 'export { a, b };' },
        ],
      },
    ],
    isBinary: false,
    isImage: false,
    oldImage: null,
    newImage: null,
    additions: 1,
    deletions: 1,
    ...overrides,
  };
}

describe('patchTextOf', () => {
  it('renders file headers, hunk headers and prefixed lines', () => {
    expect(patchTextOf(diffOf())).toBe(
      [
        '--- src/app.ts',
        '+++ src/app.ts',
        '@@ -1,3 +1,3 @@',
        ' const a = 1;',
        '-const b = 2;',
        '+const b = 3;',
        ' export { a, b };',
      ].join('\n'),
    );
  });

  it('names the old path of a rename in the minus header', () => {
    const text = patchTextOf(diffOf({ oldPath: 'src/old.ts', status: 'renamed' }));
    expect(text.startsWith('--- src/old.ts\n+++ src/app.ts\n')).toBe(true);
  });

  it('joins several files with a blank line', () => {
    const text = patchTextOfAll([diffOf(), diffOf({ path: 'b.ts' })]);
    expect(text.split('\n\n')).toHaveLength(2);
    expect(text).toContain('\n\n--- b.ts\n+++ b.ts\n');
  });
});

describe('hasReviewableText', () => {
  it('accepts a text diff with lines', () => {
    expect(hasReviewableText(diffOf())).toBe(true);
  });

  it('rejects null, binary, image and empty diffs', () => {
    expect(hasReviewableText(null)).toBe(false);
    expect(hasReviewableText(diffOf({ isBinary: true }))).toBe(false);
    expect(hasReviewableText(diffOf({ isImage: true }))).toBe(false);
    expect(hasReviewableText(diffOf({ hunks: [] }))).toBe(false);
    expect(hasReviewableText(diffOf({ hunks: [{ ...diffOf().hunks[0], lines: [] }] }))).toBe(false);
  });
});
