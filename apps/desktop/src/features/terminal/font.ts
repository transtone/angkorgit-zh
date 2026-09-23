export const INTERFACE_FONT_DEFAULT = 'Inter';
export const CODE_FONT_DEFAULT = 'JetBrains Mono';
export const TERMINAL_FONT_SIZE_DEFAULT = 12;
export const TERMINAL_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20] as const;

const INTERFACE_STACK = "'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif";
const CODE_STACK = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

export const cleanFontFamily = (family: string): string => family.trim().replace(/["']/g, '');

export function interfaceFontStack(family: string): string {
  const custom = cleanFontFamily(family);
  return custom && custom !== INTERFACE_FONT_DEFAULT ? `'${custom}', ${INTERFACE_STACK}` : INTERFACE_STACK;
}

export function monoFontStack(family: string): string {
  const custom = cleanFontFamily(family);
  return custom && custom !== CODE_FONT_DEFAULT ? `'${custom}', ${CODE_STACK}` : CODE_STACK;
}

export function clampTerminalFontSize(size: number): number {
  if (!Number.isFinite(size)) return TERMINAL_FONT_SIZE_DEFAULT;
  return Math.min(TERMINAL_FONT_SIZES[TERMINAL_FONT_SIZES.length - 1], Math.max(TERMINAL_FONT_SIZES[0], Math.round(size)));
}
