import { Capacitor } from '@capacitor/core';
import type { Language } from './i18n/types';
import { DocumentationPdfWriter } from './documentationPdfTextLayout';
import { getPdfFontSetForLanguage, getPdfLatinFallbackFontSet, type PdfFontSet } from './pdfFontConfig';
import { shareOrDownloadBlob } from './shareDownloadBlob';

/** html2pdf 失敗時常殘留 overlay（z-index:1000），會擋住 Alert 的確認按鈕 */
export function removeHtml2PdfOverlays(): void {
  document.querySelectorAll('.html2pdf__overlay').forEach(el => el.remove());
}

const fontCache = new Map<string, { regular: string; bold: string }>();

function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('read_failed'));
        return;
      }
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(new Blob([buffer]));
  });
}

async function fetchFontBase64(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error('font_load_failed');
  return arrayBufferToBase64(await res.arrayBuffer());
}

async function loadPdfFonts(fontSet: PdfFontSet): Promise<{ regular: string; bold: string }> {
  const cached = fontCache.get(fontSet.id);
  if (cached) return cached;

  const [regular, bold] = await Promise.all([
    fetchFontBase64(fontSet.regularPath),
    fetchFontBase64(fontSet.boldPath),
  ]);
  const loaded = { regular, bold };
  fontCache.set(fontSet.id, loaded);
  return loaded;
}

function registerPdfFonts(
  pdf: import('jspdf').jsPDF,
  fontSet: PdfFontSet,
  fonts: { regular: string; bold: string }
): void {
  pdf.addFileToVFS(fontSet.regularVfs, fonts.regular);
  pdf.addFileToVFS(fontSet.boldVfs, fonts.bold);
  pdf.addFont(fontSet.regularVfs, fontSet.family, 'normal');
  pdf.addFont(fontSet.boldVfs, fontSet.family, 'bold');
  pdf.setFont(fontSet.family, 'normal');
}

/** jsPDF 文字排版（iOS WKWebView 無法用 html2canvas 渲染 CJK／阿拉伯文等） */
async function renderPdfBlobFromMarkdownText(
  markdown: string,
  language: Language
): Promise<Blob> {
  const fontSet = getPdfFontSetForLanguage(language);
  const needsLatinFallback = fontSet.id === 'arabic' || fontSet.id === 'devanagari';
  const latinFontSet = needsLatinFallback ? getPdfLatinFallbackFontSet() : null;

  const [{ jsPDF }, fonts, latinFonts] = await Promise.all([
    import('jspdf'),
    loadPdfFonts(fontSet),
    latinFontSet ? loadPdfFonts(latinFontSet) : Promise.resolve(null),
  ]);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  registerPdfFonts(pdf, fontSet, fonts);
  if (latinFontSet && latinFonts) {
    registerPdfFonts(pdf, latinFontSet, latinFonts);
  }

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;

  const writer = new DocumentationPdfWriter(pdf, margin, pageWidth, pageHeight, fontSet.family, {
    latinFontFamily: latinFontSet?.family,
    fontSplitMode:
      fontSet.id === 'arabic' ? 'arabic' : fontSet.id === 'devanagari' ? 'devanagari' : 'none',
  });
  writer.renderMarkdown(markdown);

  return pdf.output('blob');
}

const HTML2CANVAS_OPTS = {
  scale: 2,
  backgroundColor: '#ffffff',
  logging: false,
  scrollX: 0,
  scrollY: 0,
  useCORS: true,
  allowTaint: true,
} as const;

/** 深色模式下 .dark body 會讓文字變淺；截圖前強制白底黑字，避免 PDF 對比過低 */
function applyPdfExportColors(root: ParentNode): void {
  const el = root instanceof HTMLElement && root.matches('[data-pdf-documentation]')
    ? root
    : root.querySelector<HTMLElement>('[data-pdf-documentation]');
  if (!el) return;

  el.style.setProperty('background-color', '#ffffff', 'important');
  el.style.setProperty('color', '#000000', 'important');

  el.querySelectorAll<HTMLElement>('*').forEach(node => {
    node.style.setProperty('color', '#000000', 'important');
    if (node.tagName !== 'STRONG' && node.tagName !== 'H2' && node.tagName !== 'H3' && node.tagName !== 'H4') {
      node.style.setProperty('background-color', 'transparent', 'important');
    }
  });

  el.querySelectorAll<HTMLElement>('blockquote, .text-slate-600').forEach(node => {
    node.style.setProperty('color', '#334155', 'important');
  });

  el.querySelectorAll<HTMLElement>('.text-slate-400').forEach(node => {
    node.style.setProperty('color', '#475569', 'important');
  });
}

async function renderPdfBlobHtml2pdf(element: HTMLElement, filename: string): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;

  try {
    const result = await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: 'png' },
        html2canvas: {
          ...HTML2CANVAS_OPTS,
          onclone: (clonedDoc: Document) => {
            applyPdfExportColors(clonedDoc);
          },
          width: element.scrollWidth,
          height: element.scrollHeight,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(element)
      .outputPdf('blob');

    return result instanceof Blob
      ? result
      : new Blob([result as BlobPart], { type: 'application/pdf' });
  } finally {
    removeHtml2PdfOverlays();
  }
}

async function renderPdfBlob(
  markdownContent: string,
  language: Language,
  webElement: HTMLElement | null | undefined,
  filename: string
): Promise<Blob> {
  // 優先 jsPDF 向量文字：對比穩定、可選取、檔案小；html2pdf 截圖易偏淡且動輒數十 MB
  try {
    return await renderPdfBlobFromMarkdownText(markdownContent, language);
  } catch {
    if (Capacitor.isNativePlatform() || !webElement) {
      throw new Error('pdf_render_failed');
    }
    try {
      return await renderPdfBlobHtml2pdf(webElement, filename);
    } catch {
      removeHtml2PdfOverlays();
      throw new Error('pdf_render_failed');
    }
  }
}

/** 將使用說明匯出為 PDF；iOS／Android 以系統分享（可存至「檔案」），Web 則觸發下載。 */
export async function downloadDocumentationPdf(
  markdownContent: string,
  filename: string,
  shareTitle: string,
  language: Language,
  webElement?: HTMLElement | null
): Promise<void> {
  try {
    const blob = await renderPdfBlob(markdownContent, language, webElement, filename);
    await shareOrDownloadBlob(blob, filename, {
      shareTitle,
      mimeType: 'application/pdf',
      minSize: 64,
    });
  } finally {
    removeHtml2PdfOverlays();
  }
}
