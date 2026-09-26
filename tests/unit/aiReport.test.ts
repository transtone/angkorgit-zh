import { describe, expect, it } from 'vitest';
import { locateDiffLine, parseAiReport, type FileDiff } from '@angkorgit/core';

const REVIEW = `**Summary**
Adds a guard.
Second line of the summary.

**Findings**
- Bug — \`if (x = 1)\` assigns instead of comparing. Use \`===\`.
- Risk: \`retry()\` has no cap
  and may loop forever.
- Nit \`foo\` could be \`bar\`.
- Plain bullet without a severity.

**Verdict**
Needs changes`;

describe('parseAiReport', () => {
  it('splits labelled sections, bullets, severities and the verdict', () => {
    const report = parseAiReport(REVIEW);
    expect(report.structured).toBe(true);
    expect(report.sections.map((s) => s.label)).toEqual(['Summary', 'Findings', 'Verdict']);
    expect(report.sections[0].blocks).toEqual([{ kind: 'paragraph', text: 'Adds a guard.\nSecond line of the summary.' }]);
    const findings = report.sections[1].blocks;
    expect(findings.map((b) => (b.kind === 'bullet' ? b.severity : null))).toEqual(['bug', 'risk', 'nit', null]);
    expect(findings[1]).toMatchObject({ text: '`retry()` has no cap and may loop forever.' });
    expect(findings[2]).toMatchObject({ text: '`foo` could be `bar`.' });
    expect(report.verdict).toEqual({ text: 'Needs changes', tone: 'danger' });
  });

  it('reads a safe verdict and an uncertain one', () => {
    expect(parseAiReport('**Verdict**\nLooks safe').verdict?.tone).toBe('success');
    expect(parseAiReport('**Verdict**\nNeeds a closer look at the retry loop').verdict?.tone).toBe('attention');
  });

  it('treats free text without labels as unstructured', () => {
    const report = parseAiReport('- one\n- two\nplain');
    expect(report.structured).toBe(false);
    expect(report.verdict).toBeNull();
  });

  it('keeps a bold span inside a sentence out of the labels', () => {
    const report = parseAiReport('**Changes**\n- This **really** matters.');
    expect(report.sections.map((s) => s.label)).toEqual(['Changes']);
    expect(report.sections[0].blocks[0]).toMatchObject({ text: 'This **really** matters.' });
  });
});

function diffWith(lines: Array<[FileDiff['hunks'][0]['lines'][0]['kind'], string]>): FileDiff {
  return {
    path: 'a.ts',
    oldPath: null,
    status: 'modified',
    hunks: [
      {
        header: '@@ -1 +1 @@',
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: lines.map(([kind, content], i) => ({ kind, content, oldLineNo: i, newLineNo: i })),
      },
    ],
    isBinary: false,
    isImage: false,
    oldImage: null,
    newImage: null,
    additions: 1,
    deletions: 0,
  };
}

describe('locateDiffLine', () => {
  const diff = diffWith([
    ['context', 'const keep = true;'],
    ['deletion', '  const old = retry();'],
    ['addition', '  const next = retry(3);'],
    ['addition', 'export { keep, next };'],
  ]);

  it('prefers an exact match in an added line and reports the span', () => {
    const hit = locateDiffLine(diff, 'retry(3)');
    expect(hit?.line.kind).toBe('addition');
    expect(hit && hit.line.content.slice(hit.start, hit.end)).toBe('retry(3)');
  });

  it('falls back to a deletion, then context, and then whitespace-insensitive matching', () => {
    expect(locateDiffLine(diff, 'retry()')?.line.kind).toBe('deletion');
    expect(locateDiffLine(diff, 'keep = true')?.line.kind).toBe('context');
    const loose = locateDiffLine(diff, 'const   next  =  retry(3);');
    expect(loose?.line.kind).toBe('addition');
    expect(loose).toMatchObject({ start: 0 });
  });

  it('returns null for tiny or absent snippets', () => {
    expect(locateDiffLine(diff, 'x')).toBeNull();
    expect(locateDiffLine(diff, 'nothing like this')).toBeNull();
  });
});
