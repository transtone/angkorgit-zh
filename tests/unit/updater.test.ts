import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  info: vi.fn(), loading: vi.fn(), success: vi.fn(), error: vi.fn(),
  openExternal: vi.fn(), check: vi.fn(), relaunch: vi.fn(),
}));
// Resolve dependency mocks from the desktop workspace, just like check.ts.
vi.mock('../../apps/desktop/node_modules/sonner', () => ({ toast: mocks }));
vi.mock('@/core/ipc', () => ({ isTauri: () => true, openExternal: mocks.openExternal }));
vi.mock('../../apps/desktop/node_modules/@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('../../apps/desktop/node_modules/@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));

describe('updater failures', () => {
  it('keeps a signature failure visible and offers manual download without relaunching', async () => {
    const { checkForUpdates } = await import('../../apps/desktop/src/features/updater/check');
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error('Signature verification failed'));
    mocks.check.mockResolvedValue({ version: '0.26.1', downloadAndInstall });
    await checkForUpdates({ silent: false });
    expect(mocks.check).toHaveBeenCalledWith({ timeout: 15_000 });
    expect(mocks.info).toHaveBeenCalled();
    mocks.info.mock.calls[0][1].action.onClick();
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled());
    const [message, options] = mocks.error.mock.calls[0];
    expect(message).toContain('Signature verification failed');
    expect(options.duration).toBe(Infinity);
    expect(options.description).toContain('手动安装');
    options.action.onClick();
    expect(mocks.openExternal).toHaveBeenCalledWith('https://github.com/transtone/angkorgit-zh/releases/latest');
    expect(downloadAndInstall).toHaveBeenCalledWith(undefined, { timeout: 60_000 });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});
