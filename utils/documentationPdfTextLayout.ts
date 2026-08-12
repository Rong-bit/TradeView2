import type { jsPDF } from 'jspdf';

const SLATE_900: [number, number, number] = [0, 0, 0];
const SLATE_700: [number, number, number] = [30, 41, 59];
const SLATE_600: [number, number, number] = [51, 65, 85];
const SLATE_500: [number, number, number] = [71, 85, 105];

/** 不可放在行首（CJK 排版） */
const NO_BREAK_BEFORE = /[,:;!?)\]}>.]/;

type FontSplitMode = 'none' | 'arabic' | 'devanagari';

type TextSegment = { text: string; bold: boolean; fontFamily: string };

export type DocumentationPdfWriterOptions = {
  latinFontFamily?: string;
  fontSplitMode?: FontSplitMode;
};

export type RichTextStyle = {
  fontSize: number;
  lineHeight: number;
  color?: [number, number, number];
  gapBefore?: number;
  gapAfter?: number;
  x?: number;
  maxWidth?: number;
  forceBold?: boolean;
};

function isArabicChar(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

function isDevanagariChar(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return cp >= 0x0900 && cp <= 0x097f;
}

/**
 * Fontsource 繁中子集不含部分全形標點；改為 ASCII 或保留可顯示字元。
 * （「」、。等仍保留 App 內書名號與句號風格）
 */
export function normalizePdfPunctuation(text: string): string {
  return text
    .replace(/\uFF08/g, '(')
    .replace(/\uFF09/g, ')')
    .replace(/\uFF0C/g, ',')
    .replace(/\uFF1B/g, ';')
    .replace(/\uFF1A/g, ':')
    .replace(/\uFF0F/g, '/')
    .replace(/\uFF0B/g, '+')
    .replace(/\uFF1D/g, '=')
    .replace(/\u300C/g, '"')
    .replace(/\u300D/g, '"')
    .replace(/\u2192/g, '->')
    .replace(/\u2194/g, '<->')
    .replace(/\u2248/g, '~=')
    .replace(/\u2260/g, '!=')
    .replace(/\u3001/g, ',')
    .replace(/\u00D7/g, 'x')
    .replace(/\u2212|\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u00AB/g, '"')
    .replace(/\u00BB/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2460/g, '(1)')
    .replace(/\u2461/g, '(2)')
    .replace(/\u26A0\uFE0F?/g, '[!]')
    .replace(/\u{1F50D}/gu, '')
    .replace(/\uFF1F/g, '?')
    .replace(/\uFE0F/g, '');
}

type ParsedSegment = { text: string; bold: boolean };

function parseInlineSegments(text: string, forceBold = false): ParsedSegment[] {
  const normalized = normalizePdfPunctuation(text);
  if (!normalized.includes('**')) {
    return [{ text: normalized, bold: forceBold }];
  }

  const segments: ParsedSegment[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: normalized.slice(lastIndex, match.index), bold: forceBold });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    segments.push({ text: normalized.slice(lastIndex), bold: forceBold });
  }

  return segments.filter(seg => seg.text.length > 0);
}

function fontForChar(char: string, primaryFamily: string, latinFamily: string, mode: FontSplitMode): string {
  if (mode === 'arabic') return isArabicChar(char) ? primaryFamily : latinFamily;
  if (mode === 'devanagari') return isDevanagariChar(char) ? primaryFamily : latinFamily;
  return primaryFamily;
}

function expandSegmentsForFonts(
  segments: ParsedSegment[],
  primaryFamily: string,
  latinFamily: string | undefined,
  mode: FontSplitMode
): TextSegment[] {
  if (!latinFamily || mode === 'none') {
    return segments.map(seg => ({ ...seg, fontFamily: primaryFamily }));
  }

  const expanded: TextSegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    let buf = '';
    let currentFont = fontForChar(seg.text[0], primaryFamily, latinFamily, mode);
    for (const char of seg.text) {
      const nextFont = fontForChar(char, primaryFamily, latinFamily, mode);
      if (buf && nextFont !== currentFont) {
        expanded.push({ text: buf, bold: seg.bold, fontFamily: currentFont });
        buf = '';
      }
      currentFont = nextFont;
      buf += char;
    }
    if (buf) expanded.push({ text: buf, bold: seg.bold, fontFamily: currentFont });
  }
  return expanded;
}

function measureSegment(pdf: jsPDF, segment: TextSegment, fontSize: number): number {
  pdf.setFont(segment.fontFamily, segment.bold ? 'bold' : 'normal');
  pdf.setFontSize(fontSize);
  return pdf.getTextWidth(segment.text);
}

function appendCharToLine(line: TextSegment[], char: string, bold: boolean, fontFamily: string): void {
  const last = line[line.length - 1];
  if (last && last.bold === bold && last.fontFamily === fontFamily) {
    last.text += char;
  } else {
    line.push({ text: char, bold, fontFamily });
  }
}

/** 依字元換行，並遵守中文標點禁則 */
function wrapRichSegments(
  pdf: jsPDF,
  segments: TextSegment[],
  maxWidth: number,
  fontSize: number
): TextSegment[][] {
  const lines: TextSegment[][] = [];
  let currentLine: TextSegment[] = [];
  let currentWidth = 0;

  const pushChar = (char: string, bold: boolean, fontFamily: string): void => {
    const charWidth = measureSegment(pdf, { text: char, bold, fontFamily }, fontSize);

    if (currentWidth + charWidth > maxWidth && currentLine.length > 0) {
      if (NO_BREAK_BEFORE.test(char)) {
        appendCharToLine(currentLine, char, bold, fontFamily);
        currentWidth += charWidth;
        return;
      }
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }

    appendCharToLine(currentLine, char, bold, fontFamily);
    currentWidth += charWidth;
  };

  for (const segment of segments) {
    for (const char of segment.text) {
      pushChar(char, segment.bold, segment.fontFamily);
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

export class DocumentationPdfWriter {
  private y: number;
  private readonly latinFontFamily?: string;
  private readonly fontSplitMode: FontSplitMode;

  constructor(
    private readonly pdf: jsPDF,
    private readonly margin: number,
    private readonly pageWidth: number,
    private readonly pageHeight: number,
    private readonly fontFamily: string,
    options: DocumentationPdfWriterOptions = {}
  ) {
    this.y = margin;
    this.latinFontFamily = options.latinFontFamily;
    this.fontSplitMode = options.fontSplitMode ?? 'none';
  }

  private get maxWidth(): number {
    return this.pageWidth - this.margin * 2;
  }

  private markerFontFamily(): string {
    return this.latinFontFamily ?? this.fontFamily;
  }

  private toLayoutSegments(segments: ParsedSegment[]): TextSegment[] {
    return expandSegmentsForFonts(segments, this.fontFamily, this.latinFontFamily, this.fontSplitMode);
  }

  private ensureSpace(needed: number): void {
    if (this.y + needed > this.pageHeight - this.margin) {
      this.pdf.addPage();
      this.y = this.margin;
    }
  }

  private drawRichLine(
    segments: TextSegment[],
    x: number,
    y: number,
    fontSize: number,
    color: [number, number, number]
  ): void {
    this.pdf.setTextColor(...color);
    let cx = x;
    for (const segment of segments) {
      this.pdf.setFont(segment.fontFamily, segment.bold ? 'bold' : 'normal');
      this.pdf.setFontSize(fontSize);
      this.pdf.text(segment.text, cx, y);
      cx += this.pdf.getTextWidth(segment.text);
    }
  }

  writeRichText(text: string, style: RichTextStyle): void {
    if (style.gapBefore) this.y += style.gapBefore;

    const fontSize = style.fontSize;
    const lineHeight = style.lineHeight;
    const color = style.color ?? SLATE_900;
    const x = style.x ?? this.margin;
    const maxWidth = style.maxWidth ?? this.maxWidth - (x - this.margin);
    const segments = this.toLayoutSegments(parseInlineSegments(text, style.forceBold ?? false));
    const lines = wrapRichSegments(this.pdf, segments, maxWidth, fontSize);

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.drawRichLine(line, x, this.y, fontSize, color);
      this.y += lineHeight;
    }

    this.pdf.setTextColor(...SLATE_900);
    if (style.gapAfter) this.y += style.gapAfter;
  }

  writeTitle(text: string): void {
    this.writeRichText(text.replace(/\*\*(.+?)\*\*/g, '$1'), {
      fontSize: 15,
      lineHeight: 7,
      gapBefore: 0,
      gapAfter: 3,
      forceBold: true,
    });
  }

  writeHeading(text: string, level: 2 | 4): void {
    const config =
      level === 2
        ? { fontSize: 13.5, lineHeight: 6.5, gapBefore: 5, gapAfter: 2 }
        : { fontSize: 12, lineHeight: 5.5, gapBefore: 4, gapAfter: 1 };

    this.writeRichText(text.replace(/\*\*(.+?)\*\*/g, '$1'), {
      ...config,
      forceBold: true,
    });
  }

  writeBlockquote(text: string): void {
    const fontSize = 10.5;
    const lineHeight = 5.5;
    const textX = this.margin;
    const maxWidth = this.maxWidth;
    const segments = this.toLayoutSegments(parseInlineSegments(text));
    const lines = wrapRichSegments(this.pdf, segments, maxWidth, fontSize);

    this.y += 2;

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.drawRichLine(line, textX, this.y, fontSize, SLATE_700);
      this.y += lineHeight;
    }

    this.y += 2;
  }

  writeBullet(text: string): void {
    this.writeListItem('•', text, 2, 6.5, SLATE_600);
  }

  writeNumberedItem(index: string, text: string): void {
    this.writeListItem(`${index}.`, text, 2, 9, SLATE_900);
  }

  private writeListItem(
    marker: string,
    text: string,
    markerXOffset: number,
    textXOffset: number,
    markerColor: [number, number, number]
  ): void {
    const fontSize = 10.5;
    const lineHeight = 5.5;
    const markerX = this.margin + markerXOffset;
    const textX = this.margin + textXOffset;
    const maxWidth = this.maxWidth - textXOffset;
    const segments = this.toLayoutSegments(parseInlineSegments(text));
    const lines = wrapRichSegments(this.pdf, segments, maxWidth, fontSize);

    for (let i = 0; i < lines.length; i++) {
      this.ensureSpace(lineHeight);
      if (i === 0) {
        this.pdf.setFont(this.markerFontFamily(), 'normal');
        this.pdf.setFontSize(fontSize);
        this.pdf.setTextColor(...markerColor);
        this.pdf.text(marker, markerX, this.y);
      }
      this.drawRichLine(lines[i], textX, this.y, fontSize, SLATE_900);
      this.y += lineHeight;
    }

    this.y += 0.5;
  }

  writeParagraph(text: string): void {
    this.writeRichText(text, {
      fontSize: 10.5,
      lineHeight: 5.5,
      gapAfter: 0.5,
    });
  }

  writeBlankLine(): void {
    this.y += 2.5;
  }

  renderMarkdown(markdown: string): void {
    const lines = markdown.split('\n');
    if (lines.every(line => line.trim() === '')) {
      throw new Error('no_content');
    }

    for (const rawLine of lines) {
      if (rawLine.startsWith('### ')) {
        this.writeHeading(rawLine.slice(4), 4);
        continue;
      }
      if (rawLine.startsWith('## ')) {
        this.writeHeading(rawLine.slice(3), 2);
        continue;
      }
      if (rawLine.startsWith('# ')) {
        this.writeTitle(rawLine.slice(2));
        continue;
      }
      if (rawLine.startsWith('> ')) {
        this.writeBlockquote(rawLine.slice(2));
        continue;
      }
      if (/^[*-] /.test(rawLine)) {
        this.writeBullet(rawLine.slice(2));
        continue;
      }
      const numbered = rawLine.match(/^(\d+)\.\s+(.+)$/);
      if (numbered) {
        this.writeNumberedItem(numbered[1], numbered[2]);
        continue;
      }
      if (rawLine.trim() === '') {
        this.writeBlankLine();
        continue;
      }
      this.writeParagraph(rawLine);
    }
  }
}
