import { SITE } from './site';

export type PlatformId = 'macos' | 'windows' | 'linux';

export interface Platform {
  id: PlatformId;
  name: string;
  detail: string;
  asset: string;
  note: string;
}

export const BREW = 'brew install --cask cheat2001/tap/angkorgit';

export function platformsFor(version: string): Platform[] {
  return [
    {
      id: 'macos',
      name: 'macOS',
      detail: 'Intel and Apple Silicon, one file',
      asset: `AngKorGit_${version}_universal.dmg`,
      note: 'Not signed with an Apple certificate, so macOS asks once. Right-click, Open, or use Homebrew below and it never asks.',
    },
    {
      id: 'windows',
      name: 'Windows',
      detail: 'x64 installer',
      asset: `AngKorGit_${version}_x64-setup.exe`,
      note: 'SmartScreen will say the publisher is unknown. More info, then Run anyway. An .msi is on the releases page too.',
    },
    {
      id: 'linux',
      name: 'Linux',
      detail: 'AppImage, .deb and .rpm',
      asset: `AngKorGit_${version}_amd64.AppImage`,
      note: 'chmod +x and run. Needs WebKitGTK 4.1 and libssl, which most desktops already have.',
    },
  ];
}

export const PLATFORMS = platformsFor(SITE.latestVersion);

export function platform(id: PlatformId): Platform {
  const found = PLATFORMS.find((p) => p.id === id);
  if (!found) throw new Error(`unknown platform ${id}`);
  return found;
}
