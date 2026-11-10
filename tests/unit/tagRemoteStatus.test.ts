import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from '../../apps/desktop/node_modules/react';
import { renderToStaticMarkup } from '../../apps/desktop/node_modules/react-dom/server';
import type { BranchInfo, RemoteInfo } from '@angkorgit/core';
import { TagRemoteStatus, tagRemoteSummary } from '../../apps/desktop/src/features/repository/TagRemoteStatus';

const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../../apps/desktop/src/features/repository/store', () => ({
  useRepo: (selector: (value: unknown) => unknown) => selector(state.current),
}));

const remotes: RemoteInfo[] = [
  { name: 'backup', url: '/backup' },
  { name: 'origin', url: '/origin' },
];
const head: BranchInfo = {
  name: 'main', isHead: true, isRemote: false, upstream: 'backup/main',
  ahead: 0, behind: 0, targetOid: 'a'.repeat(40),
};
const checkedAt = 1_700_000_000_000;
const statuses = {
  backup: { checkedAt, error: null, tags: { v1: 'different' as const } },
  origin: { checkedAt, error: null, tags: { v1: 'synced' as const } },
};

beforeEach(() => {
  state.current = { remotes, branches: [head], tagRemoteStatus: statuses };
});

describe('tag remote summary', () => {
  it('picks HEAD upstream and lists every remote with its check time', () => {
    const summary = tagRemoteSummary('v1', { remotes, branches: [head], tagRemoteStatus: statuses });
    expect(summary).toMatchObject({ remote: 'backup', status: 'different' });
    expect(summary.title).toContain('v1 · backup: 与远端不一致');
    expect(summary.title).toContain('v1 · origin: 已同步');
    expect(summary.title).toContain(new Date(checkedAt).toLocaleString());
  });

  it('uses origin before the first remote when HEAD has no upstream', () => {
    expect(tagRemoteSummary('v1', { remotes, branches: [], tagRemoteStatus: statuses }))
      .toMatchObject({ remote: 'origin', status: 'synced' });
  });

  it('keeps failed, unchecked and missing tag results unknown without leaking errors', () => {
    const summary = tagRemoteSummary('v1', {
      remotes, branches: [head], tagRemoteStatus: {
        backup: { checkedAt: null, error: 'secret credential detail', tags: { v1: 'synced' } },
      },
    });
    expect(summary.status).toBe('unknown');
    expect(summary.title).toContain('backup: 状态未知（查询失败）');
    expect(summary.title).toContain('origin: 状态未知（未检查）');
    expect(summary.title).not.toContain('secret');
    expect(tagRemoteSummary('missing', { remotes, branches: [], tagRemoteStatus: statuses }).status).toBe('unknown');
  });

  it('explains missing remotes', () => {
    expect(tagRemoteSummary('v1', { remotes: [], branches: [], tagRemoteStatus: {} }))
      .toEqual({ remote: null, status: 'unknown', title: 'v1 · 未配置远端' });
  });
});

describe('tag status icon', () => {
  it.each([
    ['synced', 'cloud'], ['localOnly', 'monitor'], ['different', 'triangle-alert'], ['unknown', 'circle-help'],
  ] as const)('renders %s with an accessible explanation', (status, icon) => {
    state.current = {
      remotes, branches: [head], tagRemoteStatus: {
        backup: { checkedAt, error: null, tags: status === 'unknown' ? {} : { v1: status } },
      },
    };
    const html = renderToStaticMarkup(createElement(TagRemoteStatus, { name: 'v1', className: 'custom' }));
    expect(html).toContain(`data-tag-remote-status="${status}"`);
    expect(html).toContain('data-tag-remote="v1"');
    expect(html).toContain(`lucide-${icon}`);
    expect(html).toContain('aria-label="v1 · 状态图标对应远端：backup');
    expect(html).toContain('title="v1 · 状态图标对应远端：backup');
    expect(html).toContain('custom');
    if (status === 'different') expect(html).toContain('text-amber-500');
  });
});
