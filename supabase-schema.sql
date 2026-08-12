-- Supabase 資料庫表結構
-- 在 Supabase Dashboard > SQL Editor 中執行此腳本

-- 1. 建立 purchases 表（購買記錄）
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  product_id TEXT NOT NULL CHECK (product_id IN ('tradefolio_lifetime', 'tradefolio_monthly', 'tradefolio_yearly')),
  purchase_token TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL UNIQUE,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('lifetime', 'subscription')),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 建立索引以加速查詢
CREATE INDEX IF NOT EXISTS idx_purchases_user_email ON purchases(user_email);
CREATE INDEX IF NOT EXISTS idx_purchases_product_id ON purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_is_active ON purchases(is_active);
CREATE INDEX IF NOT EXISTS idx_purchases_expires_at ON purchases(expires_at);
CREATE INDEX IF NOT EXISTS idx_purchases_user_active_expires ON purchases(user_email, is_active, expires_at);

-- 建立部分唯一索引：確保每個用戶每個產品只能有一個有效購買
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_unique_active 
  ON purchases(user_email, product_id) 
  WHERE is_active = true;

-- 2. 建立或擴展 authorized_users 表（手動授權會員）
CREATE TABLE IF NOT EXISTS authorized_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending', 'cancelled')),
  payment_date TIMESTAMP WITH TIME ZONE,
  payment_amount NUMERIC(10, 2),
  payment_trade_no TEXT,
  payment_method TEXT, -- 'manual', 'google_play', 'other'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_authorized_users_email ON authorized_users(email);
CREATE INDEX IF NOT EXISTS idx_authorized_users_payment_status ON authorized_users(payment_status);

-- 3. 建立更新 updated_at 的函數
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 為 authorized_users 表建立自動更新 updated_at 的觸發器
DROP TRIGGER IF EXISTS update_authorized_users_updated_at ON authorized_users;
CREATE TRIGGER update_authorized_users_updated_at
  BEFORE UPDATE ON authorized_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. 設定 Row Level Security (RLS) 政策
-- 啟用 RLS
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorized_users ENABLE ROW LEVEL SECURITY;

-- purchases 表：允許所有人讀取（但僅返回必要資訊）
CREATE POLICY "Allow public read access to purchases"
  ON purchases FOR SELECT
  USING (true);

-- purchases 表：僅允許通過 service role key 插入/更新
-- 注意：這會通過後端 API 完成，使用 service role key，所以不需要公開寫入權限

-- authorized_users 表：允許所有人讀取
CREATE POLICY "Allow public read access to authorized_users"
  ON authorized_users FOR SELECT
  USING (payment_status = 'paid');

-- authorized_users 表：僅允許通過 service role key 插入/更新

-- 5. 建立視圖：有效會員列表（合併購買記錄和手動授權）
CREATE OR REPLACE VIEW active_members AS
SELECT DISTINCT 
  COALESCE(p.user_email, au.email) as email,
  CASE 
    WHEN p.id IS NOT NULL THEN 'purchase'
    WHEN au.id IS NOT NULL THEN 'manual'
  END as membership_type,
  CASE 
    WHEN p.id IS NOT NULL THEN p.product_id
    ELSE NULL
  END as product_id,
  CASE 
    WHEN p.id IS NOT NULL THEN p.expires_at
    ELSE NULL
  END as expires_at,
  GREATEST(
    COALESCE(p.created_at, '1970-01-01'::timestamp),
    COALESCE(au.created_at, '1970-01-01'::timestamp)
  ) as membership_start_date
FROM purchases p
FULL OUTER JOIN authorized_users au ON p.user_email = au.email
WHERE 
  (p.id IS NOT NULL AND p.is_active = true AND (p.expires_at IS NULL OR p.expires_at > NOW()))
  OR (au.id IS NOT NULL AND au.payment_status = 'paid');

-- 允許公開讀取視圖
GRANT SELECT ON active_members TO anon, authenticated;

-- 6. 建立函數：檢查用戶是否為有效會員
CREATE OR REPLACE FUNCTION is_user_member(user_email_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM purchases p
    WHERE p.user_email = user_email_param
      AND p.is_active = true
      AND (p.expires_at IS NULL OR p.expires_at > NOW())
    
    UNION
    
    SELECT 1
    FROM authorized_users au
    WHERE au.email = user_email_param
      AND au.payment_status = 'paid'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 註解說明
COMMENT ON TABLE purchases IS '儲存 Google Play 購買記錄';
COMMENT ON TABLE authorized_users IS '儲存手動授權的會員記錄';
COMMENT ON VIEW active_members IS '合併的活躍會員列表視圖';
COMMENT ON FUNCTION is_user_member IS '檢查指定 Email 是否為有效會員';

