import { create } from 'zustand';
import { toast } from 'sonner';
import type { IpcError } from '@/core/ipc';
import { useRepo } from '@/features/repository/store';
import { basename } from '@/shared/utils';
import { HookFailedDialog, type HookOperation } from './HookFailedDialog';

export interface HookFailureReport {
  repoPath: string;
  operation: HookOperation;
  error: IpcError;
  retry: () => void;
}

const useHookFailures = create<{ pending: Record<string, HookFailureReport> }>(() => ({ pending: {} }));

const ELSEWHERE: Record<HookOperation, (repo: string) => string> = {
  commit: (repo) => `${repo} 中未创建任何提交。返回该仓库可查看钩子输出。`,
  amend: (repo) => `${repo} 中的上一次提交未被修改。返回该仓库可查看钩子输出。`,
};

export function isHookFailure(error: unknown): error is IpcError {
  return typeof error === 'object' && error !== null && (error as Partial<IpcError>).code === 'hook_failed';
}

export function reportHookFailure(report: HookFailureReport): void {
  useHookFailures.setState((s) => ({ pending: { ...s.pending, [report.repoPath]: report } }));
  if (useRepo.getState().repo?.path !== report.repoPath) {
    toast.error(report.error.message || '钩子阻止了此操作。', {
      description: ELSEWHERE[report.operation](basename(report.repoPath)),
    });
  }
}

function dismiss(repoPath: string): void {
  useHookFailures.setState((s) => {
    const pending = { ...s.pending };
    delete pending[repoPath];
    return { pending };
  });
}

export function HookFailureHost() {
  const path = useRepo((s) => s.repo?.path ?? null);
  const report = useHookFailures((s) => (path ? (s.pending[path] ?? null) : null));
  return (
    <HookFailedDialog
      failure={report ? { operation: report.operation, message: report.error.message, output: report.error.detail ?? '' } : null}
      onClose={() => {
        if (report) dismiss(report.repoPath);
      }}
      onRetry={() => {
        if (!report) return;
        dismiss(report.repoPath);
        report.retry();
      }}
    />
  );
}
