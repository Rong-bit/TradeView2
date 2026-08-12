// Supabase 客戶端配置
// 請到 https://supabase.com/ 註冊並取得您的專案 URL 和 API Key

export const SUPABASE_CONFIG = {
  url: import.meta.env.VITE_SUPABASE_URL || '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
};

// Supabase 客戶端（僅在前端使用公開的 anon key）
export const createSupabaseClient = () => {
  // 如果環境變數未設定，使用 fetch API 直接調用 Supabase REST API
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    return null;
  }

  return {
    from: (table: string) => ({
      select: async (columns: string = '*') => {
        const response = await fetch(
          `${SUPABASE_CONFIG.url}/rest/v1/${table}?select=${columns}`,
          {
            headers: {
              'apikey': SUPABASE_CONFIG.anonKey,
              'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (!response.ok) throw new Error(`Supabase query failed: ${response.statusText}`);
        return { data: await response.json(), error: null };
      },
    }),
  };
};

// 取得授權會員名單
export async function getAuthorizedUsers(): Promise<string[]> {
  try {
    // 方法 1: 如果有 Supabase 客戶端
    const client = createSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from('authorized_users')
        .select('email');
      
      if (error) throw error;
      return data.map((row: any) => row.email);
    }

    // 方法 2: 直接使用 fetch（不需要安裝 Supabase SDK）
    if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
      const response = await fetch(
        `${SUPABASE_CONFIG.url}/rest/v1/authorized_users?select=email&payment_status=eq.paid`,
        {
          headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.warn('無法從 Supabase 讀取會員名單，使用本地 config.ts');
        return [];
      }

      const data = await response.json();
      return data.map((row: any) => row.email);
    }

    // 如果 Supabase 未設定，回退到空陣列（將使用 config.ts）
    return [];
  } catch (error) {
    console.error('讀取會員名單失敗:', error);
    // 發生錯誤時，回退到使用 config.ts（在 App.tsx 中處理）
    return [];
  }
}

