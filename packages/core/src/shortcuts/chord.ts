export interface KeyChord {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export interface ChordKeyEvent {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type ChordProblem = 'no_modifier' | 'reserved' | 'unsupported_key';

const LETTER = /^Key([A-Z])$/;
const DIGIT = /^Digit([0-9])$/;
const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;

export function chordKeyFromEvent(event: Pick<ChordKeyEvent, 'key' | 'code'>): string | null {
  const letter = LETTER.exec(event.code);
  if (letter) return letter[1].toLowerCase();
  const digit = DIGIT.exec(event.code);
  if (digit) return digit[1];
  if (FUNCTION_KEY.test(event.code)) return event.code.toLowerCase();
  if (FUNCTION_KEY.test(event.key)) return event.key.toLowerCase();
  return null;
}

export function chordFromEvent(event: ChordKeyEvent): KeyChord | null {
  const key = chordKeyFromEvent(event);
  if (!key) return null;
  return { key, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey };
}

export function chordId(chord: KeyChord): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push('ctrl');
  if (chord.alt) parts.push('alt');
  if (chord.shift) parts.push('shift');
  if (chord.meta) parts.push('meta');
  parts.push(chord.key);
  return parts.join('+');
}

export function parseChordId(id: string): KeyChord | null {
  const parts = id.split('+');
  const key = parts.pop();
  if (!key) return null;
  const chord: KeyChord = { key, ctrl: false, alt: false, shift: false, meta: false };
  for (const part of parts) {
    if (part === 'ctrl' || part === 'alt' || part === 'shift' || part === 'meta') chord[part] = true;
    else return null;
  }
  return chord;
}

export function chordMatchesEvent(chord: KeyChord, event: ChordKeyEvent): boolean {
  return (
    chord.ctrl === event.ctrlKey &&
    chord.alt === event.altKey &&
    chord.shift === event.shiftKey &&
    chord.meta === event.metaKey &&
    chordKeyFromEvent(event) === chord.key
  );
}

export function chordHasModifier(chord: KeyChord): boolean {
  return chord.ctrl || chord.alt || chord.meta;
}

export function chordLabels(chord: KeyChord, mac: boolean): string[] {
  const labels: string[] = [];
  if (chord.ctrl) labels.push(mac ? '⌃' : 'Ctrl');
  if (chord.alt) labels.push(mac ? '⌥' : 'Alt');
  if (chord.shift) labels.push(mac ? '⇧' : 'Shift');
  if (chord.meta) labels.push(mac ? '⌘' : 'Win');
  labels.push(chord.key.toUpperCase());
  return labels;
}

export function chordText(chord: KeyChord, mac: boolean): string {
  return chordLabels(chord, mac).join(mac ? '' : '+');
}

const APP_MOD_KEYS = ['k', 'p', 'b', 'z', 'r', 'f', 'a', 'c', 's', 'q', 'w', 'h', 'm', 'n', 'o', 't', 'v', 'x', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const APP_MOD_SHIFT_KEYS = ['z'];

export function reservedChordIds(mac: boolean): Set<string> {
  const mod = (key: string, shift = false): string =>
    chordId({ key, ctrl: !mac, alt: false, shift, meta: mac });
  const ids = new Set<string>();
  for (const key of APP_MOD_KEYS) ids.add(mod(key));
  for (const key of APP_MOD_SHIFT_KEYS) ids.add(mod(key, true));
  if (!mac) ids.add(chordId({ key: 'f4', ctrl: false, alt: true, shift: false, meta: false }));
  return ids;
}

export function chordProblem(chord: KeyChord, mac: boolean): ChordProblem | null {
  if (!chordHasModifier(chord)) return 'no_modifier';
  if (reservedChordIds(mac).has(chordId(chord))) return 'reserved';
  return null;
}

export function repoForChord(
  shortcuts: Record<string, string>,
  event: ChordKeyEvent,
): string | null {
  for (const [path, id] of Object.entries(shortcuts)) {
    const chord = parseChordId(id);
    if (chord && chordMatchesEvent(chord, event)) return path;
  }
  return null;
}
