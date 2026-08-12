import type { VercelRequest, VercelResponse } from '@vercel/node';

const FUNDCLEAR_DIVIDEND_URL =
  'https://www.fundclear.com.tw/api/etf/dividend/query-dividend';
const TICKER_PATTERN = /^[0-9A-Za-z]{4,10}$/;
const REQUEST_TIMEOUT_MS = 12_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawTicker = Array.isArray(req.query?.ticker)
    ? req.query.ticker[0]
    : req.query?.ticker;
  const ticker = String(rawTicker ?? '').trim().toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(FUNDCLEAR_DIVIDEND_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Referer: 'https://www.fundclear.com.tw/etf/dividend',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        _pageNum: 1,
        _pageSize: 100,
        column: 'exDivDate',
        asc: false,
        etfType: '',
        searchName: ticker,
        exDividendDateStart: '',
        exDividendDateEnd: '',
        payDateStart: '',
        payDateEnd: '',
      }),
    });

    const text = await upstream.text();
    res.setHeader(
      'Cache-Control',
      'public, max-age=900, s-maxage=21600, stale-while-revalidate=86400'
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(upstream.status).send(text);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(message === 'This operation was aborted' ? 504 : 502).json({
      error: 'FundClear request failed',
      message,
    });
  } finally {
    clearTimeout(timeout);
  }
}
