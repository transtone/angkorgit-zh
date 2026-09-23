import { useEffect, useState } from 'react';
import { ipc, type FontFamily } from '@/core/ipc';

let cache: Promise<FontFamily[]> | null = null;

export function loadInstalledFonts(force = false): Promise<FontFamily[]> {
  if (force || !cache) cache = ipc.fontsList().catch(() => []);
  return cache;
}

export function useInstalledFonts(): { fonts: FontFamily[]; loading: boolean } {
  const [fonts, setFonts] = useState<FontFamily[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void loadInstalledFonts().then((found) => {
      if (cancelled) return;
      setFonts(found);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { fonts, loading };
}
