import { Capacitor } from '@capacitor/core';

/** iOS/Android 使用原生瀏覽器；Web 使用新分頁 */
export async function openExternalUrl(url: string): Promise<void> {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
