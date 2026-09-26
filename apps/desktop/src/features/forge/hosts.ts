import { forgeKindForProvider, registerForgeHosts } from '@angkorgit/core';
import { ipc, type HostingAccount } from '@/core/ipc';

export function seedForgeHosts(accounts: HostingAccount[]): void {
  registerForgeHosts(
    accounts.flatMap((account) => {
      const kind = forgeKindForProvider(account.provider);
      return kind ? [{ host: account.host, kind }] : [];
    }),
  );
}

export async function seedForgeHostsFromAccounts(): Promise<void> {
  try {
    seedForgeHosts(await ipc.accountList());
  } catch {
    registerForgeHosts([]);
  }
}
