import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
      remote: 'project', status: 'different', title: '与远端未同步',
    });
  });
  it('summarizes the graph push destination independently of ordering', () => {
    expect(tagRemoteSummary('v1', { remotes, tagRemoteStatus: statuses, remoteName: 'source' })).toEqual({
      remote: 'source', status: 'synced', title: '与远端已同步',
    });
  });
  it('keeps failures unknown without exposing diagnostics', () => {
    const summary = tagRemoteSummary('v1', { remotes, tagRemoteStatus: {
      project: { checkedAt: null, error: 'secret credential detail', tags: { v1: 'synced' } },
    } });
    expect(summary.status).toBe('unknown');
    expect(summary.title).toBe('与远端未同步');
    expect(summary.title).not.toContain('secret');
  });
  it('explains missing remotes', () => {
    expect(tagRemoteSummary('v1', { remotes: [], tagRemoteStatus: {} })).toEqual({
      remote: null, status: 'unknown', title: '与远端未同步',
    });
  });
});

describe('tag status icon', () => {
  it.each(['synced', 'localOnly', 'different', 'unknown'] as const)('shows local status and a cloud only when the remote exists (%s)', (status) => {
    state.current = { remotes, branches: [head], tagRemoteStatus: {
      source: { checkedAt, error: null, tags: status === 'unknown' ? {} : { v1: status } },
    } };
    const html = renderToStaticMarkup(createElement(TagRemoteStatus, { name: 'v1' }));
    expect(html).toContain(`data-tag-remote-status="${status}"`);
    expect(html).not.toContain('lucide-monitor');
    if (status === 'unknown' || status === 'localOnly') expect(html).not.toContain('lucide-cloud');
    else expect(html).toContain('lucide-cloud');
    expect(html).toContain(status === 'synced' ? 'title="与远端已同步"' : 'title="与远端未同步"');
  });
  it('allows sidebar icons to follow its selected remote destination', () => {
    const projectHtml = renderToStaticMarkup(createElement(TagRemoteStatus, { name: 'v1', remoteName: 'project' }));
    expect(projectHtml).not.toContain('lucide-monitor');
    expect(projectHtml).toContain('lucide-cloud');
    expect(renderToStaticMarkup(createElement(TagRemoteStatus, { name: 'v1', remoteName: 'source' }))).toContain('lucide-cloud');
  });
});
