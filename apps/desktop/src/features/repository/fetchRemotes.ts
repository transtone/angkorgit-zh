export interface FetchResult {
  succeeded: string[];
  failed: { name: string; error: string }[];
}

export async function fetchRemotes(
  names: string[],
  fetchOne: (name: string) => Promise<unknown>,
): Promise<FetchResult> {
  const result: FetchResult = { succeeded: [], failed: [] };
  for (const name of names) {
    try {
      await fetchOne(name);
      result.succeeded.push(name);
    } catch (error) {
      result.failed.push({ name, error: (error as { message?: string })?.message ?? String(error) });
    }
  }
  return result;
}

export function fetchResultMessage(result: FetchResult): string {
  const total = result.succeeded.length + result.failed.length;
  if (total === 0) return 'No remotes configured';
  if (result.failed.length === 0) return total === 1 ? 'Fetched 1 remote' : `Fetched all ${total} remotes`;
  const failures = result.failed.map(({ name, error }) => `${name}: ${error}`).join('; ');
  return `Fetched ${result.succeeded.length} of ${total} remotes. Failed: ${failures}`;
}
