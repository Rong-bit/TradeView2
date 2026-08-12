import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

function measureEnvSafeAreaTop(): number {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;height:0;padding-top:env(safe-area-inset-top);padding-top:constant(safe-area-inset-top);visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  document.body.removeChild(probe);
  return value;
}

/** iOS 原生 WebView 有時讀不到 env()，依螢幕尺寸估算頂部安全區 */
function getIOSFallbackTop(): number {
  const maxDim = Math.max(window.screen.height, window.screen.width);
  const minDim = Math.min(window.screen.height, window.screen.width);
  if (maxDim >= 852 && minDim >= 393) return 59;
  if (maxDim >= 812) return 47;
  return 20;
}

function resolveTopInset(): number {
  const envTop = measureEnvSafeAreaTop();
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
    return Math.max(envTop, getIOSFallbackTop());
  }
  return envTop;
}

export function useSafeAreaInsets() {
  const [top, setTop] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--app-safe-area-top');
    const parsed = parseFloat(cssVar);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });

  useEffect(() => {
    const update = () => {
      const insetTop = resolveTopInset();
      setTop(insetTop);
      document.documentElement.style.setProperty('--app-safe-area-top', `${insetTop}px`);
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return { top };
}
