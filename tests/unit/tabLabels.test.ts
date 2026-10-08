import { describe, expect, it } from 'vitest';
import { tabLabels } from '@angkorgit/core';

describe('tabLabels', () => {
  it('uses the folder name alone when names are unique', () => {
    const labels = tabLabels(['/a/temple-ui', '/b/payments']);
    expect(labels.get('/a/temple-ui')).toEqual({ name: 'temple-ui', hint: null });
    expect(labels.get('/b/payments')).toEqual({ name: 'payments', hint: null });
  });

  it('adds the nearest parent folder that tells same-named repositories apart', () => {
    const labels = tabLabels([
      '/Users/me/clients/acme-gitlab.example.internal/payments',
      '/Users/me/work/1. Projects/products/thirdparty/shared-services/payments',
    ]);
    expect(labels.get('/Users/me/clients/acme-gitlab.example.internal/payments')?.hint).toBe('acme-gitlab.example.internal');
    expect(labels.get('/Users/me/work/1. Projects/products/thirdparty/shared-services/payments')?.hint).toBe(
      'shared-services',
    );
  });

  it('walks further up when the parent folders share a name too', () => {
    const labels = tabLabels(['/work/client/api', '/home/client/api', '/x/other']);
    expect(labels.get('/work/client/api')?.hint).toBe('work/client');
    expect(labels.get('/home/client/api')?.hint).toBe('home/client');
    expect(labels.get('/x/other')?.hint).toBeNull();
  });

  it('matches names case-insensitively and handles Windows separators', () => {
    const labels = tabLabels(['C:\\code\\one\\Api', 'C:\\code\\two\\api']);
    expect(labels.get('C:\\code\\one\\Api')).toEqual({ name: 'Api', hint: 'one' });
    expect(labels.get('C:\\code\\two\\api')).toEqual({ name: 'api', hint: 'two' });
  });
});
