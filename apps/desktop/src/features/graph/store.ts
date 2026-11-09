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
  onlyMatches: boolean;
  matchesOnly: MatchQuery | null;
  locatedOid: string | null;
  selectedOid: string | null;
  selectedOids: string[];
  compare: CompareRange | null;
  layout: GraphLayout;
  lastPath: string | null;
  pendingScrollIndex: number | null;
  scrollTop: number;
  scrollLeft: number;

  activate: (path: string) => void;
  forget: (path: string) => void;
  setScrollTop: (scrollTop: number) => void;
  setScrollLeft: (scrollLeft: number) => void;

  reload: (path: string, refreshFind?: boolean) => Promise<void>;
  loadMore: (path: string) => Promise<void>;
  setFilters: (path: string, filters: Partial<GraphFilters>) => void;
  setOnlyMatches: (path: string, on: boolean) => Promise<void>;
  setFind: (path: string, query: FindQuery, since?: number) => Promise<string | null>;
  goToMatch: (path: string, index: number) => Promise<string | null>;
  selectionEpoch: () => number;
  stepFind: (path: string, direction: 1 | -1) => Promise<string | null>;
  revealCommit: (path: string, oid: string) => Promise<boolean>;
  select: (oid: string | null) => void;
  toggleSelect: (oid: string) => void;
  rangeSelect: (oid: string) => void;
  setCompare: (range: CompareRange | null) => void;
  clearPendingScroll: () => void;
}

export interface CompareRange {
  from: string;
  to: string;
}

let requestSeq = 0;
let findSeq = 0;
let selectSeq = 0;

const errorText = (error: unknown) =>
  (error as { message?: string } | undefined)?.message ?? String(error);

const emptyFilters = (): GraphFilters => ({ branch: '' });

interface MatchQuery {
  search?: string;
  author?: string;
}

const matchQueryOf = (onlyMatches: boolean, find: FindState | null): MatchQuery | null =>
  onlyMatches && find ? { search: find.text || undefined, author: find.author || undefined } : null;

const layoutInput = (commits: CommitInfo[], matchesOnly: MatchQuery | null): CommitInfo[] =>
  matchesOnly ? commits.map((commit) => ({ ...commit, parents: [] })) : commits;

const rowsOf = (layout: GraphLayout, commits: CommitInfo[], matchesOnly: MatchQuery | null): readonly GraphRow[] =>
  matchesOnly
    ? layout.getRows().map((row, i) => ({
        ...row,
        node: { ...row.node, color: 0, isMerge: (commits[i]?.parents.length ?? 0) > 1 },
      }))
    : [...layout.getRows()];

const sameQuery = (a: FindQuery | null, b: FindQuery) => a !== null && a.text === b.text && a.author === b.author;

const withActiveMatch = (find: FindState | null, oid: string | null): FindState | null => {
  if (!find || !oid) return find;
  const index = find.matches.findIndex((m) => m.oid === oid);
  return index === -1 || index === find.active ? find : { ...find, active: index };
};

type GraphSnapshot = Pick<GraphState,
  'commits' | 'rows' | 'maxLane' | 'hasMore' | 'error' | 'filters' | 'find' |
  'locatedOid' | 'selectedOid' | 'selectedOids' | 'compare' | 'onlyMatches' | 'matchesOnly' |
  'layout' | 'pendingScrollIndex' | 'scrollTop' | 'scrollLeft'>;

const emptySnapshot = (): GraphSnapshot => ({
  commits: [], rows: [], maxLane: 0, hasMore: true, error: null,
  filters: emptyFilters(), find: null, onlyMatches: false, matchesOnly: null, compare: null,
  locatedOid: null, selectedOid: null,
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
    const { commits, matchesOnly } = get();
    layout.add(layoutInput(page.commits, matchesOnly));
    const all = [...commits, ...page.commits];
    set({
      commits: all,
      rows: rowsOf(layout, all, matchesOnly),
      maxLane: layout.maxLane,
      hasMore: page.hasMore,
      loading: false,
      error: null,
    });
  };

  const fetchMore = async (path: string, limit: number): Promise<boolean> => {
    if (get().lastPath !== path) return false;
    const { commits, filters, layout, matchesOnly } = get();
    const seq = ++requestSeq;
    set({ loading: true });
    try {
      const page = await ipc.history(path, {
        skip: commits.length,
        limit,
        branch: filters.branch || undefined,
        ...matchesOnly,
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
          selectedOid, selectedOids, compare, onlyMatches, matchesOnly, layout, pendingScrollIndex, scrollTop, scrollLeft } = state;
        snapshots.set(state.lastPath, {
          commits, rows, maxLane, hasMore, error, filters,
          find: find ? { ...find, loading: false } : null,
          locatedOid, selectedOid, selectedOids, compare, onlyMatches, matchesOnly, layout, pendingScrollIndex, scrollTop, scrollLeft,
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

    reload: async (path: string, refreshFind = true) => {
      if (get().lastPath !== path) return;
      const { filters, onlyMatches, find: currentFind } = get();
      const matchesOnly = matchQueryOf(onlyMatches, currentFind);
      const loadedCount = get().commits.length;
      const seq = ++requestSeq;
      set({ loading: true });
      try {
        const page = await ipc.history(path, {
          skip: 0,
          limit: loadedCount > PAGE_SIZE ? Math.max(PAGE_SIZE, loadedCount) : PAGE_SIZE,
          branch: filters.branch || undefined,
          ...matchesOnly,
        });
        if (seq !== requestSeq || get().lastPath !== path) return;
        const layout = new GraphLayout();
        layout.add(layoutInput(page.commits, matchesOnly));
        const state = get();
        const oids = new Set(page.commits.map((commit) => commit.oid));
        const anchorIndex = Math.floor(state.scrollTop / ROW_HEIGHT);
        const anchorOid = state.commits[anchorIndex]?.oid;
        const nextAnchorIndex = anchorOid ? page.commits.findIndex((commit) => commit.oid === anchorOid) : -1;
        const scrollTop = state.scrollTop > 0 && nextAnchorIndex >= 0
          ? state.scrollTop + (nextAnchorIndex - anchorIndex) * ROW_HEIGHT
          : state.scrollTop;
        set({
          matchesOnly,
          commits: page.commits,
          selectedOid: state.selectedOid && oids.has(state.selectedOid) ? state.selectedOid : null,
          selectedOids: state.selectedOids.filter((oid) => oids.has(oid)),
          locatedOid: state.locatedOid && oids.has(state.locatedOid) ? state.locatedOid : null,
          scrollTop,
          rows: rowsOf(layout, page.commits, matchesOnly),
          maxLane: layout.maxLane,
          hasMore: page.hasMore,
          layout,
          loading: false,
          error: null,
        });
        const find = get().find;
        if (find && refreshFind) void get().setFind(path, { text: find.text, author: find.author }, -1);
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
        if (get().matchesOnly) await get().reload(path);
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
        const relist = get().onlyMatches && !sameQuery(get().matchesOnly && { text: get().matchesOnly?.search ?? '', author: get().matchesOnly?.author ?? '' }, wanted);
        if (selectSeq !== selectedAt) {
          set({ find: withActiveMatch(landed, get().selectedOid) });
          if (relist) await get().reload(path, false);
          return null;
        }
        set({ find: landed });
        if (relist) {
          await get().reload(path, false);
          if (seq !== findSeq || get().lastPath !== path || selectSeq !== selectedAt) return null;
        }
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
      const listIndex = get().matchesOnly ? index : target.index;
      const ok = await ensureLoaded(path, listIndex);
      if (!ok || get().lastPath !== path || finding !== findSeq || selectedAt !== selectSeq) return null;
      const commits = get().commits;
      const at =
        commits[listIndex]?.oid === target.oid
          ? listIndex
          : commits.findIndex((c) => c.oid === target.oid);
      if (at === -1) return null;
      set({ selectedOid: target.oid, selectedOids: [target.oid], compare: null, locatedOid: target.oid, pendingScrollIndex: at });
      return target.oid;
    },

    setOnlyMatches: async (path, on) => {
      if (get().lastPath !== path || get().onlyMatches === on) return;
      const selectedAt = selectSeq;
      const selected = get().selectedOid;
      set({ onlyMatches: on });
      await get().reload(path, false);
      if (get().lastPath !== path || get().onlyMatches !== on || selectedAt !== selectSeq) return;
      if (!selected) return;
      if (on) {
        const find = get().find;
        const index = find?.matches.findIndex((m) => m.oid === selected) ?? -1;
        if (index >= 0) await get().goToMatch(path, index);
        else if (find && find.matches.length > 0) await get().goToMatch(path, 0);
        return;
      }
      await get().revealCommit(path, selected);
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
        compare: null,
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
        compare: null,
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
        if (anchorIdx < 0) return { selectedOid: oid, selectedOids: [oid], compare: null };
        const [lo, hi] = anchorIdx <= clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx];
        return { selectedOids: s.commits.slice(lo, hi + 1).map((c) => c.oid), compare: null };
      });
    },

    setCompare: (range) => set({ compare: range }),
  };
});
