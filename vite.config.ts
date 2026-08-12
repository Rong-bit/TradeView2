import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** GitHub Pages 無 serverless /api；建置時內建完整代理 URL，手機與桌機 bundle 一致 */
const DEFAULT_YAHOO_PROXY_BASE = 'https://trade-folio.vercel.app/api/yahoo-proxy'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 載入環境變數 (包含 GitHub Secrets 注入的系統變數)
  // 第三個參數 '' 表示載入所有變數，不限制 VITE_ 前綴
  const env = loadEnv(mode, (process as any).cwd(), '');
  const yahooProxyUrl =
    (env.VITE_YAHOO_PROXY_URL || process.env.VITE_YAHOO_PROXY_URL || '').trim() ||
    DEFAULT_YAHOO_PROXY_BASE;

  return {
    plugins: [react()],
    // 設定 base 為相對路徑 './'，確保在 GitHub Pages 子路徑能運作
    base: './',
    server: {
      cors: true
    },
    build: {
      target: ['es2020', 'safari14'],
      // 確保構建時正確處理模組
      rollupOptions: {
        output: {
          // 確保模組格式正確
          format: 'es'
        }
      }
    },
    define: {
      // 這裡將編譯時的 process.env.API_KEY 替換為實際的環境變數值
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY),
      // GitHub Actions 未設 vars 時仍帶入預設 Vercel proxy（靜態站必備）
      'import.meta.env.VITE_YAHOO_PROXY_URL': JSON.stringify(yahooProxyUrl),
      // 為了相容性保留 process.env (但避免覆蓋上面的 key)
      'process.env': process.env
    }
  }
})
