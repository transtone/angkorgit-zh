import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from '../../apps/desktop/node_modules/react';
import { renderToStaticMarkup } from '../../apps/desktop/node_modules/react-dom/server';
import { TagRemoteStatus, tagRemoteSummary } from '../../apps/desktop/src/features/repository/TagRemoteStatus';

const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../../apps/desktop/src/features/repository/store', () => ({
  useRepo: (selector: (value: unknown) => unknown) => selector(state.current),
}));
const remotes = [{ name: 'project', url: '/project' }, { name: 'source', url: '/source' }];
const head = { name: 'main', isHead: true, isRemote: false, upstream: 'source/main' };
const checkedAt = 1_700_000_000_000;
const statuses = {
  project: { checkedAt, error: null, tags: { v1: 'different' as const } },
  source: { checkedAt, error: null, tags: { v1: 'synced' as const } },
};
beforeEach(() => { state.current = { remotes, branches: [head], tagRemoteStatus: statuses }; });

describe('tag remote summary', () => {
  it('uses the first remote for sidebar status without requiring origin', () => {
    expect(tagRemoteSummary('v1', { remotes, tagRemoteStatus: statuses })).toEqual({
      remote: 'project', status: 'different', title: 'v1 · project：与远端不一致；source：已同步',
    });
  });
  it('summarizes the graph push destination independently of ordering', () => {
    expect(tagRemoteSummary('v1', { remotes, tagRemoteStatus: statuses, remoteName: 'source' })).toEqual({
      remote: 'source', status: 'synced', title: 'v1 · source：已同步；project：与远端不一致',
    });
  });
  it('keeps failures unknown without exposing diagnostics', () => {
    const summary = tagRemoteSummary('v1', { remotes, tagRemoteStatus: {
      project: { checkedAt: null, error: 'secret credential detail', tags: { v1: 'synced' } },
    } });
    expect(summary.status).toBe('unknown');
    expect(summary.title).toBe('v1 · project：状态未知；source：状态未知');
    expect(summary.title).not.toContain('secret');
  });
  it('explains missing remotes', () => {
    expect(tagRemoteSummary('v1', { remotes: [], tagRemoteStatus: {} })).toEqual({
      remote: null, status: 'unknown', title: 'v1 · 未配置远端',
    });
  });
});

describe('tag status icon', () => {
  it.each(['synced', 'localOnly', 'different', 'unknown'] as const)('shows a cloud only for confirmed synchronization (%s)', (status) => {
    state.current = { remotes, branches: [head], tagRemoteStatus: {
      source: { checkedAt, error: null, tags: status === 'unknown' ? {} : { v1: status } },
    } };
    const html = renderToStaticMarkup(createElement(TagRemoteStatus, { name: 'v1' }));
    if (status !== 'synced') { expect(html).toBe(''); return; }
    expect(html).toContain('data-tag-remote-status="synced"');
    expect(html).toContain('lucide-cloud');
    expect(html).toContain('title="v1 · source：');
  });
  it('allows sidebar icons to follow its original first-remote destination', () => {
    expect(renderToStaticMarkup(createElement(TagRemoteStatus, { name: 'v1', remoteName: 'project' }))).toBe('');
    expect(renderToStaticMarkup(createElement(TagRemoteStatus, { name: 'v1', remoteName: 'source' }))).toContain('lucide-cloud');
  });
});
