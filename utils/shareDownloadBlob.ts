import { Capacitor } from '@capacitor/core';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('read_failed'));
        return;
      }
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

async function shareFileNative(blob: Blob, filename: string, shareTitle?: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  const safeName = `${Date.now()}_${filename.replace(/[^\w.-]/g, '_') || 'TradeView_export'}`;
  const base64 = await blobToBase64(blob);

  const { uri } = await Filesystem.writeFile({
    path: safeName,
    data: base64,
    directory: Directory.Cache,
  });

  const title = shareTitle ?? filename;
  try {
    await Share.share({
      title,
      files: [uri],
    });
  } catch {
    await Share.share({
      title,
      url: uri,
      dialogTitle: title,
    });
  }
}

function isMobileWeb(): boolean {
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('download_failed');
  }
}

export type ShareDownloadBlobOptions = {
  /** 郵件分享主旨；iOS 原生 Share 僅作 subject，不另存文字檔 */
  shareTitle?: string;
  mimeType?: string;
  minSize?: number;
};

/**
 * iOS／Android 以 Capacitor 原生分享（可存至「檔案」）；行動版 Web 可用 Web Share，桌面 Web 直接下載。
 * 勿在 navigator.share 同時帶 title + files，否則「儲存到檔案」可能多存一份僅含標題的 .txt。
 */
export async function shareOrDownloadBlob(
  blob: Blob,
  filename: string,
  options: ShareDownloadBlobOptions = {}
): Promise<void> {
  const { shareTitle, mimeType = blob.type || 'application/octet-stream', minSize } = options;

  if (!blob || (minSize != null && blob.size < minSize)) {
    throw new Error('empty_file');
  }

  const fileBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });

  if (Capacitor.isNativePlatform()) {
    await shareFileNative(fileBlob, filename, shareTitle);
    return;
  }

  // Windows／macOS 桌面瀏覽器的 Web Share 會開系統分享面板，下載類操作改直接存檔
  if (isMobileWeb() && navigator.share) {
    try {
      const file = new File([fileBlob], filename, { type: mimeType });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
    }
  }

  triggerBrowserDownload(fileBlob, filename);
}
