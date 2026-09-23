const FALLBACK_VERSION = '0.15.1';

async function latestReleaseVersion(): Promise<string> {
  try {
    const res = await fetch('https://api.github.com/repos/wuwuzhazha/angkorgit-zh/releases/latest', {
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return FALLBACK_VERSION;
    const data = (await res.json()) as { tag_name?: string };
    const tag = typeof data.tag_name === 'string' ? data.tag_name : '';
    return /^v\d+\.\d+\.\d+$/.test(tag) ? tag.slice(1) : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

export const SITE = {
  name: 'AngKorGit',
  alternateNames: ['Angkor Git', 'AngkorGit', 'angkorgit', 'Git Angkor', 'GitAngkor', 'gitangkor'],
  title:
    'AngKorGit（Angkor Git）——快速、免费的 Git 客户端与 Git GUI，支持 macOS、Windows 和 Linux',
  description:
    'Angkor Git (AngKorGit) 是一款快速、免费、开源的 Git 客户端与 Git GUI，适用于 macOS、Windows 和 Linux，基于 Tauri v2、Rust 与 libgit2 原生构建。可视化提交图、并排 diff 审查、可视化冲突解决与 AI 辅助。',
  repo: 'https://github.com/wuwuzhazha/angkorgit-zh',
  releases: 'https://github.com/wuwuzhazha/angkorgit-zh/releases',
  license: 'https://github.com/wuwuzhazha/angkorgit-zh/blob/main/LICENSE',
  docs: 'https://github.com/wuwuzhazha/angkorgit-zh/tree/main/docs',
  contributing: 'https://github.com/wuwuzhazha/angkorgit-zh/blob/main/docs/Contributing.md',
  codeOfConduct: 'https://github.com/wuwuzhazha/angkorgit-zh/blob/main/CODE_OF_CONDUCT.md',
  security: 'https://github.com/wuwuzhazha/angkorgit-zh/blob/main/SECURITY.md',
  ci: 'https://github.com/wuwuzhazha/angkorgit-zh/actions/workflows/ci.yml',
  buyMeACoffee: 'https://buymeacoffee.com/chansocheatsok',
  tagline: '日常 Git，令人愉悦。',
  latestVersion: await latestReleaseVersion(),
  latestUrl: 'https://github.com/wuwuzhazha/angkorgit-zh/releases',
  assetUrl: (version: string, asset: string) =>
    `https://github.com/wuwuzhazha/angkorgit-zh/releases/download/v${version}/${asset}`,
};

export const NAV = [
  { href: '/#conflicts', label: '功能简介' },
  { href: '/#box', label: '内置功能' },
  { href: '/#install', label: '安装' },
  { href: '/docs/', label: '文档' },
] as const;
