import { create } from 'zustand';

export interface ReviewResult {
  stagedSignature: string;
  patchHash: string;
  text: string;
}

export type FileAiKind = 'explain' | 'review';

export interface FileAiResult {
  kind: FileAiKind;
  patchHash: string;
  text: string;
}

export interface FileAiTarget {
  path: string;
  oid?: string;
  staged?: boolean;
}

interface AiWorkState {
  reviews: Record<string, ReviewResult>;
  reviewRuns: Record<string, number>;
  reviewBusy: Record<string, boolean>;
  explains: Record<string, string>;
  explainRuns: Record<string, number>;
  explainBusy: Record<string, boolean>;
  fileAi: Record<string, FileAiResult>;
  fileAiRuns: Record<string, number>;
  fileAiBusy: Record<string, FileAiKind>;
  startReview: (repoPath: string) => number;
  isReviewRun: (repoPath: string, run: number) => boolean;
  endReview: (repoPath: string, run: number) => void;
  stopReview: (repoPath: string) => void;
  setReview: (repoPath: string, result: ReviewResult | null) => void;
  setExplain: (key: string, text: string | null) => void;
  startExplain: (key: string) => number;
  isExplainRun: (key: string, run: number) => boolean;
  endExplain: (key: string, run: number) => void;
  stopExplain: (key: string) => void;
  setFileAi: (key: string, result: FileAiResult | null) => void;
  startFileAi: (key: string, kind: FileAiKind) => number;
  isFileAiRun: (key: string, run: number) => boolean;
  endFileAi: (key: string, run: number) => void;
  stopFileAi: (key: string) => void;
}

export const explainKeyFor = (repoPath: string, oid: string) => `${repoPath}\n${oid}`;

export const commitReviewKeyFor = (repoPath: string, oid: string) => `${repoPath}\n${oid}\nreview`;

export const fileAiKeyFor = (repoPath: string, target: FileAiTarget) =>
  `${repoPath}\n${target.oid ?? (target.staged ? 'staged' : 'unstaged')}\n${target.path}`;

export const useAiWork = create<AiWorkState>((set, get) => ({
  reviews: {},
  reviewRuns: {},
  reviewBusy: {},
  explains: {},
  explainRuns: {},
  explainBusy: {},
  fileAi: {},
  fileAiRuns: {},
  fileAiBusy: {},
  startReview: (repoPath) => {
    const run = (get().reviewRuns[repoPath] ?? 0) + 1;
    set((s) => ({
      reviewRuns: { ...s.reviewRuns, [repoPath]: run },
      reviewBusy: { ...s.reviewBusy, [repoPath]: true },
    }));
    return run;
  },
  isReviewRun: (repoPath, run) => get().reviewRuns[repoPath] === run,
  endReview: (repoPath, run) => {
    if (get().reviewRuns[repoPath] !== run) return;
    set((s) => ({ reviewBusy: { ...s.reviewBusy, [repoPath]: false } }));
  },
  stopReview: (repoPath) =>
    set((s) => ({
      reviewRuns: { ...s.reviewRuns, [repoPath]: (s.reviewRuns[repoPath] ?? 0) + 1 },
      reviewBusy: { ...s.reviewBusy, [repoPath]: false },
    })),
  setReview: (repoPath, result) =>
    set((s) => {
      const reviews = { ...s.reviews };
      if (result) reviews[repoPath] = result;
      else delete reviews[repoPath];
      return { reviews };
    }),
  setExplain: (key, text) =>
    set((s) => {
      const explains = { ...s.explains };
      if (text) explains[key] = text;
      else delete explains[key];
      return { explains };
    }),
  startExplain: (key) => {
    const run = (get().explainRuns[key] ?? 0) + 1;
    set((s) => ({
      explainRuns: { ...s.explainRuns, [key]: run },
      explainBusy: { ...s.explainBusy, [key]: true },
    }));
    return run;
  },
  isExplainRun: (key, run) => get().explainRuns[key] === run,
  endExplain: (key, run) => {
    if (get().explainRuns[key] !== run) return;
    set((s) => ({ explainBusy: { ...s.explainBusy, [key]: false } }));
  },
  stopExplain: (key) =>
    set((s) => ({
      explainRuns: { ...s.explainRuns, [key]: (s.explainRuns[key] ?? 0) + 1 },
      explainBusy: { ...s.explainBusy, [key]: false },
    })),
  setFileAi: (key, result) =>
    set((s) => {
      const fileAi = { ...s.fileAi };
      if (result) fileAi[key] = result;
      else delete fileAi[key];
      return { fileAi };
    }),
  startFileAi: (key, kind) => {
    const run = (get().fileAiRuns[key] ?? 0) + 1;
    set((s) => ({
      fileAiRuns: { ...s.fileAiRuns, [key]: run },
      fileAiBusy: { ...s.fileAiBusy, [key]: kind },
    }));
    return run;
  },
  isFileAiRun: (key, run) => get().fileAiRuns[key] === run,
  endFileAi: (key, run) => {
    if (get().fileAiRuns[key] !== run) return;
    set((s) => {
      const fileAiBusy = { ...s.fileAiBusy };
      delete fileAiBusy[key];
      return { fileAiBusy };
    });
  },
  stopFileAi: (key) =>
    set((s) => {
      const fileAiBusy = { ...s.fileAiBusy };
      delete fileAiBusy[key];
      return { fileAiRuns: { ...s.fileAiRuns, [key]: (s.fileAiRuns[key] ?? 0) + 1 }, fileAiBusy };
    }),
}));
