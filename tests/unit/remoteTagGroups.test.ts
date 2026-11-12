import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { layoutGraph, type CommitInfo, type RefInfo } from '@angkorgit/core';
import { CommitRow, groupRefs } from '../../apps/desktop/src/features/graph/GraphRow';

const local: RefInfo = { kind: 'tag', name: 'refs/tags/v0.27.0', shorthand: 'v0.27.0' };
const remote = (name: string): RefInfo => ({
  kind: 'remoteTag', remote: name, name: `refs/angkorgit/remote-tags/${name}/tags/v0.27.0`, shorthand: 'v0.27.0',
});
const markup = (refs: RefInfo[]) => {
  const commit: CommitInfo = {
    oid: 'a'.repeat(40), shortOid: 'aaaaaaa', parents: [], summary: 'commit', body: '',
    author: { name: 'A', email: 'a@example.com', time: 1 },
    committer: { name: 'A', email: 'a@example.com', time: 1 }, refs, isHead: false,
  };
  return renderToStaticMarkup(createElement(CommitRow, {
    commit, row: layoutGraph([commit]).rows[0], gutterWidth: 40, selected: false,
    onSelect() {}, onContextMenu() {}, onCheckoutRef() {}, onRefMenu() {}, onResetToRemote() {},
  }));
};

describe('tags grouped by commit and name', () => {
  it('shows one cloud icon for merged remote sources without a local icon', () => {
    for (const refs of [[local, remote('upstream'), remote('origin')], [remote('origin'), remote('upstream'), local]]) {
      const groups = groupRefs(refs);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ primary: local, tagLocal: true, tagRemotes: ['origin', 'upstream'] });
      const html = markup(refs);
      expect(html).not.toContain('lucide-monitor');
      expect(html.match(/lucide-cloud/g)).toHaveLength(1);
      expect(html).toContain('title="v0.27.0 · 本地、origin、upstream"');
    }
  });

  it('shows a cloud without a local icon for remote-only tags', () => {
    const html = markup([remote('origin'), remote('upstream')]);
    expect(html.match(/lucide-cloud/g)).toHaveLength(1);
    expect(html).not.toContain('lucide-monitor');
    expect(html).toContain('title="v0.27.0 · origin、upstream"');
  });

  it('keeps identical names visible independently on different commits', () => {
    const upper = groupRefs([local, remote('origin')]);
    const lower = groupRefs([remote('upstream')]);
    expect(upper).toHaveLength(1);
    expect(lower).toHaveLength(1);
    expect(upper[0].tagRemotes).toEqual(['origin']);
    expect(lower[0]).toMatchObject({ label: 'v0.27.0', tagLocal: false, tagRemotes: ['upstream'] });
  });

  it('does not show a local icon for a local-only tag', () => {
    const html = markup([local]);
    expect(html).not.toContain('lucide-monitor');
    expect(html).not.toContain('lucide-cloud');
  });
});
