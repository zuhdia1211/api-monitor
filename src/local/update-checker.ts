/**
 * In-app update checker.
 *
 * The app is distributed as a standalone APK (no Play Store), so updates are
 * checked against a hosted manifest. Two sources are supported:
 *
 * 1. GitHub releases — `updateCheckUrl` = `https://github.com/OWNER/REPO`.
 *    Uses the public releases API (`/releases/latest`); the APK asset with the
 *    highest version wins.
 * 2. Plain `version.json` — any URL returning
 *    `{ "version": "1.1.0", "url": "https://.../app.apk", "notes": "..." }`.
 */
import { App as CapacitorApp } from '@capacitor/app';
import { getSettings } from './store';
import { nativeFetch } from './native-fetch';

export interface UpdateInfo {
  available: boolean;
  latestVersion?: string;
  downloadUrl?: string;
  notes?: string;
  source?: 'github' | 'manifest';
}

function parseVersion(v: string): number[] {
  // "v1.2.3" / "1.2.3-beta" -> [1, 2, 3]
  const m = String(v).trim().replace(/^v/i, '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [];
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (a.length === 0 || b.length === 0) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

async function currentAppVersion(): Promise<string> {
  try {
    const info = await CapacitorApp.getInfo();
    return info.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Detects a GitHub repo URL and returns its "OWNER/REPO" pair, if any. */
function githubRepo(url: string): string | null {
  const m = String(url).match(/github\.com\/([^/]+)\/([^/?#]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

async function checkGithub(repo: string): Promise<UpdateInfo | null> {
  try {
    const res = await nativeFetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      timeoutMs: 10000,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tag = data?.tag_name || '';
    const asset = (data?.assets || []).find((a: any) => /\.apk$/i.test(a?.name || ''));
    if (!tag || !asset?.browser_download_url) return null;
    return {
      available: false,
      latestVersion: tag,
      downloadUrl: asset.browser_download_url,
      notes: data?.body || '',
      source: 'github',
    };
  } catch {
    return null;
  }
}

async function checkManifest(url: string): Promise<UpdateInfo | null> {
  try {
    const res = await nativeFetch(url, {
      headers: { Accept: 'application/json' },
      timeoutMs: 10000,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.version || !data?.url) return null;
    return {
      available: false,
      latestVersion: String(data.version),
      downloadUrl: String(data.url),
      notes: data.notes || '',
      source: 'manifest',
    };
  } catch {
    return null;
  }
}

/**
 * Looks up the configured update source and compares against the installed
 * version. Returns `available: true` only when a newer version exists.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    const settings = await getSettings();
    const url = settings.updateCheckUrl?.trim();
    if (!url) return { available: false };

    const repo = githubRepo(url);
    const found = repo ? await checkGithub(repo) : await checkManifest(url);
    if (!found) return { available: false };

    const current = await currentAppVersion();
    const available = isNewer(found.latestVersion!, current);
    return { ...found, available };
  } catch {
    return { available: false };
  }
}
