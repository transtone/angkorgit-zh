import { toast } from 'sonner';
import { isTauri, openExternal } from '@/core/ipc';

const CHECK_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const RELEASES_URL = 'https://github.com/transtone/angkorgit-zh/releases/latest';

let inFlight: Promise<void> | null = null;
let loud = false;

async function run(): Promise<void> {
  if (loud) toast.loading('正在检查更新…', { id: 'updater' });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: CHECK_TIMEOUT_MS });

    if (!update) {
      if (loud) toast.success('AngKorGit 已是最新版本', { id: 'updater' });
      return;
    }

    toast.info(`发现新版本 AngKorGit ${update.version}`, {
      id: 'updater',
      description: '下载并重启即可更新。',
      duration: 15_000,
      action: {
        label: '立即更新',
        onClick: () => {
          void (async () => {
            try {
              toast.loading('正在下载更新…', { id: 'updater' });
              await update.downloadAndInstall(undefined, { timeout: DOWNLOAD_TIMEOUT_MS });
              toast.success('更新已安装——正在重启', { id: 'updater' });
              const { relaunch } = await import('@tauri-apps/plugin-process');
              await relaunch();
            } catch (error) {
              toast.error(`更新失败：${(error as { message?: string }).message ?? error}`, {
                id: 'updater',
                duration: Infinity,
                description: '若更新签名校验失败，请从发布页手动安装一次新版。',
                action: { label: '打开发布页', onClick: () => void openExternal(RELEASES_URL) },
              });
            }
          })();
        },
      },
    });
  } catch (error) {
    if (loud) {
      toast.error(`检查更新失败：${(error as { message?: string }).message ?? error}`, {
        id: 'updater',
        action: { label: '打开发布页', onClick: () => void openExternal(RELEASES_URL) },
      });
    }
  }
}

export async function checkForUpdates(options: { silent: boolean }): Promise<void> {
  if (!isTauri()) return;
  if (!options.silent) loud = true;
  if (!inFlight) {
    inFlight = run().finally(() => {
      inFlight = null;
      loud = false;
    });
  }
  await inFlight;
}
