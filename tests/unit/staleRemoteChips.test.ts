import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { RefInfo } from '@angkorgit/core';
import { groupRefs, CommitRow } from '../../apps/desktop/src/features/graph/GraphRow';
import { layoutGraph } from '@angkorgit/core';

const local: RefInfo = { kind: 'localBranch', name: 'refs/heads/topic', shorthand: 'topic' };
const remote = (name: string): RefInfo => ({ kind: 'remoteBranch', name: `refs/remotes/${name}/topic`, shorthand: `${name}/topic` });

describe('remote tracking chips', () => {
  it('keeps a stale remote separate from a live local/remote group on the same commit', () => {
    const stale = remote('upstream');
    const groups = groupRefs([stale, remote('origin'), local], 'topic', new Set([stale.name]));
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ label: 'topic', local: true, remote: true, remoteNames: ['origin/topic'] });
    expect(groups[1]).toMatchObject({ label: 'upstream/topic', local: false, remote: true, stale: true });
  });

  it('keeps different remote names visible and does not infer staleness from separation', () => {
    const groups = groupRefs([remote('origin'), remote('upstream')]);
    expect(groups.map((group) => group.label)).toEqual(['origin/topic', 'upstream/topic']);
    expect(groups.every((group) => !group.stale)).toBe(true);
  });

  it('renders an accessible stale explanation and no lane tint for an expired ref', () => {
    const stale = remote('upstream');
    const commit = {
      oid: 'a'.repeat(40), shortOid: 'aaaaaaa', parents: [], summary: 'commit', body: '',
      author: { name: 'A', email: 'a@example.com', time: 1 },
      committer: { name: 'A', email: 'a@example.com', time: 1 },
      refs: [stale], isHead: false,
    };
    const row = layoutGraph([commit]).rows[0];
    const html = renderToStaticMarkup(createElement(CommitRow, {
      commit, row, gutterWidth: 40, selected: false, staleRemoteRefs: new Set([stale.name]),
      onSelect() {}, onContextMenu() {}, onCheckoutRef() {}, onRefMenu() {}, onResetToRemote() {},
    }));
    expect(html).toContain('过期的远程跟踪分支');
    expect(html).toContain('data-stale-remote-ref="refs/remotes/upstream/topic"');
    expect(html).toContain('cloud-off');
    expect(html).not.toContain('data-lane-chip');
  });
});
