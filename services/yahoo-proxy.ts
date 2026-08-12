// Vercel Serverless Function - Yahoo Finance 代理
// 用途：在伺服器端呼叫 Yahoo Finance / 相關目標，解決瀏覽器 CORS 問題

// @ts-ignore - Vercel runtime 會自動提供這些類型
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_PREFIXES = [
  'https://query1.finance.yahoo.com/',
  'https://stockanalysis.com/',
  // 台灣證交所即時報價（Yahoo US chart API 對 TW 股票常延遲至前一交易日收盤，需要用 TWSE 補盤中價）
  'https://mis.twse.com.tw/',
  // MoneyDJ：個股/ETF 配息實績（除息日、發放日、每股股利）；HTML 解析後做為 Yahoo 預估的「實績補登」資料
  'https://concords.moneydj.com/',
  'https://www.moneydj.com/',
  // 富邦 DJ 鏡像：台股個股重大行事曆（除息日、息值、現金股利發放日）
  'https://fubon-ebrokerdj.fbs.com.tw/',
  // 公開資訊觀測站：台股個股除權息公告（真實現金股利發放日）
  'https://mopsov.twse.com.tw/',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 確保在 TypeScript 型別上不會出現 req.query 可能為 undefined 的情況
    const query = req.query ?? {};
    const target = (query['target'] || query['url']) as string | string[] | undefined;
    const targetUrl = Array.isArray(target) ? target[0] : target;

    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing target url' });
    }

    // 安全防護：只允許代理白名單內的網域，避免變成開放式匿名代理
    if (!ALLOWED_PREFIXES.some(prefix => targetUrl.startsWith(prefix))) {
      return res.status(400).json({ error: 'Target not allowed' });
    }

    console.log('[yahoo-proxy] Fetching:', targetUrl);

    const isTwse = targetUrl.startsWith('https://mis.twse.com.tw/');
    const isMoneyDjConcords = targetUrl.startsWith('https://concords.moneydj.com/');
    const isMoneyDjEtf = targetUrl.startsWith('https://www.moneydj.com/ETF/');
    const isMoneyDjOther =
      targetUrl.startsWith('https://www.moneydj.com/') && !isMoneyDjEtf;
    const isMops = targetUrl.startsWith('https://mopsov.twse.com.tw/');
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        // 保持簡單，不轉發瀏覽器所有 header
        'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        // Yahoo 對無 UA 的請求常回 429「Edge: Too Many Requests」，導致前端拿不到報價
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        // TWSE mis API 需要看起來像從它自家網頁發起，否則可能被擋或回空資料
        ...(isTwse ? { Referer: 'https://mis.twse.com.tw/stock/fibest.jsp' } : {}),
        // MoneyDJ 不同子站需配對自家 Referer，避免被回 403／302 重導
        ...(isMoneyDjConcords ? { Referer: 'https://concords.moneydj.com/' } : {}),
        ...(isMoneyDjEtf ? { Referer: 'https://www.moneydj.com/etf/' } : {}),
        ...(isMoneyDjOther ? { Referer: 'https://www.moneydj.com/' } : {}),
        ...(isMops ? { Referer: 'https://mopsov.twse.com.tw/mops/web/t108sb19_q1' } : {}),
      },
    });

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const status = upstream.status;
    const text = await upstream.text();

    res.setHeader('Content-Type', contentType);
    return res.status(status).send(text);
  } catch (error: any) {
    console.error('[yahoo-proxy] Error:', error?.message || error);
    return res.status(500).json({
      error: 'Proxy error',
      message: error?.message || 'Unknown error',
    });
  }
}

