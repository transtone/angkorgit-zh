import { describe, expect, it } from 'vitest';
import { aiCapabilities, type AiCompletionRequest, type AiProvider } from '@angkorgit/core';

function capturingProvider(capture: (req: AiCompletionRequest) => void): AiProvider {
  return {
    id: 'openai',
    label: 'Fake',
    async complete(request) {
      capture(request);
      return { text: 'looks good', model: 'fake', provider: 'openai' };
    },
    async ping() {
      return true;
    },
  };
}

function userPrompt(request: AiCompletionRequest): string {
  return request.messages.find((m) => m.role === 'user')?.content ?? '';
}

describe('reviewStagedChanges conventions', () => {
  it('includes no convention blocks by default', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.reviewStagedChanges(
      capturingProvider((r) => (captured = r)),
      'diff --git a/x b/x',
    );
    const prompt = userPrompt(captured!);
    expect(prompt).toContain('diff --git a/x b/x');
    expect(prompt).not.toContain('review conventions');
  });

  it('includes general instructions when configured', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.reviewStagedChanges(
      capturingProvider((r) => (captured = r)),
      'diff',
      { instructions: 'Flag any raw SQL.' },
    );
    const prompt = userPrompt(captured!);
    expect(prompt).toContain('General review conventions:\nFlag any raw SQL.');
    expect(prompt).not.toContain('Project review conventions');
  });

  it('includes project instructions after general ones and marks precedence', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.reviewStagedChanges(
      capturingProvider((r) => (captured = r)),
      'diff',
      { instructions: 'Prefer tabs.', projectInstructions: 'This project uses spaces.' },
    );
    const prompt = userPrompt(captured!);
    const general = prompt.indexOf('Prefer tabs.');
    const project = prompt.indexOf('This project uses spaces.');
    expect(general).toBeGreaterThan(-1);
    expect(project).toBeGreaterThan(general);
    expect(prompt).toContain('win over the general ones');
    expect(prompt).toContain('only as guidance');
  });

  it('treats whitespace-only instructions as absent', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.reviewStagedChanges(
      capturingProvider((r) => (captured = r)),
      'diff',
      { instructions: '  \n ', projectInstructions: '' },
    );
    expect(userPrompt(captured!)).not.toContain('review conventions');
  });

  it('clips very long instructions', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.reviewStagedChanges(
      capturingProvider((r) => (captured = r)),
      'diff',
      { instructions: 'x'.repeat(10_000) },
    );
    expect(userPrompt(captured!)).toContain('…(truncated)');
  });
});

describe('single-file review and explanation', () => {
  const context = {
    file: 'src/app.ts',
    location: { kind: 'working-copy' as const, staged: true },
    otherFiles: ['src/app.ts', 'src/other.ts', 'README.md'],
  };

  it('reviewFileChanges names the file, its place, its siblings, the conventions and the patch', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.reviewFileChanges(
      capturingProvider((r) => (captured = r)),
      '--- src/app.ts\n+++ src/app.ts\n@@ -1 +1 @@\n-a\n+b',
      { ...context, instructions: 'Flag any raw SQL.', projectInstructions: 'Prefer early returns.' },
    );
    const prompt = userPrompt(captured!);
    expect(prompt).toMatch(/^Review the changes to one file\./);
    expect(prompt).toContain('File: src/app.ts');
    expect(prompt).toContain('Where: the working copy, staged.');
    expect(prompt).toContain('Other files in the same change (their diffs are NOT shown): src/other.ts, README.md.');
    expect(prompt).not.toContain('src/app.ts, src/other.ts');
    expect(prompt).toContain('**Findings**');
    expect(prompt).toContain('General review conventions:\nFlag any raw SQL.');
    expect(prompt).toContain('Project review conventions (they win over the general ones on conflict):\nPrefer early returns.');
    expect(prompt.indexOf('General review conventions')).toBeLessThan(prompt.indexOf('Project review conventions'));
    expect(prompt.endsWith('-a\n+b')).toBe(true);
    expect(captured!.maxTokens).toBe(4096);
  });

  it('reviewFileChanges without conventions has no convention block', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.reviewFileChanges(capturingProvider((r) => (captured = r)), 'diff', context);
    expect(userPrompt(captured!)).not.toContain('review conventions');
  });

  it('explainFileChanges names the commit and asks for the explanation shape', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.explainFileChanges(capturingProvider((r) => (captured = r)), 'diff body', {
      file: 'src/app.ts',
      location: { kind: 'commit', oid: 'abcdef1234567890', summary: 'fix: keep the summary' },
    });
    const prompt = userPrompt(captured!);
    expect(prompt).toContain('Where: commit abcdef12 ("fix: keep the summary").');
    expect(prompt).toContain('This is the only file in the change.');
    expect(prompt).toContain('**What it does**');
    expect(prompt).toContain('**Worth checking**');
    expect(prompt.endsWith('diff body')).toBe(true);
    expect(captured!.maxTokens).toBe(4096);
  });

  it('fileChangeContextLines caps the sibling list', () => {
    const otherFiles = Array.from({ length: 40 }, (_, i) => `f${i}.ts`);
    const lines = aiCapabilities.fileChangeContextLines({
      file: 'x.ts',
      location: { kind: 'working-copy', staged: false },
      otherFiles,
    });
    expect(lines).toContain('not yet staged');
    expect(lines).toContain('f29.ts and 10 more');
    expect(lines).not.toContain('f30.ts');
  });
});

describe('commit review and explanation', () => {
  const context = { oid: 'abcdef1234567890', summary: 'feat: add retries', files: ['a.ts', 'b.ts'] };

  it('reviewCommitChanges names the commit, its files, the conventions and the patch', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.reviewCommitChanges(capturingProvider((r) => (captured = r)), 'diff body', {
      ...context,
      instructions: 'Flag any raw SQL.',
    });
    const prompt = userPrompt(captured!);
    expect(prompt).toMatch(/^Review this commit\./);
    expect(prompt).toContain('Commit abcdef12 ("feat: add retries"). 2 files changed: a.ts, b.ts.');
    expect(prompt).toContain('**Verdict**');
    expect(prompt).toContain('General review conventions:\nFlag any raw SQL.');
    expect(prompt.endsWith('diff body')).toBe(true);
    expect(captured!.maxTokens).toBe(4096);
  });

  it('explainCommitChanges carries the commit line and the explanation shape', async () => {
    let captured: AiCompletionRequest | null = null;
    await aiCapabilities.explainCommitChanges(capturingProvider((r) => (captured = r)), 'diff body', {
      ...context,
      files: Array.from({ length: 35 }, (_, i) => `f${i}.ts`),
    });
    const prompt = userPrompt(captured!);
    expect(prompt).toMatch(/^Explain this commit\./);
    expect(prompt).toContain('35 files changed:');
    expect(prompt).toContain('f29.ts and 5 more');
    expect(prompt).toContain('**What it does**');
    expect(prompt.endsWith('diff body')).toBe(true);
  });
});
