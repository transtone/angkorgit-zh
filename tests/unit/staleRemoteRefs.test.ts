import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchInfo, RemoteInfo, RepositoryInfo } from '@angkorgit/core';

const mocks = vi.hoisted(() => ({
  openRepository: vi.fn(), repoInfo: vi.fn(), status: vi.fn(), branches: vi.fn(),
  tags: vi.fn(), stashes: vi.fn(), remotes: vi.fn(), submodules: vi.fn(), conflicts: vi.fn(),
  worktrees: vi.fn(), unpushedCommits: vi.fn(), configGet: vi.fn(), recentRepositories: vi.fn(), addRecents: vi.fn(),
  remoteStaleRefs: vi.fn(), pullPreview: vi.fn(),
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
  mocks.remoteStaleRefs.mockResolvedValue(['refs/remotes/origin/gone']);
});

describe('stale remote tracking refs', () => {
  it('checks in the background on open and retains only existing full tracking refs', async () => {
    const pending = deferred<string[]>();
    mocks.remoteStaleRefs.mockReturnValueOnce(pending.promise);
    await useRepo.getState().open('A');
    expect(mocks.remoteStaleRefs).toHaveBeenCalledWith('A', 'origin');
    expect(useRepo.getState().refreshing).toBe(false);
    expect(stale()).toEqual([]);
    pending.resolve(['refs/remotes/origin/gone', 'refs/heads/main', 'origin/live', 'refs/remotes/origin/absent']);
    await vi.waitFor(() => expect(stale()).toEqual(['refs/remotes/origin/gone']));
  });

  it('deduplicates filesystem refreshes and unordered refs but rechecks URL, OID and fetch changes', async () => {
    await useRepo.getState().open('A');
    await useRepo.getState().refresh();
    mocks.branches.mockResolvedValue([branch('origin/live'), branch('origin/gone')]);
    await useRepo.getState().refresh();
    expect(mocks.remoteStaleRefs).toHaveBeenCalledTimes(1);
    mocks.branches.mockResolvedValue([branch('origin/live'), branch('origin/gone', 'two')]);
    await useRepo.getState().refresh();
    expect(mocks.remoteStaleRefs).toHaveBeenCalledTimes(2);
    mocks.remotes.mockResolvedValue([remote('origin', 'new-url')]);
    await useRepo.getState().refresh();
    expect(mocks.remoteStaleRefs).toHaveBeenCalledTimes(3);
    useRepo.getState().markFetched();
    useRepo.getState().markFetched();
    expect(mocks.remoteStaleRefs).toHaveBeenCalledTimes(5);
    await useRepo.getState().refresh();
    expect(mocks.remoteStaleRefs).toHaveBeenCalledTimes(5);
    await useRepo.getState().checkStaleRemoteRefs();
    expect(mocks.remoteStaleRefs).toHaveBeenCalledTimes(6);
  });

  it('clears failed remote classification while preserving successful remote evidence', async () => {
    mocks.remotes.mockResolvedValue([remote('origin'), remote('upstream')]);
    mocks.branches.mockResolvedValue([branch('origin/gone'), branch('upstream/gone')]);
    mocks.remoteStaleRefs.mockImplementation(async (_path, name) => [`refs/remotes/${name}/gone`]);
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(stale()).toHaveLength(2));
    mocks.remoteStaleRefs.mockImplementation(async (_path, name) => {
      if (name === 'origin') throw new Error('offline');
      return ['refs/remotes/upstream/gone'];
    });
    await expect(useRepo.getState().checkStaleRemoteRefs()).resolves.toBeUndefined();
    expect(stale()).toEqual(['refs/remotes/upstream/gone']);
  });

  it('ignores a late result after A → B → A', async () => {
    const pending = deferred<string[]>();
    mocks.remoteStaleRefs.mockReturnValueOnce(pending.promise);
    await useRepo.getState().open('A');
    mocks.remoteStaleRefs.mockResolvedValue([]);
    await useRepo.getState().open('B');
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(mocks.remoteStaleRefs).toHaveBeenCalledTimes(3));
    pending.resolve(['refs/remotes/origin/gone']);
    await pending.promise;
    expect(stale()).toEqual([]);
  });

  it('ignores older checks for the same repository and results after close', async () => {
    await useRepo.getState().open('A');
    const pending = deferred<string[]>();
    mocks.remoteStaleRefs.mockReturnValueOnce(pending.promise);
    const old = useRepo.getState().checkStaleRemoteRefs();
    mocks.remoteStaleRefs.mockResolvedValue([]);
    await useRepo.getState().checkStaleRemoteRefs();
    pending.resolve(['refs/remotes/origin/gone']);
    await old;
    expect(stale()).toEqual([]);
    const closing = deferred<string[]>();
    mocks.remoteStaleRefs.mockReturnValueOnce(closing.promise);
    const check = useRepo.getState().checkStaleRemoteRefs();
    useRepo.getState().close();
    closing.resolve(['refs/remotes/origin/gone']);
    await check;
    expect(stale()).toEqual([]);
  });
});
