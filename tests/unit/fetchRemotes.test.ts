import { describe, expect, it } from 'vitest';
import { fetchRemotes, fetchResultMessage } from '../../apps/desktop/src/features/repository/fetchRemotes';

describe('fetchRemotes', () => {
  it('attempts every remote after a failure and returns failures for the caller', async () => {
    const attempted: string[] = [];
    const result = await fetchRemotes(['origin', 'upstream', 'backup'], async (name) => {
      attempted.push(name);
      if (name === 'upstream') throw new Error('authentication failed');
    });

    expect(attempted).toEqual(['origin', 'upstream', 'backup']);
    expect(result).toEqual({
      succeeded: ['origin', 'backup'],
      failed: [{ name: 'upstream', error: 'authentication failed' }],
    });
    expect(fetchResultMessage(result)).toBe('Fetched 2 of 3 remotes. Failed: upstream: authentication failed');

    const retried: string[] = [];
    const retry = await fetchRemotes(['origin', 'upstream', 'backup'], async (name) => {
      retried.push(name);
    });
    expect(retried).toEqual(['origin', 'upstream', 'backup']);
    expect(retry.failed).toEqual([]);
  });
});
