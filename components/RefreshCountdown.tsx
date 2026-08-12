import React, { useState, useEffect } from 'react';
import { useUI } from '../contexts/UIContext';

interface RefreshCountdownProps {
  intervalMs: number;       // 刷新週期（毫秒）
  nextRefreshAt: number | null; // 與自動更新排程共用的時間戳
  onManualRefresh: () => void;
  isRefreshing?: boolean;
  label?: string;           // 按鈕文字
}

/**
 * 顯示距下次自動刷新的倒數計時，並提供手動刷新按鈕。
 * 頁面可見性改變時自動同步（useAutoRefresh 會補刷）。
 */
const RefreshCountdown: React.FC<RefreshCountdownProps> = ({
  intervalMs,
  nextRefreshAt,
  onManualRefresh,
  isRefreshing = false,
  label,
}) => {
  const { language } = useUI();
  const isChinese = language === 'zh-TW' || language === 'zh-CN';
  const defaultLabel = isChinese ? '更新股價' : 'Update Prices';
  const refreshingLabel = isChinese ? '更新中...' : 'Refreshing...';
  const [secondsLeft, setSecondsLeft] = useState(0);

  // 每秒倒數
  useEffect(() => {
    const tick = () => {
      const remaining =
        nextRefreshAt == null
          ? 0
          : Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRefreshAt]);

  // 手動刷新由 useAutoRefresh 統一重設實際排程與倒數。
  const handleClick = () => {
    onManualRefresh();
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const countdownStr = `${mins}:${String(secs).padStart(2, '0')}`;

  // 進度弧（SVG 圓形）
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsLeft / Math.floor(intervalMs / 1000);
  const dashOffset = circumference * (1 - progress);

  return (
    <button
      onClick={handleClick}
      disabled={isRefreshing}
      title={isChinese ? `自動刷新倒數 ${countdownStr}，點擊立即更新` : `Auto refresh in ${countdownStr}, click to update now`}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
        bg-indigo-50 text-indigo-700 border border-indigo-200
        hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isRefreshing ? (
        /* 轉圈動畫 */
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2"/>
          <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ) : (
        /* 倒數圓弧 */
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5"/>
          <circle
            cx="8" cy="8" r={radius}
            fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 8 8)"
            style={{ transition: 'stroke-dashoffset 0.9s linear' }}
          />
        </svg>
      )}
      <span>{isRefreshing ? refreshingLabel : (label || defaultLabel)}</span>
      {!isRefreshing && (
        <span className="text-indigo-400 font-mono tabular-nums">{countdownStr}</span>
      )}
    </button>
  );
};

export default RefreshCountdown;
