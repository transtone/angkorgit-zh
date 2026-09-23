import { describe, expect, it } from 'vitest';
import { allFiles, foldersWithChanges } from '@angkorgit/core';

interface Change {
  path: string;
  status: string;
}

const pathOf = (change: Change) => change.path;

describe('allFiles', () => {
  it('marks every tree path with its change and leaves the rest plain', () => {
    const entries = allFiles(
      ['README.md', 'src/a.ts', 'src/b.ts'],
      [{ path: 'src/b.ts', status: 'modified' }],
      pathOf,
    );
    expect(entries).toEqual([
      { path: 'README.md', change: null },
      { path: 'src/a.ts', change: null },
      { path: 'src/b.ts', change: { path: 'src/b.ts', status: 'modified' } },
    ]);
  });

  it('keeps deleted files that are no longer in the tree', () => {
    const entries = allFiles(['src/a.ts'], [{ path: 'src/gone.ts', status: 'deleted' }], pathOf);
    expect(entries.map((e) => e.path)).toEqual(['src/a.ts', 'src/gone.ts']);
    expect(entries[1].change?.status).toBe('deleted');
  });

  it('never lists a path twice', () => {
    const entries = allFiles(['a.ts', 'a.ts'], [{ path: 'a.ts', status: 'new' }], pathOf);
    expect(entries).toHaveLength(1);
  });
});

describe('foldersWithChanges', () => {
  it('returns every ancestor folder of a changed file and nothing for plain ones', () => {
    const entries = allFiles(
      ['docs/guide.md', 'src/features/graph/store.ts', 'src/core/ipc.ts'],
      [{ path: 'src/features/graph/store.ts', status: 'modified' }],
      pathOf,
    );
    expect([...foldersWithChanges(entries)].sort()).toEqual(['src', 'src/features', 'src/features/graph']);
  });

  it('is empty when nothing changed', () => {
    expect(foldersWithChanges(allFiles(['a/b.ts'], [], pathOf)).size).toBe(0);
  });
});
