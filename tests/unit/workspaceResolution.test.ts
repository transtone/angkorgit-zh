import { expect, it } from 'vitest';

it('resolves desktop aliases and internal workspace packages, including dynamic imports', async () => {
  const [ui, core, designSystem] = await Promise.all([
    import('@/features/ui/store'),
    import('@angkorgit/core'),
    import('@angkorgit/design-system'),
  ]);
  expect(ui.useUi.getState().addRepoTab).toBeTypeOf('function');
  expect(core.GraphLayout).toBeTypeOf('function');
  expect(designSystem.cn('one', undefined, 'two')).toBe('one two');
});
