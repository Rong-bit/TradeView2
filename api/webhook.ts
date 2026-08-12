// Vercel Serverless Function - 處理支付 Webhook
// 此檔案應放在 api/webhook.ts（Vercel 會自動識別）

// @ts-ignore - Vercel runtime 會自動提供這些類型
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 添加 CORS 標頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 處理 OPTIONS 請求（CORS preflight）
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只接受 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Webhook received:', {
      method: req.method,
      headers: Object.keys(req.headers),
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });
    // 1. 驗證 Webhook 簽名（防止偽造）
    const signature = req.headers['x-ecpay-signature'] || req.headers['stripe-signature'];
    
    // 這裡需要根據您使用的支付服務商進行簽名驗證
    // 綠界科技或 Stripe 的驗證邏輯不同
    const isValid = await verifyWebhookSignature(req.body, signature, req.headers);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 2. 檢查支付狀態
    const paymentData = extractPaymentData(req.body);
    
    if (!paymentData.success) {
      return res.status(400).json({ error: 'Payment failed or not completed' });
    }

    // 3. 從訂單編號提取用戶 Email
    // MerchantTradeNo 格式：email_timestamp 或從 metadata 中取得
    const userEmail = extractEmailFromPayment(paymentData);
    
    if (!userEmail) {
      return res.status(400).json({ error: 'Email not found in payment data' });
    }

    // 4. 更新 Supabase 資料庫
    await updateSupabaseUser(userEmail, paymentData);

    // 5. 回傳成功
    return res.status(200).json({ 
      success: true, 
      message: `User ${userEmail} has been added to authorized list` 
    });

  } catch (error: any) {
    console.error('Webhook error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
    });
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error?.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}

// 驗證 Webhook 簽名（綠界科技）
async function verifyWebhookSignature(
  body: any, 
  signature: string | string[] | undefined,
  headers: any
): Promise<boolean> {
  // ⚠️ 測試模式：僅用於開發階段，生產環境請移除或設定為 false
  // 設定環境變數 WEBHOOK_TEST_MODE=true 可跳過簽名驗證
  if (process.env.WEBHOOK_TEST_MODE === 'true') {
    console.warn('⚠️ WEBHOOK_TEST_MODE is enabled - Signature verification skipped');
    return true;
  }

  if (!signature) return false;

  // 綠界科技的簽名驗證
  if (headers['x-ecpay-signature'] || body.CheckMacValue) {
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    if (!hashKey || !hashIV) return false;

    // 綠界科技的簽名計算邏輯
    const checkString = Object.keys(body)
      .filter(key => key !== 'CheckMacValue') // 排除 CheckMacValue 本身
      .sort()
      .map(key => `${key}=${body[key]}`)
      .join('&');
    
    const hashString = `HashKey=${hashKey}&${checkString}&HashIV=${hashIV}`;
    const calculatedHash = createHash('sha256')
      .update(hashString, 'utf8')
      .digest('hex')
      .toUpperCase();
    
    return calculatedHash === body.CheckMacValue;
  }

  // Stripe 的簽名驗證
  if (headers['stripe-signature']) {
    // 需要安裝 stripe 套件：npm install stripe
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.warn('STRIPE_WEBHOOK_SECRET not set');
        return false;
      }

      // 嘗試動態導入 stripe（避免在未安裝時報錯）
      let stripe: any;
      try {
        // @ts-ignore - stripe 是可選依賴，可能未安裝
        const stripeModule = await import('stripe');
        stripe = stripeModule.default;
      } catch (importError: any) {
        if (importError?.code === 'MODULE_NOT_FOUND') {
          console.warn('Stripe package not installed. Install with: npm install stripe');
          return false;
        }
        throw importError;
      }

      const Stripe = stripe;
      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-11-20.acacia',
      });
      
      const sig = Array.isArray(signature) ? signature[0] : signature;
      
      // 對於測試，如果 body 是字符串，需要轉換
      const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
      
      stripeClient.webhooks.constructEvent(
        bodyString,
        sig,
        webhookSecret
      );
      return true;
    } catch (err: any) {
      console.error('Stripe signature verification failed:', err?.message);
      console.error('Stripe error details:', {
        code: err?.code,
        type: err?.type,
      });
      return false;
    }
  }

  return false;
}

// 提取支付資料
function extractPaymentData(body: any): any {
  // 綠界科技格式
  if (body.RtnCode !== undefined) {
    return {
      success: body.RtnCode === '1',
      amount: body.TradeAmt,
      tradeNo: body.MerchantTradeNo,
      rtnCode: body.RtnCode,
      rtnMsg: body.RtnMsg,
    };
  }

  // Stripe 格式
  if (body.type === 'payment_intent.succeeded') {
    return {
      success: true,
      amount: body.data.object.amount,
      tradeNo: body.data.object.id,
      metadata: body.data.object.metadata,
    };
  }

  return { success: false };
}

// 從支付資料中提取 Email
function extractEmailFromPayment(paymentData: any): string | null {
  // 方法 1: 從 metadata 中取得
  if (paymentData.metadata?.email) {
    return paymentData.metadata.email;
  }

  // 方法 2: 從 MerchantTradeNo 中解析（格式：email_timestamp）
  if (paymentData.tradeNo) {
    const parts = paymentData.tradeNo.split('_');
    if (parts.length >= 2) {
      // 檢查是否符合 Email 格式
      const email = parts.slice(0, -1).join('_'); // 除了最後一段（timestamp）外都是 email
      if (email.includes('@')) {
        return email;
      }
    }
  }

  return null;
}

// 更新 Supabase 資料庫
async function updateSupabaseUser(email: string, paymentData: any) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // 使用 service role key（有完整權限）

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration missing');
  }

  // 使用 Supabase REST API 更新資料
  const response = await fetch(
    `${supabaseUrl}/rest/v1/authorized_users`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates', // 如果已存在則更新
      },
      body: JSON.stringify({
        email: email,
        payment_status: 'paid',
        payment_date: new Date().toISOString(),
        payment_amount: paymentData.amount,
        payment_trade_no: paymentData.tradeNo,
        created_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update Supabase: ${error}`);
  }

  return await response.json();
}

