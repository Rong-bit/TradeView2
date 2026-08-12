/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_YAHOO_PROXY_URL?: string
  // 可以在這裡添加其他環境變數的類型定義
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

