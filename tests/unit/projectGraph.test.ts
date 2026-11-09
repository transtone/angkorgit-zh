import { beforeEach, expect, it, vi } from 'vitest';
import type { CommitInfo, HistoryPage } from '@angkorgit/core';

vi.mock('@/core/ipc', () => ({ ipc: { history: vi.fn(), historySearch: vi.fn(), historyPosition: vi.fn() } }));
import { ipc } from '@/core/ipc';
import { useGraph } from '../../apps/desktop/src/features/graph/store';

const graph = () => useGraph.getState();
const commit = (oid: string): CommitInfo => ({
  oid, shortOid: oid, summary: oid, body: '', parents: [], refs: [], isHead: false,
  author: { name: 'Test', email: 'test@example.com', time: 0 },
  committer: { name: 'Test', email: 'test@example.com', time: 0 },
});
const page = (...oids: string[]): HistoryPage => ({ commits: oids.map(commit), hasMore: true });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  graph().forget('/a');
  graph().forget('/b');
  vi.resetAllMocks();
  graph().activate('/a');
});

it('restores repository snapshots synchronously, including selection, filters, find and scroll', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2'));
  await graph().reload('/a');
  graph().select('a1');
  graph().toggleSelect('a2');
  graph().setScrollTop(47);
  graph().setScrollLeft(25);
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2'));
  graph().setFilters('/a', { branch: 'topic' });
  await vi.waitFor(() => expect(graph().loading).toBe(false));
  graph().setScrollTop(47);
  vi.mocked(ipc.historySearch).mockResolvedValue({ matches: [{ oid: 'a2', index: 1 }], truncated: false });
  await graph().setFind('/a', { text: 'a2', author: '' });
  const saved = graph();
  graph().activate('/b');
  expect(graph().commits).toEqual([]);
  expect(graph().scrollTop).toBe(0);
  expect(graph().filters.branch).toBe('');
  expect(graph().layout).not.toBe(saved.layout);
  graph().activate('/a');
  expect(graph().commits).toEqual(saved.commits);
  expect(graph().selectedOids).toEqual(saved.selectedOids);
  expect(graph().find).toEqual(saved.find);
  expect(graph().filters.branch).toBe('topic');
  expect(graph().scrollTop).toBe(47);
  expect(graph().scrollLeft).toBe(25);
});

it('keeps matches-only lists, queries and comparison isolated in repository snapshots', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2'));
  vi.mocked(ipc.historySearch).mockResolvedValue({ matches: [{ oid: 'a2', index: 8 }], truncated: false });
  await graph().reload('/a');
  await graph().setFind('/a', { text: 'a2', author: '' }, -1);
  vi.mocked(ipc.history).mockResolvedValue(page('a2'));
  await graph().setOnlyMatches('/a', true);
  graph().setCompare({ from: 'a1', to: 'a2' });
  const saved = graph();
  graph().activate('/b');
  expect(graph().onlyMatches).toBe(false);
  expect(graph().matchesOnly).toBeNull();
  expect(graph().compare).toBeNull();
  await graph().setOnlyMatches('/a', true);
  expect(graph().onlyMatches).toBe(false);
  graph().activate('/a');
  expect(graph().onlyMatches).toBe(true);
  expect(graph().matchesOnly).toEqual({ search: 'a2', author: undefined });
  expect(graph().compare).toEqual(saved.compare);
  expect(graph().rows).toBe(saved.rows);
  await graph().goToMatch('/a', 0);
  expect(graph().pendingScrollIndex).toBe(0);
  vi.mocked(ipc.history).mockResolvedValue(page('a3'));
  await graph().loadMore('/a');
  expect(ipc.history).toHaveBeenLastCalledWith('/a', {
    skip: 1, limit: 200, branch: undefined, search: 'a2', author: undefined,
  });
  expect(graph().rows.every((row) => row.node.color === 0)).toBe(true);
  graph().forget('/a');
  graph().activate('/a');
  expect(graph().onlyMatches).toBe(false);
  expect(graph().matchesOnly).toBeNull();
  expect(graph().compare).toBeNull();
});

it('keeps cached rows while refreshing, anchors inserted rows and cleans vanished selection', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2', 'a3'));
  await graph().reload('/a');
  graph().setScrollTop(39);
  graph().select('a1');
  graph().toggleSelect('a3');
  const pending = deferred<HistoryPage>();
  vi.mocked(ipc.history).mockReturnValue(pending.promise);
  const refresh = graph().reload('/a');
  expect(graph().loading).toBe(true);
  expect(graph().commits.map((c) => c.oid)).toEqual(['a1', 'a2', 'a3']);
  pending.resolve(page('new', 'a1', 'a2'));
  await refresh;
  expect(graph().scrollTop).toBe(71);
  expect(graph().selectedOids).toEqual(['a1']);
  expect(graph().selectedOid).toBeNull();
  vi.mocked(ipc.history).mockRejectedValue(new Error('offline'));
  await graph().reload('/a');
  expect(graph().commits.map((c) => c.oid)).toEqual(['new', 'a1', 'a2']);
  expect(graph().error).toBe('offline');
});

it('preserves loaded depth on filtered refresh and on cached repository reload', async () => {
  const commits = Array.from({ length: 450 }, (_, i) => commit(`a${i}`));
  vi.mocked(ipc.history).mockResolvedValue({ commits, hasMore: true });
  await graph().reload('/a');
  graph().setFilters('/a', { branch: 'topic' });
  await vi.waitFor(() => expect(graph().loading).toBe(false));
  expect(ipc.history).toHaveBeenLastCalledWith('/a', { skip: 0, limit: 450, branch: 'topic' });
  graph().activate('/b');
  graph().activate('/a');
  await graph().reload('/a');
  expect(ipc.history).toHaveBeenLastCalledWith('/a', { skip: 0, limit: 450, branch: 'topic' });
});

it.each(['resolve', 'reject'] as const)('ignores an old reload after A → B → A (%s)', async (finish) => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1'));
  await graph().reload('/a');
  const pending = deferred<HistoryPage>();
  vi.mocked(ipc.history).mockReturnValue(pending.promise);
  const refresh = graph().reload('/a');
  graph().activate('/b');
  graph().activate('/a');
  if (finish === 'resolve') pending.resolve(page('stale'));
  else pending.reject(new Error('stale error'));
  await refresh;
  expect(graph().commits.map((c) => c.oid)).toEqual(['a1']);
  expect(graph().error).toBeNull();
  expect(graph().loading).toBe(false);
});

it('invalidates pending searches and commit reveals across A → B → A', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2'));
  await graph().reload('/a');
  const search = deferred<Awaited<ReturnType<typeof ipc.historySearch>>>();
  const position = deferred<Awaited<ReturnType<typeof ipc.historyPosition>>>();
  vi.mocked(ipc.historySearch).mockReturnValue(search.promise);
  vi.mocked(ipc.historyPosition).mockReturnValue(position.promise);
  const finding = graph().setFind('/a', { text: 'a2', author: '' });
  const revealing = graph().revealCommit('/a', 'a2');
  graph().activate('/b');
  graph().activate('/a');
  search.resolve({ matches: [{ oid: 'a2', index: 1 }], truncated: false });
  position.resolve({ oid: 'a2', index: 1 });
  expect(await finding).toBeNull();
  expect(await revealing).toBe(false);
  expect(graph().selectedOid).toBeNull();
  expect(graph().find?.loading).toBe(false);
});

it('invalidates pending pagination without mutating another repository layout', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1'));
  await graph().reload('/a');
  const layout = graph().layout;
  const pending = deferred<HistoryPage>();
  vi.mocked(ipc.history).mockReturnValue(pending.promise);
  const loading = graph().loadMore('/a');
  graph().activate('/b');
  graph().activate('/a');
  pending.resolve(page('stale'));
  await loading;
  expect(graph().layout).toBe(layout);
  expect(layout.rowCount).toBe(1);
  expect(graph().rows).toHaveLength(1);
});

it('restarts an interrupted cached search on refresh without stealing selection', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2'));
  await graph().reload('/a');
  const pending = deferred<Awaited<ReturnType<typeof ipc.historySearch>>>();
  vi.mocked(ipc.historySearch).mockReturnValueOnce(pending.promise);
  const finding = graph().setFind('/a', { text: 'a2', author: '' });
  graph().activate('/b');
  graph().activate('/a');
  graph().select('a1');
  vi.mocked(ipc.historySearch).mockResolvedValue({ matches: [{ oid: 'a2', index: 1 }], truncated: false });
  await graph().reload('/a');
  await vi.waitFor(() => expect(graph().find?.matches).toEqual([{ oid: 'a2', index: 1 }]));
  expect(graph().selectedOid).toBe('a1');
  pending.resolve({ matches: [], truncated: false });
  await finding;
  expect(graph().find?.matches).toHaveLength(1);
});

it('does not let a late operation reload another project or reopen a closed graph', async () => {
  graph().activate('/b');
  await graph().reload('/a');
  expect(graph().lastPath).toBe('/b');
  expect(ipc.history).not.toHaveBeenCalled();
  graph().forget('/b');
  await graph().reload('/b');
  expect(graph().lastPath).toBeNull();
  expect(ipc.history).not.toHaveBeenCalled();
});

it('forgets inactive snapshots and clears an active repository, invalidating its requests', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1'));
  await graph().reload('/a');
  graph().activate('/b');
  graph().forget('/a');
  expect(graph().lastPath).toBe('/b');
  graph().activate('/a');
  expect(graph().commits).toEqual([]);
  const pending = deferred<HistoryPage>();
  vi.mocked(ipc.history).mockReturnValue(pending.promise);
  const refresh = graph().reload('/a');
  graph().forget('/a');
  expect(graph().lastPath).toBeNull();
  graph().activate('/a');
  pending.resolve(page('stale'));
  await refresh;
  expect(graph().commits).toEqual([]);
});

it.each([false, true])('lands a changed matches-only search after its relist (user selects during reload: %s)', async (selectDuringReload) => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2', 'a3'));
  vi.mocked(ipc.historySearch).mockResolvedValue({ matches: [{ oid: 'a1', index: 0 }, { oid: 'a3', index: 2 }], truncated: false });
  await graph().reload('/a');
  await graph().setFind('/a', { text: 'a1', author: '' });
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a3'));
  await graph().setOnlyMatches('/a', true);

  const search = deferred<Awaited<ReturnType<typeof ipc.historySearch>>>();
  const listing = deferred<HistoryPage>();
  vi.mocked(ipc.historySearch).mockReturnValueOnce(search.promise);
  vi.mocked(ipc.history).mockReturnValueOnce(listing.promise);
  const finding = graph().setFind('/a', { text: 'new', author: '' });
  search.resolve({ matches: [{ oid: 'a2', index: 800 }, { oid: 'a3', index: 900 }], truncated: false });
  await vi.waitFor(() => expect(ipc.history).toHaveBeenLastCalledWith('/a', {
    skip: 0, limit: 200, branch: undefined, search: 'new', author: undefined,
  }));
  if (selectDuringReload) graph().select('a3');
  listing.resolve(page('a2', 'a3'));
  expect(await finding).toBe(selectDuringReload ? null : 'a2');
  expect(graph().selectedOid).toBe(selectDuringReload ? 'a3' : 'a2');
  expect(graph().find?.active).toBe(selectDuringReload ? 1 : 0);
  if (!selectDuringReload) expect(graph().pendingScrollIndex).toBe(0);
});

it('reveals a deep selected match when turning matches-only off', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2'));
  vi.mocked(ipc.historySearch).mockResolvedValue({ matches: [{ oid: 'a2', index: 800 }], truncated: false });
  await graph().reload('/a');
  await graph().setFind('/a', { text: 'a2', author: '' }, -1);
  graph().select('a2');
  vi.mocked(ipc.history).mockResolvedValue(page('a2'));
  await graph().setOnlyMatches('/a', true);
  const listing = deferred<HistoryPage>();
  const position = deferred<Awaited<ReturnType<typeof ipc.historyPosition>>>();
  const more = deferred<HistoryPage>();
  vi.mocked(ipc.history).mockReturnValueOnce(listing.promise).mockReturnValueOnce(more.promise);
  vi.mocked(ipc.historyPosition).mockReturnValueOnce(position.promise);
  const toggling = graph().setOnlyMatches('/a', false);
  listing.resolve(page('a1'));
  await vi.waitFor(() => expect(ipc.historyPosition).toHaveBeenCalledWith('/a', 'a2'));
  position.resolve({ oid: 'a2', index: 800 });
  await vi.waitFor(() => expect(ipc.history).toHaveBeenLastCalledWith('/a', {
    skip: 1, limit: 999, branch: undefined,
  }));
  more.resolve({ commits: [...Array.from({ length: 799 }, (_, i) => commit(`f${i}`)), commit('a2')], hasMore: true });
  await toggling;
  expect(graph().selectedOid).toBe('a2');
  expect(graph().pendingScrollIndex).toBe(800);
  expect(graph().matchesOnly).toBeNull();
});

it('does not continue an old matches-only toggle after A → B → A', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1', 'a2'));
  vi.mocked(ipc.historySearch).mockResolvedValue({ matches: [{ oid: 'a2', index: 1 }], truncated: false });
  await graph().reload('/a');
  await graph().setFind('/a', { text: 'a2', author: '' });
  const listing = deferred<HistoryPage>();
  vi.mocked(ipc.history).mockReturnValueOnce(listing.promise);
  const toggling = graph().setOnlyMatches('/a', true);
  graph().activate('/b');
  graph().activate('/a');
  graph().clearPendingScroll();
  listing.resolve(page('a2'));
  await toggling;
  expect(graph().commits.map((c) => c.oid)).toEqual(['a1', 'a2']);
  expect(graph().onlyMatches).toBe(true);
  expect(graph().matchesOnly).toBeNull();
  expect(graph().pendingScrollIndex).toBeNull();
  expect(ipc.historyPosition).not.toHaveBeenCalled();
});

it('preserves a cached comparison whose endpoints are outside the refreshed page', async () => {
  vi.mocked(ipc.history).mockResolvedValue(page('a1'));
  await graph().reload('/a');
  graph().setCompare({ from: 'old-base', to: 'deep-tip' });
  graph().activate('/b');
  graph().activate('/a');
  const listing = deferred<HistoryPage>();
  vi.mocked(ipc.history).mockReturnValueOnce(listing.promise);
  const refresh = graph().reload('/a');
  expect(graph().compare).toEqual({ from: 'old-base', to: 'deep-tip' });
  listing.resolve(page('new', 'a1'));
  await refresh;
  expect(graph().compare).toEqual({ from: 'old-base', to: 'deep-tip' });
});
