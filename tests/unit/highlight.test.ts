import { describe, expect, it } from 'vitest';
import type { DiffLine } from '@angkorgit/core';
import {
  embeddedDiffLanguages,
  embeddedLanguages,
  highlightLineState,
  languageOf,
  supportsBlockComments,
} from '@/shared/highlight';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const wholeLineIsComment = (html: string) =>
  /^<span class="hljs-comment">/.test(html) && !/hljs-(keyword|title|string|built_in)/.test(html);

describe('highlightLineState', () => {
  it('carries a JSDoc block across lines and closes it on */', () => {
    const open = highlightLineState('/**', 'typescript');
    expect(open.endsInComment).toBe(true);

    const middle = highlightLineState(
      ' * Free Bet funding dimension. Stored and transmitted PascalCase.',
      'typescript',
      true,
    );
    expect(middle.endsInComment).toBe(true);
    expect(wholeLineIsComment(middle.html)).toBe(true);
    expect(text(middle.html)).toBe(' * Free Bet funding dimension. Stored and transmitted PascalCase.');

    const close = highlightLineState(' */', 'typescript', true);
    expect(close.endsInComment).toBe(false);
    expect(wholeLineIsComment(close.html)).toBe(true);

    const code = highlightLineState('export enum EnumSponsorType {', 'typescript', false);
    expect(code.endsInComment).toBe(false);
    expect(code.html).toContain('hljs-keyword');
  });

  it('does not carry a /* that is glued to a word, such as JSX text like feature/*', () => {
    const jsx = highlightLineState(
      `<span className="font-mono">feature/*</span> → <span className="font-mono">[{'{suffix}'}]</span>.`,
      'typescript',
    );
    expect(jsx.endsInComment).toBe(false);
    expect(highlightLineState('const glob = pattern + "/" + name/*', 'typescript').endsInComment).toBe(false);
    expect(highlightLineState('const x = 1; /* trailing note', 'typescript').endsInComment).toBe(true);
    expect(highlightLineState('run(/* inline start', 'typescript').endsInComment).toBe(true);
    expect(highlightLineState('/* at line start', 'typescript').endsInComment).toBe(true);
  });

  it('does not treat line comments or glob strings as open block comments', () => {
    expect(highlightLineState('// just a note', 'typescript').endsInComment).toBe(false);
    expect(highlightLineState("const files = glob('src/**/*.ts');", 'typescript').endsInComment).toBe(false);
    expect(highlightLineState('const a = 1; /* trailing */', 'typescript').endsInComment).toBe(false);
  });

  it('resumes code after the comment closes mid-line', () => {
    const line = highlightLineState(' end of note */ const after = 1;', 'typescript', true);
    expect(line.endsInComment).toBe(false);
    expect(line.html.startsWith('<span class="hljs-comment">')).toBe(true);
    expect(line.html).toContain('hljs-keyword');
    expect(text(line.html)).toBe(' end of note */ const after = 1;');
  });

  it('handles html comments with the xml opener', () => {
    expect(highlightLineState('<!-- header', 'xml').endsInComment).toBe(true);
    const inner = highlightLineState('  still a comment <b>not a tag</b>', 'xml', true);
    expect(inner.endsInComment).toBe(true);
    expect(inner.html).not.toContain('hljs-tag');
    expect(text(inner.html)).toBe('  still a comment &lt;b&gt;not a tag&lt;/b&gt;');
    expect(highlightLineState('done -->', 'xml', true).endsInComment).toBe(false);
  });

  it('highlights a less variable and selector', () => {
    expect(languageOf('styles/theme.less')).toBe('less');
    expect(supportsBlockComments('less')).toBe(true);
    const variable = highlightLineState('@color: #fff;', 'less');
    expect(variable.html).toContain('hljs-variable');
    expect(variable.html).toContain('hljs-number');
    const rule = highlightLineState('.btn { color: red; }', 'less');
    expect(rule.html).toContain('hljs-selector-class');
    expect(rule.html).toContain('hljs-attribute');
  });

  it('maps aliases and basenames for common config and style files', () => {
    expect(languageOf('src/util.cts')).toBe('typescript');
    expect(languageOf('readme.markdown')).toBe('markdown');
    expect(languageOf('types/foo.pyi')).toBe('python');
    expect(languageOf('App.kts')).toBe('kotlin');
    expect(languageOf('board.ino')).toBe('cpp');
    expect(languageOf('index.htm')).toBe('xml');
    expect(languageOf('styles/app.scss')).toBe('scss');
    expect(languageOf('config/app.ini')).toBe('ini');
    expect(languageOf('messages.properties')).toBe('properties');
    expect(languageOf('repo/.gitignore')).toBeNull();
    expect(languageOf('.gitattributes')).toBeNull();
    expect(languageOf('.editorconfig')).toBe('ini');
    expect(languageOf('nginx.conf')).toBeNull();
    expect(languageOf('app.cfg')).toBeNull();
    expect(languageOf('Dockerfile')).toBe('dockerfile');
    expect(languageOf('path/Makefile')).toBe('makefile');
    expect(languageOf('CMakeLists.txt')).toBe('cmake');
    expect(languageOf('tool.cmake')).toBe('cmake');
  });

  it('highlights scss variables and dockerfile keywords', () => {
    expect(supportsBlockComments('scss')).toBe(true);
    const scssLine = highlightLineState('$color: #fff;', 'scss');
    expect(scssLine.html).toContain('hljs-variable');
    const docker = highlightLineState('FROM node:20-alpine', 'dockerfile');
    expect(docker.html).toContain('hljs-keyword');
    const editorconfig = highlightLineState('[*]', 'ini');
    expect(editorconfig.html).toContain('hljs-section');
  });

  it('ignores the continuation flag for languages without block comments', () => {
    expect(supportsBlockComments('python')).toBe(false);
    const line = highlightLineState('x = 1', 'python', true);
    expect(line.html).toContain('x');
    expect(line.endsInComment).toBe(false);
  });
});

const ctx = (oldLineNo: number, newLineNo: number, content: string): DiffLine => ({ kind: 'context', oldLineNo, newLineNo, content });
const add = (newLineNo: number, content: string): DiffLine => ({ kind: 'addition', oldLineNo: null, newLineNo, content });
const del = (oldLineNo: number, content: string): DiffLine => ({ kind: 'deletion', oldLineNo, newLineNo: null, content });
const hunk = (lines: DiffLine[]) => ({ header: '', oldStart: lines[0]?.oldLineNo ?? 1, oldLines: 0, newStart: lines[0]?.newLineNo ?? 1, newLines: 0, lines });

describe('astro frontmatter', () => {
  it('maps astro to the xml grammar and svelte and toml to existing grammars', () => {
    expect(languageOf('src/components/Hero.astro')).toBe('astro');
    expect(languageOf('App.svelte')).toBe('xml');
    expect(languageOf('Cargo.toml')).toBe('ini');
    expect(supportsBlockComments('astro')).toBe(true);
    expect(highlightLineState('<Header title="x" />', 'astro').html).toContain('hljs-tag');
    expect(highlightLineState('<!-- note', 'astro').endsInComment).toBe(true);
  });

  it('colours the lines between the fences as typescript in a whole file', () => {
    const langs = embeddedLanguages(['---', "import x from './x';", 'const n = 1;', '---', '<div>{n}</div>'], 'astro');
    expect(langs).toEqual(['astro', 'typescript', 'typescript', 'astro', 'astro']);
    expect(embeddedLanguages(['<div />', '---'], 'astro')).toEqual(['astro', 'astro']);
    expect(embeddedLanguages(['---', 'x'], 'typescript')).toBeNull();
  });

  it('colours script and style blocks by their language in astro, vue, svelte and html', () => {
    expect(embeddedLanguages(['<div />', '<script>', 'const a = 1;', '</script>', '<style>', 'a { b: c }', '</style>', '<p />'], 'astro')).toEqual([
      'astro', 'astro', 'typescript', 'astro', 'astro', 'css', 'astro', 'astro',
    ]);
    expect(embeddedLanguages(['<script lang="ts">', 'let n: number;', '</script>', '<style lang="scss">', '$x: 1;', '</style>'], 'xml')).toEqual([
      'xml', 'typescript', 'xml', 'xml', 'scss', 'xml',
    ]);
    expect(embeddedLanguages(['<script>', 'var v;', '</script>'], 'xml')).toEqual(['xml', 'javascript', 'xml']);
    expect(embeddedLanguages(['<script src="a.js"></script>', 'text'], 'xml')).toEqual(['xml', 'xml']);
    expect(embeddedLanguages(['<div>', 'plain'], 'css')).toBeNull();
  });

  it('reads a mid-file hunk back to its script or style closer', () => {
    const marked = embeddedDiffLanguages([hunk([ctx(30, 30, '  menu.classList.add("x");'), add(31, '  done();'), ctx(31, 32, '</script>'), ctx(32, 33, '<p />')])], 'astro');
    expect([...marked!.entries()].map(([l, lang]) => [l.content, lang])).toEqual([
      ['  menu.classList.add("x");', 'typescript'],
      ['  done();', 'typescript'],
    ]);
    const style = embeddedDiffLanguages([hunk([ctx(50, 50, 'a { color: red }'), ctx(51, 51, '</style>')])], 'xml');
    expect(style!.get(style!.keys().next().value!)).toBe('css');
  });

  it('marks frontmatter lines of a hunk that starts at the top of the file', () => {
    const lines = [ctx(1, 1, '---'), ctx(2, 2, "import a from 'a';"), add(3, 'const b = 2;'), ctx(3, 4, '---'), ctx(4, 5, '<a href={b} />'), add(6, '<p>{a}</p>')];
    const marked = embeddedDiffLanguages([hunk(lines)], 'astro');
    expect([...marked!.keys()].map((l) => l.content)).toEqual(["import a from 'a';", 'const b = 2;']);
    expect(marked!.get(lines[2])).toBe('typescript');
  });

  it('treats lines before the first fence of a mid-file hunk as frontmatter and the rest as template', () => {
    const lines = [ctx(8, 8, 'const c = 3;'), del(9, 'const gone = 4;'), ctx(10, 9, '---'), ctx(11, 10, '<c />'), add(11, '<d />')];
    const marked = embeddedDiffLanguages([hunk(lines)], 'astro');
    expect([...marked!.keys()].map((l) => l.content)).toEqual(['const c = 3;', 'const gone = 4;']);
    const template = embeddedDiffLanguages([hunk([ctx(40, 40, '<e />'), add(41, '<f />')])], 'astro');
    expect(template!.size).toBe(0);
    expect(embeddedDiffLanguages([hunk(lines)], 'css')).toBeNull();
  });
});
