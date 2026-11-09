import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryInfo, StatusSummary } from '@angkorgit/core';

const mocks = vi.hoisted(() => ({
  openRepository: vi.fn(), repoInfo: vi.fn(), status: vi.fn(), branches: vi.fn(),
  tags: vi.fn(), stashes: vi.fn(), remotes: vi.fn(), submodules: vi.fn(), conflicts: vi.fn(),
  worktrees: vi.fn(), unpushedCommits: vi.fn(), configGet: vi.fn(), recentRepositories: vi.fn(), addRecents: vi.fn(),
  activate: vi.fn(), forget: vi.fn(), addRepoTab: vi.fn(), markWorktreeTab: vi.fn(),
}));
vi.mock('@/core/ipc', () => ({ ipc: mocks }));
vi.mock('@/features/graph/store', () => ({ useGraph: { getState: () => mocks } }));
vi.mock('@/features/ui/store', () => ({ useUi: { getState: () => mocks } }));
import { useRepo } from '../../apps/desktop/src/features/repository/store';

const info = (path: string) => ({ path, name: path, headBranch: 'main' } as RepositoryInfo);
const status = (name: string) => ({ name } as unknown as StatusSummary);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useRepo.getState().close();
  vi.resetAllMocks();
  mocks.openRepository.mockImplementation(async (path) => info(path));
  mocks.repoInfo.mockImplementation(async (path) => info(path));
  mocks.status.mockImplementation(async (path) => status(path));
  for (const name of ['branches', 'tags', 'stashes', 'remotes', 'submodules', 'conflicts', 'worktrees', 'unpushedCommits', 'recentRepositories'] as const) {
    mocks[name].mockResolvedValue([]);
  }
  mocks.configGet.mockResolvedValue(null);
  mocks.addRecents.mockResolvedValue([]);
});

describe('project switching', () => {
  it('restores the target snapshot before background queries finish', async () => {
    await useRepo.getState().open('A');
    useRepo.getState().markFetched();
    const fetchedAt = useRepo.getState().lastFetchAt;
    await useRepo.getState().open('B');
    const next = deferred<StatusSummary>();
    mocks.status.mockReturnValueOnce(next.promise);
    await useRepo.getState().open('A');
    expect(useRepo.getState().repo?.path).toBe('A');
    expect(useRepo.getState().status).toEqual(status('A'));
    expect(useRepo.getState().lastFetchAt).toBe(fetchedAt);
    expect(useRepo.getState().refreshing).toBe(true);
    expect(mocks.openRepository).toHaveBeenCalledTimes(2);
    expect(mocks.addRecents).toHaveBeenCalledWith(['A']);
    next.resolve(status('fresh A'));
    await vi.waitFor(() => expect(useRepo.getState().status).toEqual(status('fresh A')));
  });

  it('keeps the tab data after a background refresh failure', async () => {
    await useRepo.getState().open('A');
    await useRepo.getState().open('B');
    mocks.status.mockRejectedValueOnce(new Error('query failed'));
    await expect(useRepo.getState().open('A')).resolves.toMatchObject({ path: 'A' });
    await vi.waitFor(() => expect(useRepo.getState().refreshError).toBe('query failed'));
    expect(useRepo.getState().status).toEqual(status('A'));
    expect(useRepo.getState().refreshing).toBe(false);
  });

  it('ignores an earlier A refresh after A → B → A', async () => {
    await useRepo.getState().open('A');
    const old = deferred<StatusSummary>();
    mocks.status.mockReturnValueOnce(old.promise);
    const refresh = useRepo.getState().refresh();
    await useRepo.getState().open('B');
    await useRepo.getState().open('A');
    await vi.waitFor(() => expect(useRepo.getState().refreshing).toBe(false));
    old.resolve(status('obsolete'));
    await refresh;
    expect(useRepo.getState().status).toEqual(status('A'));
  });

  it('does not reactivate a project whose open completes after close', async () => {
    const pending = deferred<RepositoryInfo>();
    mocks.openRepository.mockReturnValueOnce(pending.promise);
    const opening = useRepo.getState().open('A');
    useRepo.getState().close();
    pending.resolve(info('A'));
    await opening;
    expect(useRepo.getState().repo).toBeNull();
    expect(mocks.repoInfo).not.toHaveBeenCalled();
  });

  it('releases a closed tab snapshot instead of saving it again on departure', async () => {
    await useRepo.getState().open('A');
    useRepo.getState().forget('A');
    await useRepo.getState().open('B');
    await useRepo.getState().open('A');
    expect(mocks.openRepository).toHaveBeenCalledTimes(3);
    expect(mocks.forget).toHaveBeenCalledWith('A');
  });
});
