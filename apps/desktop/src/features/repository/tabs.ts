import { toast } from 'sonner';
import { useRepo } from './store';
import { killTerminalSession } from '@/features/terminal/sessions';
import { useUi } from '@/features/ui/store';

let activationSeq = 0;

export async function activateTab(path: string): Promise<void> {
  const seq = ++activationSeq;
  if (path === useRepo.getState().repo?.path && !useRepo.getState().opening) return;
  try {
    await useRepo.getState().open(path);
  } catch (error) {
    if (seq !== activationSeq) return;
    toast.error(`无法打开：${(error as { message?: string }).message ?? error}`);
    useRepo.getState().forget(path);
    useUi.getState().closeRepoTab(path);
    killTerminalSession(path);
  }
}

export function closeRepoTabs(paths: readonly string[]): void {
  activationSeq += 1;
  const ui = useUi.getState();
  const closing = new Set(paths);
  const remaining = ui.repoTabs.filter((tab) => !closing.has(tab));
  for (const tab of ui.repoTabs) {
    if (!closing.has(tab)) continue;
    ui.closeRepoTab(tab);
    useRepo.getState().forget(tab);
    killTerminalSession(tab);
  }
  const current = useRepo.getState().repo?.path;
  if (!current || !closing.has(current)) return;
  if (remaining.length > 0) void activateTab(remaining[remaining.length - 1]);
  else useRepo.getState().close();
}
