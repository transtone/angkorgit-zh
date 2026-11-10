import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchInfo, RemoteInfo, RemoteRefStatus, RepositoryInfo, TagInfo, TagRemoteState } from '@angkorgit/core';

const mocks = vi.hoisted(() => ({
  openRepository: vi.fn(), repoInfo: vi.fn(), status: vi.fn(), branches: vi.fn(),
  tags: vi.fn(), stashes: vi.fn(), remotes: vi.fn(), submodules: vi.fn(), conflicts: vi.fn(),
  worktrees: vi.fn(), unpushedCommits: vi.fn(), configGet: vi.fn(), recentRepositories: vi.fn(), addRecents: vi.fn(),
  remoteRefStatus: vi.fn(), pullPreview: vi.fn(),
  activate: vi.fn(), forget: vi.fn(), addRepoTab: vi.fn(), markWorktreeTab: vi.fn(),
}));
vi.mock('@/core/ipc', () => ({ ipc: mocks }));
vi.mock('@/features/graph/store', () => ({ useGraph: { getState: () => mocks } }));
vi.mock('@/features/ui/store', () => ({ useUi: { getState: () => mocks } }));
import { useRepo } from '../../apps/desktop/src/features/repository/store';

const info = (path: string) => ({ path, name: path, headBranch: 'main' } as RepositoryInfo);
const branch = (name: string, targetOid = 'one'): BranchInfo => ({
  name, targetOid, isRemote: true, isHead: false, upstream: null, ahead: 0, behind: 0,
});
const remote = (name: string, url = name): RemoteInfo => ({ name, url });
const result = (staleRefs: string[] = [], status: TagRemoteState = 'synced'): RemoteRefStatus => ({
  staleRefs, tags: [{ name: 'v1', status }],
});
const tag = (overrides: Partial<TagInfo> = {}): TagInfo => ({
  name: 'v1', targetOid: 'one', message: null, isAnnotated: false, ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const stale = () => [...useRepo.getState().staleRemoteRefs].sort();

afterEach(async () => { await vi.dynamicImportSettled(); });
beforeEach(() => {
  useRepo.getState().close();
  vi.resetAllMocks();
  mocks.openRepository.mockImplementation(async (path) => info(path));
  mocks.repoInfo.mockImplementation(async (path) => info(path));
  mocks.status.mockResolvedValue(null);
  for (const name of ['tags', 'stashes', 'submodules', 'conflicts', 'worktrees', 'unpushedCommits', 'recentRepositories', 'addRecents'] as const) {
    mocks[name].mockResolvedValue([]);
  }
  mocks.branches.mockResolvedValue([branch('origin/gone'), branch('origin/live')]);
  mocks.remotes.mockResolvedValue([remote('origin')]);
  mocks.configGet.mockResolvedValue(null);
  mocks.pullPreview.mockResolvedValue(null);
  mocks.remoteRefStatus.mockResolvedValue(result(['refs/remotes/origin/gone']));
});

describe('stale remote tracking refs', () => {
  it('checks in the background on open and retains only existing full tracking refs', async () => {
    const pending = deferred<RemoteRefStatus>();
    mocks.remoteRefStatus.mockReturnValueOnce(pending.promise);
    await useRepo.getState().open('A');
    expect(mocks.remoteRefStatus).toHaveBeenCalledWith('A', 'origin');
    expect(useRepo.getState().refreshing).toBe(false);
    expect(stale()).toEqual([]);
    expect(useRepo.getState().tagRemoteStatus.origin).toEqual({ checkedAt: null, error: null, tags: {} });
    const startedAt = Date.now();
    pending.resolve(result(['refs/remotes/origin/gone', 'refs/heads/main', 'origin/live', 'refs/remotes/origin/absent']));
    await vi.waitFor(() => expect(stale()).toEqual(['refs/remotes/origin/gone']));
    expect(useRepo.getState().tagRemoteStatus.origin).toEqual({
      checkedAt: expect.any(Number), error: null, tags: { v1: 'synced' },
    });
    expect(useRepo.getState().tagRemoteStatus.origin.checkedAt).toBeGreaterThanOrEqual(startedAt);
  });

  it('deduplicates filesystem refreshes and unordered refs but rechecks URL, OID and fetch changes', async () => {
    await useRepo.getState().open('A');
    await useRepo.getState().refresh();
    mocks.branches.mockResolvedValue([branch('origin/live'), branch('origin/gone')]);
    await useRepo.getState().refresh();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(1);
    mocks.branches.mockResolvedValue([branch('origin/live'), branch('origin/gone', 'two')]);
    await useRepo.getState().refresh();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(2);
    mocks.remotes.mockResolvedValue([remote('origin', 'new-url')]);
    await useRepo.getState().refresh();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(3);
    await vi.dynamicImportSettled();
    useRepo.getState().markFetched();
    useRepo.getState().markFetched();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(4);
    await useRepo.getState().refresh();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(4);
    await useRepo.getState().checkStaleRemoteRefs();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(5);
    useRepo.getState().markFetched();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(6);
  });

  it('rechecks added, changed and removed local tags while ignoring tag order', async () => {
    mocks.tags.mockResolvedValue([tag(), tag({ name: 'v2' })]);
    await useRepo.getState().open('A');
    mocks.tags.mockResolvedValue([tag({ name: 'v2' }), tag()]);
    await useRepo.getState().refresh();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(1);
    for (const changed of [
      tag({ targetOid: 'two' }),
      tag({ targetOid: 'two', message: 'release' }),
      tag({ targetOid: 'two', message: 'release', isAnnotated: true }),
      tag({ targetOid: 'two', message: 'release', isAnnotated: true, refOid: 'tag-object-one' }),
      tag({ targetOid: 'two', message: 'release', isAnnotated: true, refOid: 'tag-object-two' }),
    ]) {
      mocks.tags.mockResolvedValue([changed, tag({ name: 'v2' })]);
      await useRepo.getState().refresh();
    }
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(6);
    mocks.tags.mockResolvedValue([tag({ name: 'v2' })]);
    await useRepo.getState().refresh();
    mocks.tags.mockResolvedValue([tag({ name: 'v2' }), tag({ name: 'v3' })]);
    await useRepo.getState().refresh();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(8);
  });

  it('retains failed remote stale evidence while clearing its tag classification', async () => {
    mocks.remotes.mockResolvedValue([remote('origin'), remote('upstream')]);
    mocks.branches.mockResolvedValue([branch('origin/gone'), branch('upstream/gone')]);
    mocks.remoteRefStatus.mockImplementation(async (_path, name) => result([`refs/remotes/${name}/gone`]));
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(stale()).toHaveLength(2));
    mocks.remoteRefStatus.mockImplementation(async (_path, name) => {
      if (name === 'origin') throw new Error('offline');
      return result(['refs/remotes/upstream/gone'], 'different');
    });
    await expect(useRepo.getState().checkStaleRemoteRefs()).resolves.toBeUndefined();
    expect(stale()).toEqual(['refs/remotes/origin/gone', 'refs/remotes/upstream/gone']);
    expect(useRepo.getState().tagRemoteStatus).toEqual({
      origin: { checkedAt: null, error: 'offline', tags: {} },
      upstream: { checkedAt: expect.any(Number), error: null, tags: { v1: 'different' } },
    });
  });

  it('keeps displayed evidence during repeated background checks and publishes fast remotes first', async () => {
    mocks.remotes.mockResolvedValue([remote('origin'), remote('upstream')]);
    mocks.branches.mockResolvedValue([branch('origin/gone'), branch('upstream/gone')]);
    mocks.remoteRefStatus.mockImplementation(async (_path, name) => result([`refs/remotes/${name}/gone`]));
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(stale()).toHaveLength(2));
    const savedTags = useRepo.getState().tagRemoteStatus;
    const slow = deferred<RemoteRefStatus>();
    const fast = deferred<RemoteRefStatus>();
    mocks.remoteRefStatus.mockImplementation((_path, name) => name === 'origin' ? slow.promise : fast.promise);
    useRepo.getState().markFetched();
    useRepo.getState().markFetched();
    await useRepo.getState().refresh();
    expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(4);
    expect(stale()).toEqual(['refs/remotes/origin/gone', 'refs/remotes/upstream/gone']);
    expect(useRepo.getState().tagRemoteStatus).toEqual(savedTags);
    fast.resolve(result([], 'different'));
    await vi.waitFor(() => expect(useRepo.getState().tagRemoteStatus.upstream.tags.v1).toBe('different'));
    expect(stale()).toEqual(['refs/remotes/origin/gone']);
    expect(useRepo.getState().tagRemoteStatus.origin).toEqual(savedTags.origin);
    slow.resolve(result());
    await vi.waitFor(() => expect(stale()).toEqual([]));
  });

  it('retains only confirmed stale refs on failure with custom overlapping fetch destinations', async () => {
    mocks.remotes.mockResolvedValue([remote('origin'), remote('upstream')]);
    mocks.branches.mockResolvedValue([branch('custom/gone'), branch('custom/live')]);
    mocks.remoteRefStatus.mockImplementation(async (_path, name) => result(
      name === 'origin' ? ['refs/remotes/custom/gone'] : [],
    ));
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(stale()).toEqual(['refs/remotes/custom/gone']));
    mocks.remoteRefStatus.mockImplementation(async (_path, name) => {
      if (name === 'origin') throw new Error('offline');
      return result();
    });
    await useRepo.getState().checkStaleRemoteRefs();
    expect(stale()).toEqual(['refs/remotes/custom/gone']);
    expect(useRepo.getState().tagRemoteStatus.origin.tags).toEqual({});
    mocks.branches.mockResolvedValue([branch('custom/live')]);
    await useRepo.getState().refresh();
    expect(stale()).toEqual([]);
  });

  it('invalidates previous evidence for a changed remote URL while a check is pending', async () => {
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(stale()).toHaveLength(1));
    const pending = deferred<RemoteRefStatus>();
    mocks.remoteRefStatus.mockReturnValueOnce(pending.promise);
    mocks.remotes.mockResolvedValue([remote('origin', 'new-url')]);
    await useRepo.getState().refresh();
    expect(stale()).toEqual([]);
    expect(useRepo.getState().tagRemoteStatus.origin.tags).toEqual({});
    pending.resolve(result());
    await pending.promise;
  });

  it('retains stale evidence across changed branch OIDs until fresh results arrive', async () => {
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(stale()).toEqual(['refs/remotes/origin/gone']));
    const pending = deferred<RemoteRefStatus>();
    mocks.remoteRefStatus.mockReturnValueOnce(pending.promise);
    mocks.branches.mockResolvedValue([branch('origin/gone', 'two'), branch('origin/live')]);
    await useRepo.getState().refresh();
    expect(stale()).toEqual(['refs/remotes/origin/gone']);
    pending.resolve(result());
    await vi.waitFor(() => expect(stale()).toEqual([]));
  });

  it('caches tag evidence for the selected repository and clears it for removed remotes', async () => {
    mocks.remoteRefStatus.mockImplementation(async (path) => result(
      path === 'A' ? ['refs/remotes/origin/gone'] : [], path === 'A' ? 'localOnly' : 'different',
    ));
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(useRepo.getState().tagRemoteStatus.origin.tags.v1).toBe('localOnly'));
    const saved = useRepo.getState().tagRemoteStatus;
    const savedEvidence = useRepo.getState().remoteRefEvidence;
    await useRepo.getState().open('B');
    await vi.waitFor(() => expect(useRepo.getState().tagRemoteStatus.origin.tags.v1).toBe('different'));
    const refresh = deferred<TagInfo[]>();
    mocks.tags.mockReturnValueOnce(refresh.promise);
    await useRepo.getState().open('A');
    expect(useRepo.getState().repo?.path).toBe('A');
    expect(useRepo.getState().tagRemoteStatus).toBe(saved);
    expect(useRepo.getState().remoteRefEvidence).toBe(savedEvidence);
    expect(stale()).toEqual(['refs/remotes/origin/gone']);
    mocks.remotes.mockResolvedValue([]);
    refresh.resolve([]);
    await useRepo.getState().refresh();
    expect(useRepo.getState().tagRemoteStatus).toEqual({});
    expect(useRepo.getState().remoteRefEvidence).toEqual({});
    expect(stale()).toEqual([]);
  });

  it('ignores a late result after A → B → A', async () => {
    const pending = deferred<RemoteRefStatus>();
    mocks.remoteRefStatus.mockReturnValueOnce(pending.promise);
    await useRepo.getState().open('A');
    mocks.remoteRefStatus.mockResolvedValue(result());
    await useRepo.getState().open('B');
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(mocks.remoteRefStatus).toHaveBeenCalledTimes(3));
    pending.resolve(result(['refs/remotes/origin/gone'], 'localOnly'));
    await pending.promise;
    expect(stale()).toEqual([]);
    expect(useRepo.getState().tagRemoteStatus.origin.tags).toEqual({ v1: 'synced' });
  });

  it('ignores older checks for the same repository and results after close', async () => {
    await useRepo.getState().open('A');
    const pending = deferred<RemoteRefStatus>();
    mocks.remoteRefStatus.mockReturnValueOnce(pending.promise);
    const old = useRepo.getState().checkStaleRemoteRefs();
    mocks.remoteRefStatus.mockResolvedValue(result());
    await useRepo.getState().checkStaleRemoteRefs();
    pending.resolve(result(['refs/remotes/origin/gone'], 'localOnly'));
    await old;
    expect(stale()).toEqual([]);
    expect(useRepo.getState().tagRemoteStatus.origin.tags).toEqual({ v1: 'synced' });
    const closing = deferred<RemoteRefStatus>();
    mocks.remoteRefStatus.mockReturnValueOnce(closing.promise);
    const check = useRepo.getState().checkStaleRemoteRefs();
    useRepo.getState().close();
    closing.resolve(result(['refs/remotes/origin/gone']));
    await check;
    expect(stale()).toEqual([]);
    expect(useRepo.getState().tagRemoteStatus).toEqual({});
    expect(useRepo.getState().remoteRefEvidence).toEqual({});
  });
});
