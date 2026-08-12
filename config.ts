
// --- 系統設定檔 ---

export const ADMIN_EMAIL = 'hjr640511@gmail.com';
export const SYSTEM_ACCESS_CODE = '888888';

/** App Store 要求：訂閱流程內須提供可點擊的條款與隱私權連結 */
export const TERMS_OF_USE_EULA_URL =
  (typeof import.meta !== 'undefined' && (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_TERMS_EULA_URL) ||
  'https://www.apple.com/legal/internet-services/itunes/';
export const PRIVACY_POLICY_URL =
  (typeof import.meta !== 'undefined' && (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PRIVACY_POLICY_URL) ||
  'https://rong-bit.github.io/TradeFolio/privacy-policy.html';

// --- 全域授權名單 ---
// 在此處新增使用者的 Email，部署後這些使用者即可在任何裝置登入，無需輸入密碼
export const GLOBAL_AUTHORIZED_USERS = [
  // 您可以在此加入其他使用者的 Email
   'chenyu1679@gmail.com',
   'yuzhen422@gmail.com',
   'kkkkk@gmail.com',
   'shinesekyle@gmail.com',
   'limriiam@gmail.com',
  'kuoarnan@gmail.com',
  'qaz7920726@gmail.com',
  'iamsophiali@gmail.com',
  ]
