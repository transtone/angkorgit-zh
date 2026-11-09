import { create } from 'zustand';
import { pickRemote } from '@angkorgit/core';
import type {
  BranchInfo, PullPreview, RecentRepository, RemoteInfo, RepositoryInfo,
  StashInfo, StatusSummary, SubmoduleInfo, TagInfo, WorktreeInfo,
} from '@angkorgit/core';
import { ipc } from '@/core/ipc';
import { useGraph } from '@/features/graph/store';

interface RepoState {
  repo: RepositoryInfo | null;
  status: StatusSummary | null;
  branches: BranchInfo[];
  tags: TagInfo[];
  stashes: StashInfo[];
  statusVersion: number;
  remotes: RemoteInfo[];
  submodules: SubmoduleInfo[];
  worktrees: WorktreeInfo[];
  conflicts: string[];
  unpushed: string[];
  pullPreview: PullPreview | null;
  recents: RecentRepository[];
  busy: string | null;
  opening: string | null;
  refreshing: boolean;
  refreshError: string | null;
  profileId: string | null;
  lastFetchAt: number | null;
  fetchFailures: string[];
  loadRecents: () => Promise<void>;
  open: (path: string) => Promise<RepositoryInfo>;
  close: () => void;
  forget: (path: string) => void;
  refresh: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  loadPullPreview: () => Promise<void>;
  setBusy: (label: string | null) => void;
  setProfileId: (profileId: string | null) => void;
  markFetched: () => void;
  setFetchFailures: (names: string[]) => void;
}

type RepoSnapshot = Pick<RepoState,
  'repo' | 'status' | 'branches' | 'tags' | 'stashes' | 'remotes' | 'submodules' |
  'worktrees' | 'conflicts' | 'unpushed' | 'pullPreview' | 'profileId' | 'lastFetchAt' | 'fetchFailures'>;

const emptySnapshot = (): RepoSnapshot => ({
  repo: null, status: null, branches: [], tags: [], stashes: [], remotes: [],
  submodules: [], worktrees: [], conflicts: [], unpushed: [], pullPreview: null,
  profileId: null, lastFetchAt: null, fetchFailures: [],
});
const snapshot = (s: RepoState): RepoSnapshot => ({
  repo: s.repo, status: s.status, branches: s.branches, tags: s.tags, stashes: s.stashes,
  remotes: s.remotes, submodules: s.submodules, worktrees: s.worktrees,
  conflicts: s.conflicts, unpushed: s.unpushed, pullPreview: s.pullPreview,
  profileId: s.profileId, lastFetchAt: s.lastFetchAt, fetchFailures: s.fetchFailures,
});

let openSeq = 0;
let fullSeq = 0;
let statusSeq = 0;
let previewSeq = 0;

export const useRepo = create<RepoState>((set, get) => {
  const cache = new Map<string, RepoSnapshot>();
  let cacheCurrent = true;
  const activate = (repo: RepositoryInfo) => {
    const previous = get();
    if (previous.repo?.path !== repo.path) {
      if (previous.repo && cacheCurrent) cache.set(previous.repo.path, snapshot(previous));
      cacheCurrent = true;
      fullSeq += 1;
      statusSeq += 1;
      previewSeq += 1;
      useGraph.getState().activate(repo.path);
      set({ ...emptySnapshot(), ...cache.get(repo.path), repo, opening: null,
        refreshing: false, refreshError: null, statusVersion: previous.statusVersion + 1 });
    } else {
      set({ repo, opening: null });
    }
  };
  return {
    ...emptySnapshot(),
    statusVersion: 0,
    recents: [],
    busy: null,
    opening: null,
    refreshing: false,
    refreshError: null,

    loadRecents: async () => {
      const recents = await ipc.recentRepositories();
      set({ recents });
    },

    open: async (path) => {
      const seq = ++openSeq;
      const cached = get().repo?.path === path ? snapshot(get()) : cache.get(path);
      let repo: RepositoryInfo;
      if (cached?.repo) {
        repo = cached.repo;
        activate(repo);
      } else {
        set({ opening: path });
        try {
          repo = await ipc.openRepository(path);
        } catch (error) {
          if (seq === openSeq) set({ opening: null });
          throw error;
        }
        if (seq !== openSeq) return repo;
        activate(repo);
      }
      void ipc.configGet(repo.path, 'angkorgit.profile').then((profileId) => {
        if (seq === openSeq && get().repo?.path === repo.path) set({ profileId });
      }).catch(() => undefined);
      void import('@/features/ui/store').then(({ useUi }) => {
        if (seq !== openSeq || get().repo?.path !== repo.path) return;
        useUi.getState().addRepoTab(repo.path);
        useUi.getState().markWorktreeTab(repo.path, repo.isWorktree, repo.mainPath);
      });
      // A refresh failure must not close an already activated tab.
      const refresh = get().refresh().catch(() => undefined);
      if (!cached) await refresh;
      const recents = cached ? ipc.addRecents([repo.path]) : ipc.recentRepositories();
      void recents.then((items) => {
        if (seq === openSeq) set({ recents: items });
      }).catch(() => undefined);
      return repo;
    },

    forget: (path) => {
      if (get().opening === path) {
        openSeq += 1;
        set({ opening: null });
      }
      cache.delete(path);
      if (get().repo?.path === path) cacheCurrent = false;
      useGraph.getState().forget(path);
    },

    close: () => {
      openSeq += 1;
      fullSeq += 1;
      statusSeq += 1;
      previewSeq += 1;
      cache.clear();
      const path = get().repo?.path;
      if (path) useGraph.getState().forget(path);
      set({ ...emptySnapshot(), opening: null, refreshing: false, refreshError: null });
    },

    refresh: async () => {
      const { repo } = get();
      if (!repo) return;
      const path = repo.path;
      const seq = ++fullSeq;
      const statusEpoch = ++statusSeq;
      set({ refreshing: true, refreshError: null });
      try {
        const [info, status, branches, tags, stashes, remotes, submodules, conflicts, worktrees, unpushed] =
          await Promise.all([
            ipc.repoInfo(path), ipc.status(path), ipc.branches(path), ipc.tags(path),
            ipc.stashes(path), ipc.remotes(path), ipc.submodules(path), ipc.conflicts(path),
            ipc.worktrees(path).catch(() => [] as WorktreeInfo[]),
            ipc.unpushedCommits(path).catch(() => [] as string[]),
          ]);
        if (get().repo?.path !== path || seq !== fullSeq) return;
        const data = { repo: info, branches, tags, stashes, remotes, submodules, worktrees, unpushed };
        if (statusEpoch === statusSeq) {
          set((state) => ({ ...data, status, conflicts, statusVersion: state.statusVersion + 1 }));
        } else {
          set(data);
        }
        void get().loadPullPreview();
      } catch (error) {
        if (get().repo?.path === path && seq === fullSeq) {
          set({ refreshError: (error as { message?: string }).message ?? String(error) });
        }
        throw error;
      } finally {
        if (get().repo?.path === path && seq === fullSeq) set({ refreshing: false });
      }
    },

    refreshStatus: async () => {
      const { repo } = get();
      if (!repo) return;
      const path = repo.path;
      const statusEpoch = ++statusSeq;
      const [status, conflicts] = await Promise.all([ipc.status(path), ipc.conflicts(path)]);
      if (get().repo?.path !== path || statusEpoch !== statusSeq) return;
      set((state) => ({ status, conflicts, statusVersion: state.statusVersion + 1 }));
      void get().loadPullPreview();
    },

    loadPullPreview: async () => {
      const { repo, remotes, branches } = get();
      if (!repo) return;
      const path = repo.path;
      const headUpstream = branches.find((b) => !b.isRemote && b.isHead)?.upstream ?? null;
      const remote = pickRemote(remotes, headUpstream)?.name;
      const seq = ++previewSeq;
      if (!remote) {
        set({ pullPreview: null });
        return;
      }
      const pullPreview = await ipc.pullPreview(path, remote).catch(() => null);
      if (get().repo?.path !== path || seq !== previewSeq) return;
      set({ pullPreview });
    },

    setBusy: (busy) => set({ busy }),
    markFetched: () => set({ lastFetchAt: Date.now() }),
    setFetchFailures: (fetchFailures) => set({ fetchFailures }),
    setProfileId: (profileId) => set({ profileId }),
  };
});
