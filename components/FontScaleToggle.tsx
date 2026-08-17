import React, { useEffect, useState } from 'react';
import { useUI } from '../contexts/UIContext';

const STORAGE_KEY = 'tf-font-scale';

const FONT_SCALES = [
  { value: '1', labelZh: '標準', labelEn: 'Medium', shortEn: 'M' },
  { value: '1.125', labelZh: '大', labelEn: 'Large', shortEn: 'L' },
  { value: '1.25', labelZh: '更大', labelEn: 'Larger', shortEn: 'XL' },
] as const;

type FontScaleValue = (typeof FONT_SCALES)[number]['value'];

function isFontScaleValue(v: string | null): v is FontScaleValue {
  return FONT_SCALES.some(s => s.value === v);
}

function applyFontScale(scale: FontScaleValue) {
  document.documentElement.style.setProperty('--app-font-scale', scale);
  localStorage.setItem(STORAGE_KEY, scale);
}

interface FontScaleToggleProps {
  /** compact：頂欄小按鈕；menu：側選單「文字等級」列 */
  variant?: 'compact' | 'menu';
}

const FontScaleToggle: React.FC<FontScaleToggleProps> = ({ variant = 'compact' }) => {
  const { language } = useUI();
  const isChinese = language === 'zh-TW' || language === 'zh-CN';
  const [scale, setScale] = useState<FontScaleValue>(() => {
    if (typeof window === 'undefined') return '1';
    const stored = localStorage.getItem(STORAGE_KEY);
    return isFontScaleValue(stored) ? stored : '1';
  });

  useEffect(() => {
    applyFontScale(scale);
  }, [scale]);

  const idx = FONT_SCALES.findIndex(s => s.value === scale);
  const current = FONT_SCALES[idx >= 0 ? idx : 0];
  const setFromEvent = (v: string) => {
    if (isFontScaleValue(v)) setScale(v);
  };
  const cycle = () => {
    const next = FONT_SCALES[(idx + 1) % FONT_SCALES.length];
    setScale(next.value);
  };

  if (variant === 'menu') {
    const heading = isChinese ? '文字等級' : 'Text size';
    return (
      <label className="flex items-center justify-between gap-3 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
        <span className="text-sm text-slate-300 shrink-0">{heading}</span>
        <select
          value={scale}
          onChange={e => setFromEvent(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-sm text-white text-right focus:outline-none focus:ring-0 border-0 cursor-pointer"
          aria-label={heading}
        >
          {FONT_SCALES.map(s => (
            <option key={s.value} value={s.value}>
              {isChinese ? s.labelZh : s.labelEn}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const title = isChinese
    ? `字級：${current.labelZh}（點擊切換）`
    : `Font size: ${current.labelEn} (tap to cycle)`;

  // 控制項本身用固定 px，避免跟著根字級放大而撐破頂欄
  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      style={{ minWidth: 36, height: 24, padding: '0 6px', fontSize: 11 }}
      aria-label={title}
      title={title}
    >
      <span style={{ fontSize: 10 + idx * 2, lineHeight: 1 }}>A</span>
      <span style={{ marginLeft: 3, fontSize: 10, color: '#cbd5e1', lineHeight: 1 }}>
        {isChinese ? current.labelZh : current.shortEn}
      </span>
    </button>
  );
};

export default FontScaleToggle;
