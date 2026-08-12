// Google 登录服务
// 用于检测平台并获取Google账户信息

declare global {
  interface Window {
    Capacitor?: {
      getPlatform: () => string;
    };
    AndroidGoogleAuth?: {
      signIn: () => Promise<{ email: string; idToken?: string }>;
    };
  }
}

/**
 * 检测是否在Android环境中（Capacitor）
 */
export function isAndroidPlatform(): boolean {
  // 方法1: 检查Capacitor平台
  if (typeof window !== 'undefined' && window.Capacitor) {
    return window.Capacitor.getPlatform() === 'android';
  }
  
  // 方法2: 检查User-Agent（兼容TWA）
  const userAgent = navigator.userAgent.toLowerCase();
  const isAndroidUA = userAgent.includes('android');
  
  // 方法3: 检查是否在standalone模式
  const isStandalone = (window.navigator as any).standalone === true || 
                      window.matchMedia('(display-mode: standalone)').matches;
  
  // 方法4: 检查是否有Android原生桥接
  const hasAndroidBridge = typeof window.AndroidGoogleAuth !== 'undefined' ||
                          typeof (window as any).Android !== 'undefined';
  
  return (isAndroidUA && isStandalone) || hasAndroidBridge;
}

/**
 * 在Android平台自动获取Google账户邮箱
 * 返回邮箱地址，如果失败则返回null
 */
export async function getGoogleAccountEmail(): Promise<string | null> {
  if (!isAndroidPlatform()) {
    return null;
  }

  try {
    // 如果有Android原生桥接
    if (window.AndroidGoogleAuth && window.AndroidGoogleAuth.signIn) {
      const result = await window.AndroidGoogleAuth.signIn();
      return result.email || null;
    }

    // 注意：在实际实现中，这需要Android原生代码支持
    // 这里提供一个占位实现，实际使用时需要：
    // 1. 在Android端实现Google Sign-In
    // 2. 通过Capacitor插件或JavaScript接口暴露给Web端
    // 3. 或者使用@codetrix-studio/capacitor-google-auth等插件

    console.warn('Google Sign-In not implemented. Please implement Android native Google Sign-In.');
    return null;
  } catch (error) {
    console.error('Failed to get Google account:', error);
    return null;
  }
}

