// 簡化版 Webhook 測試 - 用於診斷問題
// 訪問: https://trade-folio.vercel.app/api/webhook-test

// @ts-ignore - Vercel runtime 會自動提供這些類型
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 添加 CORS 標頭
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 處理 OPTIONS 請求
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // 檢查環境變數
    const envCheck = {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasEcpayKey: !!process.env.ECPAY_HASH_KEY,
      hasEcpayIV: !!process.env.ECPAY_HASH_IV,
      hasStripeSecret: !!process.env.STRIPE_SECRET_KEY,
      hasStripeWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      testMode: process.env.WEBHOOK_TEST_MODE === 'true',
      nodeVersion: process.version,
    };

    // 測試 Supabase 連線（如果已設定）
    let supabaseTest = null;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const testResponse = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/authorized_users?select=count&limit=1`,
          {
            method: 'GET',
            headers: {
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        supabaseTest = {
          success: testResponse.ok,
          status: testResponse.status,
          statusText: testResponse.statusText,
        };
      } catch (error: any) {
        supabaseTest = {
          success: false,
          error: error.message,
        };
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook test endpoint is working',
      timestamp: new Date().toISOString(),
      method: req.method,
      environment: envCheck,
      supabaseTest,
      instructions: {
        step1: '如果看到此訊息，表示 Vercel 函數基本運作正常',
        step2: '檢查 environment 區塊確認環境變數是否設定',
        step3: '檢查 supabaseTest 確認 Supabase 連線是否正常',
        step4: '如果環境變數未設定，請前往 Vercel Dashboard > Settings > Environment Variables',
        step5: '如果 Supabase 連線失敗，請檢查 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY',
      },
    });
  } catch (error: any) {
    console.error('Test endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    });
  }
}

