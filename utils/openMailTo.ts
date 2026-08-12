import { Capacitor } from '@capacitor/core';

function buildMailtoUrl(to: string, subject?: string, body?: string): string {
  const parts: string[] = [];
  // 勿用 URLSearchParams：空格會變成 +，iOS 郵件 App 會原樣顯示
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${to}${parts.length ? `?${parts.join('&')}` : ''}`;
}

/** 開啟系統郵件 App（預填收件人／主旨／內文；使用者仍需自行按「傳送」） */
export function openMailTo(to: string, subject?: string, body?: string): void {
  const url = buildMailtoUrl(to, subject, body);

  if (Capacitor.isNativePlatform()) {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('target', '_system');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  window.location.href = url;
}
