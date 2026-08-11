/**
 * Bridges to the native ApkInstaller plugin (APK download + system install
 * dialog). Falls back to opening the URL in the browser on web preview, where
 * there is no native plugin.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { nativeFetch } from './native-fetch';

export interface ApkInstallerPlugin {
  downloadAndInstall(options: { url: string }): Promise<void>;
}

const native = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

/**
 * Downloads the APK in-app and opens the Android package installer dialog.
 * Returns a promise that resolves once the installer dialog has been handed
 * off to the system (not when the user finishes installing).
 */
export async function downloadAndInstallApk(url: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    // Web preview: fall back to opening the download in a new tab.
    window.open(url, '_blank');
    return;
  }
  await native.downloadAndInstall({ url });
}

/**
 * Streams a file to a Uint8Array via nativeFetch (used when the download must
 * stay inside the WebView, e.g. checking a file before install). APK installs
 * go through the native plugin instead, so this is mainly for diagnostics.
 */
export async function fetchAsArrayBuffer(url: string): Promise<Uint8Array> {
  const res = await nativeFetch(url, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}
