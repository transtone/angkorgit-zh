import { describe, expect, it } from 'vitest';
import {
  chordFromEvent,
  chordId,
  chordLabels,
  chordMatchesEvent,
  chordProblem,
  parseChordId,
  repoForChord,
} from '@angkorgit/core';

const press = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}, key = '') => ({
  key,
  code,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
  metaKey: mods.meta ?? false,
});

describe('key chords', () => {
  it('reads letters and digits from the physical key, so ⌥A on macOS is still A', () => {
    expect(chordFromEvent(press('KeyA', { alt: true }, 'å'))).toEqual({ key: 'a', ctrl: false, alt: true, shift: false, meta: false });
    expect(chordFromEvent(press('Digit3', { ctrl: true }, '3'))?.key).toBe('3');
    expect(chordFromEvent(press('F5', { ctrl: true }, 'F5'))?.key).toBe('f5');
  });

  it('ignores keys outside letters, digits and function keys', () => {
    expect(chordFromEvent(press('ControlLeft', { ctrl: true }, 'Control'))).toBeNull();
    expect(chordFromEvent(press('Escape', {}, 'Escape'))).toBeNull();
    expect(chordFromEvent(press('BracketLeft', { meta: true }, '['))).toBeNull();
  });

  it('round-trips through the canonical id', () => {
    const chord = { key: 't', ctrl: true, alt: false, shift: true, meta: false };
    expect(chordId(chord)).toBe('ctrl+shift+t');
    expect(parseChordId('ctrl+shift+t')).toEqual(chord);
    expect(parseChordId('bogus+t')).toBeNull();
    expect(parseChordId('')).toBeNull();
  });

  it('matches only the exact modifier set', () => {
    const chord = parseChordId('ctrl+a')!;
    expect(chordMatchesEvent(chord, press('KeyA', { ctrl: true }, 'a'))).toBe(true);
    expect(chordMatchesEvent(chord, press('KeyA', { ctrl: true, shift: true }, 'A'))).toBe(false);
    expect(chordMatchesEvent(chord, press('KeyA', { meta: true }, 'a'))).toBe(false);
  });

  it('labels chords per platform', () => {
    const chord = parseChordId('ctrl+shift+meta+a')!;
    expect(chordLabels(chord, true)).toEqual(['⌃', '⇧', '⌘', 'A']);
    expect(chordLabels(chord, false)).toEqual(['Ctrl', 'Shift', 'Win', 'A']);
  });

  it('refuses chords without ctrl, alt or command and chords the app already uses', () => {
    expect(chordProblem(parseChordId('a')!, true)).toBe('no_modifier');
    expect(chordProblem(parseChordId('shift+a')!, true)).toBe('no_modifier');
    expect(chordProblem(parseChordId('meta+k')!, true)).toBe('reserved');
    expect(chordProblem(parseChordId('ctrl+k')!, true)).toBeNull();
    expect(chordProblem(parseChordId('ctrl+k')!, false)).toBe('reserved');
    expect(chordProblem(parseChordId('meta+1')!, true)).toBe('reserved');
    expect(chordProblem(parseChordId('ctrl+shift+a')!, true)).toBeNull();
  });

  it('finds the repository bound to a key event', () => {
    const shortcuts = { '/repos/alla': 'ctrl+a', '/repos/cara': 'ctrl+c' };
    expect(repoForChord(shortcuts, press('KeyC', { ctrl: true }, 'c'))).toBe('/repos/cara');
    expect(repoForChord(shortcuts, press('KeyB', { ctrl: true }, 'b'))).toBeNull();
  });
});
