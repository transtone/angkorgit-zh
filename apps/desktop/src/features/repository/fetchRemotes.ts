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
  if (total === 0) return '未配置远端';
  if (result.failed.length === 0) return total === 1 ? '已获取 1 个远端' : `已获取全部 ${total} 个远端`;
  const failures = result.failed.map(({ name, error }) => `${name}: ${error}`).join('; ');
  return `已获取 ${result.succeeded.length}/${total} 个远端，失败：${failures}`;
}
