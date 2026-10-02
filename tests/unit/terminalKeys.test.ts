import { describe, expect, it } from 'vitest';
import { altArrowSequence, type TerminalKeyEvent } from '../../apps/desktop/src/features/terminal/keys';

function key(overrides: Partial<TerminalKeyEvent>): TerminalKeyEvent {
  return { type: 'keydown', key: 'ArrowUp', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}

describe('altArrowSequence', () => {
  it('sends the alt modifier sequence for Alt+Up and Alt+Down', () => {
    expect(altArrowSequence(key({}))).toBe('\x1b[1;3A');
    expect(altArrowSequence(key({ key: 'ArrowDown' }))).toBe('\x1b[1;3B');
  });

  it('leaves every other key to xterm', () => {
    expect(altArrowSequence(key({ altKey: false }))).toBeNull();
    expect(altArrowSequence(key({ ctrlKey: true }))).toBeNull();
    expect(altArrowSequence(key({ metaKey: true }))).toBeNull();
    expect(altArrowSequence(key({ shiftKey: true }))).toBeNull();
    expect(altArrowSequence(key({ key: 'ArrowLeft' }))).toBeNull();
    expect(altArrowSequence(key({ key: 'ArrowRight' }))).toBeNull();
    expect(altArrowSequence(key({ key: 'a' }))).toBeNull();
  });

  it('acts on keydown only so keypress and keyup are not sent twice', () => {
    expect(altArrowSequence(key({ type: 'keypress' }))).toBeNull();
    expect(altArrowSequence(key({ type: 'keyup' }))).toBeNull();
  });
});
