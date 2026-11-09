import { create } from 'zustand';
import type { CommitInfo, HistoryPage, HistoryPosition } from '@angkorgit/core';
import { GraphLayout, type GraphRow } from '@angkorgit/core';
import { ipc } from '@/core/ipc';

const PAGE_SIZE = 200;
const ROW_HEIGHT = 32;

interface GraphFilters {
  branch: string;
}

export interface FindQuery {
  text: string;
  author: string;
}

export interface FindState extends FindQuery {
  matches: HistoryPosition[];
  truncated: boolean;
  active: number;
  loading: boolean;
}

interface GraphState {
  commits: CommitInfo[];
  rows: readonly GraphRow[];
  maxLane: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  filters: GraphFilters;
  find: FindState | null;
  locatedOid: string | null;
  selectedOid: string | null;
  selectedOids: string[];
  layout: GraphLayout;
  lastPath: string | null;
  pendingScrollIndex: number | null;
  scrollTop: number;
  scrollLeft: number;

  activate: (path: string) => void;
  forget: (path: string) => void;
  setScrollTop: (scrollTop: number) => void;
  setScrollLeft: (scrollLeft: number) => void;

  reload: (path: string) => Promise<void>;
  loadMore: (path: string) => Promise<void>;
  setFilters: (path: string, filters: Partial<GraphFilters>) => void;
  setFind: (path: string, query: FindQuery, since?: number) => Promise<string | null>;
  goToMatch: (path: string, index: number) => Promise<string | null>;
  selectionEpoch: () => number;
  stepFind: (path: string, direction: 1 | -1) => Promise<string | null>;
  revealCommit: (path: string, oid: string) => Promise<boolean>;
  select: (oid: string | null) => void;
  toggleSelect: (oid: string) => void;
  rangeSelect: (oid: string) => void;
  clearPendingScroll: () => void;
}

let requestSeq = 0;
let findSeq = 0;
let selectSeq = 0;

const errorText = (error: unknown) =>
  (error as { message?: string } | undefined)?.message ?? String(error);

const emptyFilters = (): GraphFilters => ({ branch: '' });

const sameQuery = (a: FindQuery | null, b: FindQuery) => a !== null && a.text === b.text && a.author === b.author;

const withActiveMatch = (find: FindState | null, oid: string | null): FindState | null => {
  if (!find || !oid) return find;
  const index = find.matches.findIndex((m) => m.oid === oid);
  return index === -1 || index === find.active ? find : { ...find, active: index };
};

type GraphSnapshot = Pick<GraphState,
  'commits' | 'rows' | 'maxLane' | 'hasMore' | 'error' | 'filters' | 'find' |
  'locatedOid' | 'selectedOid' | 'selectedOids' | 'layout' | 'pendingScrollIndex' | 'scrollTop' | 'scrollLeft'>;

const emptySnapshot = (): GraphSnapshot => ({
  commits: [], rows: [], maxLane: 0, hasMore: true, error: null,
  filters: emptyFilters(), find: null, locatedOid: null, selectedOid: null,
  selectedOids: [], layout: new GraphLayout(), pendingScrollIndex: null, scrollTop: 0, scrollLeft: 0,
});

export const useGraph = create<GraphState>((set, get) => {
  const snapshots = new Map<string, GraphSnapshot>();
  const invalidate = () => {
    requestSeq += 1;
    findSeq += 1;
    selectSeq += 1;
  };
  const appendPage = (page: HistoryPage, layout: GraphLayout) => {
    const { commits } = get();
    layout.add(page.commits);
    set({
      commits: [...commits, ...page.commits],
      rows: [...layout.getRows()],
      maxLane: layout.maxLane,
      hasMore: page.hasMore,
      loading: false,
      error: null,
    });
  };

  const fetchMore = async (path: string, limit: number): Promise<boolean> => {
    if (get().lastPath !== path) return false;
    const { commits, filters, layout } = get();
    const seq = ++requestSeq;
    set({ loading: true });
    try {
      const page = await ipc.history(path, {
        skip: commits.length,
        limit,
        branch: filters.branch || undefined,
      });
      if (seq !== requestSeq || get().lastPath !== path || get().layout !== layout) return false;
      appendPage(page, layout);
      return true;
    } catch (error) {
      if (seq === requestSeq) set({ loading: false, error: errorText(error) });
      return false;
    }
  };

  const ensureLoaded = async (path: string, index: number): Promise<boolean> => {
    const loaded = get().commits.length;
    if (!get().hasMore || loaded > index) return true;
    return fetchMore(path, index - loaded + PAGE_SIZE);
  };

  return {
    ...emptySnapshot(),
    loading: false,
    lastPath: null,

    activate: (path) => {
      const state = get();
      if (state.lastPath === path) return;
      if (state.lastPath) {
        const { commits, rows, maxLane, hasMore, error, filters, find, locatedOid,
          selectedOid, selectedOids, layout, pendingScrollIndex, scrollTop, scrollLeft } = state;
        snapshots.set(state.lastPath, {
          commits, rows, maxLane, hasMore, error, filters,
          find: find ? { ...find, loading: false } : null,
          locatedOid, selectedOid, selectedOids, layout, pendingScrollIndex, scrollTop, scrollLeft,
        });
      }
      invalidate();
      const snapshot = snapshots.get(path) ?? emptySnapshot();
      snapshots.delete(path);
      set({ ...snapshot, lastPath: path, loading: false });
    },

    forget: (path) => {
      snapshots.delete(path);
      if (get().lastPath !== path) return;
      invalidate();
      set({ ...emptySnapshot(), lastPath: null, loading: false });
    },

    setScrollTop: (scrollTop) => set({ scrollTop: Math.max(0, scrollTop) }),
    setScrollLeft: (scrollLeft) => set({ scrollLeft: Math.max(0, scrollLeft) }),

    reload: async (path: string) => {
      if (get().lastPath !== path) return;
      const { filters } = get();
      const loadedCount = get().commits.length;
      const seq = ++requestSeq;
      set({ loading: true });
      try {
        const page = await ipc.history(path, {
          skip: 0,
          limit: loadedCount > PAGE_SIZE ? Math.max(PAGE_SIZE, loadedCount) : PAGE_SIZE,
          branch: filters.branch || undefined,
        });
        if (seq !== requestSeq || get().lastPath !== path) return;
        const layout = new GraphLayout();
        layout.add(page.commits);
        const state = get();
        const oids = new Set(page.commits.map((commit) => commit.oid));
        const anchorIndex = Math.floor(state.scrollTop / ROW_HEIGHT);
        const anchorOid = state.commits[anchorIndex]?.oid;
        const nextAnchorIndex = anchorOid ? page.commits.findIndex((commit) => commit.oid === anchorOid) : -1;
        const scrollTop = state.scrollTop > 0 && nextAnchorIndex >= 0
          ? state.scrollTop + (nextAnchorIndex - anchorIndex) * ROW_HEIGHT
          : state.scrollTop;
        set({
          commits: page.commits,
          selectedOid: state.selectedOid && oids.has(state.selectedOid) ? state.selectedOid : null,
          selectedOids: state.selectedOids.filter((oid) => oids.has(oid)),
          locatedOid: state.locatedOid && oids.has(state.locatedOid) ? state.locatedOid : null,
          scrollTop,
          rows: layout.getRows(),
          maxLane: layout.maxLane,
          hasMore: page.hasMore,
          layout,
          loading: false,
          error: null,
        });
        const find = get().find;
        if (find) void get().setFind(path, { text: find.text, author: find.author }, -1);
      } catch (error) {
        if (seq === requestSeq) set({ loading: false, error: errorText(error) });
      }
    },

    loadMore: async (path: string) => {
      const { hasMore, loading } = get();
      if (!hasMore || loading) return;
      await fetchMore(path, PAGE_SIZE);
    },

    setFilters: (path, partial) => {
      if (get().lastPath !== path) return;
      findSeq += 1;
      selectSeq += 1;
      set((s) => ({ filters: { ...s.filters, ...partial }, scrollTop: 0, pendingScrollIndex: null }));
      void get().reload(path);
    },

    setFind: async (path, query, since) => {
      if (get().lastPath !== path) return null;
      const text = query.text.trim();
      const author = query.author.trim();
      findSeq += 1;
      if (!text && !author) {
        set({ find: null, locatedOid: null });
        return null;
      }
      const seq = findSeq;
      const selectedAt = since ?? selectSeq;
      const { filters } = get();
      const wanted = { text, author };
      set((s) => ({
        find: {
          ...wanted,
          matches: sameQuery(s.find, wanted) && s.find ? s.find.matches : [],
          truncated: sameQuery(s.find, wanted) && s.find ? s.find.truncated : false,
          active: sameQuery(s.find, wanted) && s.find ? s.find.active : 0,
          loading: true,
        },
      }));
      try {
        const result = await ipc.historySearch(path, {
          search: text,
          author: author || undefined,
          branch: filters.branch || undefined,
        });
        if (seq !== findSeq || get().lastPath !== path) return null;
        const landed: FindState = { ...wanted, matches: result.matches, truncated: result.truncated, active: 0, loading: false };
        if (selectSeq !== selectedAt) {
          set({ find: withActiveMatch(landed, get().selectedOid) });
          return null;
        }
        set({ find: landed });
        if (result.matches.length === 0) return null;
        return get().goToMatch(path, 0);
      } catch {
        if (seq === findSeq) set((s) => (s.find ? { find: { ...s.find, loading: false } } : {}));
        return null;
      }
    },

    goToMatch: async (path, index) => {
      if (get().lastPath !== path) return null;
      const finding = findSeq;
      const selectedAt = selectSeq;
      const find = get().find;
      const target = find?.matches[index];
      if (!find || !target) return null;
      set({ find: { ...find, active: index } });
      const ok = await ensureLoaded(path, target.index);
      if (!ok || get().lastPath !== path || finding !== findSeq || selectedAt !== selectSeq) return null;
      const commits = get().commits;
      const at =
        commits[target.index]?.oid === target.oid
          ? target.index
          : commits.findIndex((c) => c.oid === target.oid);
      if (at === -1) return null;
      set({ selectedOid: target.oid, selectedOids: [target.oid], locatedOid: target.oid, pendingScrollIndex: at });
      return target.oid;
    },

    revealCommit: async (path, oid) => {
      if (get().lastPath !== path) return false;
      const selectedAt = selectSeq;
      const finding = findSeq;
      const current = () => get().lastPath === path && selectedAt === selectSeq && finding === findSeq;
      const target = await ipc.historyPosition(path, oid);
      if (!target || !current()) return false;
      const ok = await ensureLoaded(path, target.index);
      if (!ok || !current()) return false;
      const commits = get().commits;
      const at =
        commits[target.index]?.oid === target.oid
          ? target.index
          : commits.findIndex((c) => c.oid === target.oid);
      if (at === -1) return false;
      get().select(target.oid);
      set({ pendingScrollIndex: at, locatedOid: target.oid });
      return true;
    },

    stepFind: async (path, direction) => {
      const find = get().find;
      if (!find || find.matches.length === 0) return null;
      return get().goToMatch(path, (find.active + direction + find.matches.length) % find.matches.length);
    },

    select: (oid) => {
      selectSeq += 1;
      set((s) => ({
        selectedOid: oid,
        selectedOids: oid ? [oid] : [],
        locatedOid: null,
        find: withActiveMatch(s.find, oid),
      }));
    },

    clearPendingScroll: () => set({ pendingScrollIndex: null }),

    selectionEpoch: () => selectSeq,

    toggleSelect: (oid) => {
      selectSeq += 1;
      set((s) => ({
        selectedOid: oid,
        locatedOid: null,
        find: withActiveMatch(s.find, oid),
        selectedOids: s.selectedOids.includes(oid)
          ? s.selectedOids.filter((o) => o !== oid)
          : [...s.selectedOids, oid],
      }));
    },

    rangeSelect: (oid) => {
      selectSeq += 1;
      set((s) => {
        const anchorIdx = s.selectedOid ? s.commits.findIndex((c) => c.oid === s.selectedOid) : -1;
        const clickedIdx = s.commits.findIndex((c) => c.oid === oid);
        if (clickedIdx < 0) return s;
        if (anchorIdx < 0) return { selectedOid: oid, selectedOids: [oid] };
        const [lo, hi] = anchorIdx <= clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx];
        return { selectedOids: s.commits.slice(lo, hi + 1).map((c) => c.oid) };
      });
    },
  };
});
