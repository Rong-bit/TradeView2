import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Market } from '../types';
import {
  fetchActualDividendHistory,
  parseFundClearDividendResponse,
  parseDjTwStockCalendarHtml,
  parseMopsTwStockAnnouncementRefs,
  parseMopsTwStockDividendDetailHtml,
  parseMoneyDjEtfHtml,
  parseYahooTwDividendPageHtml,
} from './moneydjService';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('parseMoneyDjEtfHtml', () => {
  it('parses overseas ETF rows from column 7', () => {
    const html = `
<table><tbody>
<tr><td></td><td>2025/12/18</td><td></td><td>2025/12/19</td><td>美元</td><td>0</td><td>0</td><td>0.193900</td></tr>
</tbody></table>`;
    const rows = parseMoneyDjEtfHtml(html, Market.US);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exDate: '2025-12-18',
      payDate: '2025-12-19',
      amountPerShare: 0.1939,
      currency: 'USD',
    });
  });

  it('parses TW ETF rows from column 5', () => {
    const html = `
<table><tbody>
<tr><td></td><td>2025/07/18</td><td></td><td>2025/08/15</td><td>新台幣</td><td>0.55</td><td>6.5</td></tr>
</tbody></table>`;
    const rows = parseMoneyDjEtfHtml(html, Market.TW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exDate: '2025-07-18',
      payDate: '2025-08-15',
      amountPerShare: 0.55,
      currency: 'TWD',
    });
  });
});

describe('parseFundClearDividendResponse', () => {
  it('parses exact ETF rows and official estimated distribution composition', () => {
    const rows = parseFundClearDividendResponse(
      {
        list: [
          {
            stockNo: '0050',
            exDivDate: '20260721',
            payDate: '20260810',
            disAmount: '0.600',
            divDet1: '26.00',
            divDet2: '0.00',
            divDet3: '0.00',
            divDet4: '74.00',
            divDet5: '0.00',
          },
          { stockNo: '0056', exDivDate: '20260721', payDate: '20260810', disAmount: '1' },
        ],
      },
      '0050'
    );

    expect(rows).toEqual([
      {
        exDate: '2026-07-21',
        payDate: '2026-08-10',
        amountPerShare: 0.6,
        currency: 'TWD',
        source: 'fundclear',
        isEtf: true,
        distributionComposition: {
          dividendIncomePercent: 26,
          interestIncomePercent: 0,
          equalizationReservePercent: 0,
          realizedCapitalGainPercent: 74,
          otherIncomePercent: 0,
          estimated: true,
        },
      },
    ]);
  });
});

describe('parseDjTwStockCalendarHtml', () => {
  it('parses Fubon 2881 fixture (big5 HTML)', () => {
    const buf = readFileSync(join(__dirname, 'fixtures/fubon2881.html'));
    const html = new TextDecoder('big5').decode(buf);
    const rows = parseDjTwStockCalendarHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exDate: '2026-07-01',
      payDate: '2026-07-31',
      amountPerShare: 4.25,
      currency: 'TWD',
      source: 'dj',
    });
  });
});

describe('parseMopsTwStockDividendDetailHtml', () => {
  it('parses TSMC cash dividend amount, ex-date, and real pay date', () => {
    const html = `
<table>
<tr align='left'><td style='padding-left:12em;text-indent:-8em;'><b>※除息--普通股：每壹股配發現金(股利)</b>
      6.00003573
<b>元，（即每壹股盈餘分配</b>
      6.00003573
<b>元，每壹股法定盈餘公積、資本公積發放</b>
      0.00000000
<b>元)，現金配發總額</b>
    155,595,147,126
<b>元</b></td></tr>
<tr align='left'><td style='padding-left:4em;'><b>＊現金股利發放日：</b><nobr>
115年04月09日
</nobr><b>（發放現金股利時適用。）</b></td></tr>
<tr align='left'><td style='padding-left:5em;'><b>除權/除息交易日：</b><nobr>
115年03月17日
</nobr></td></tr>
</table>`;
    const row = parseMopsTwStockDividendDetailHtml(html);
    expect(row).toMatchObject({
      exDate: '2026-03-17',
      payDate: '2026-04-09',
      amountPerShare: 6.000036,
      currency: 'TWD',
      source: 'mops',
    });
    expect(row?.payDateEstimated).toBeUndefined();
  });
});

describe('parseMopsTwStockAnnouncementRefs', () => {
  it('extracts detail refs from MOPS announcement list', () => {
    const html = `
<input type='button' value='詳細資料' onclick='document.t108sb22_fm1.DATE1.value="20260225";document.t108sb22_fm1.SEQ_NO.value="1";document.t108sb22_fm1.COMP.value="2330";openWindow(this.form ,"");'>
<input type='button' value='詳細資料' onclick='document.t108sb22_fm1.DATE1.value="20260527";document.t108sb22_fm1.SEQ_NO.value="1";document.t108sb22_fm1.COMP.value="2330";openWindow(this.form ,"");'>`;
    expect(parseMopsTwStockAnnouncementRefs(html)).toEqual([
      { date1: '20260225', seqNo: '1', comp: '2330' },
      { date1: '20260527', seqNo: '1', comp: '2330' },
    ]);
  });
});

describe('parseYahooTwDividendPageHtml', () => {
  it('parses TW Yahoo dividend table rows with real pay date', () => {
    const html = `
<li class="List(n)"><div class="table-row">
<div><div></div></div>
<div>2025Q4</div>
<div><span>6.0000</span></div>
<div><span>-</span></div>
<div><span>0.27%</span></div>
<div>2,255</div>
<div>2026/06/11</div>
<div>-</div>
<div>2026/07/09</div>
<div>-</div>
<div>2</div>
</div></li>`;
    const rows = parseYahooTwDividendPageHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exDate: '2026-06-11',
      payDate: '2026-07-09',
      amountPerShare: 6,
      currency: 'TWD',
      source: 'yahoo',
    });
    expect(rows[0].payDateEstimated).toBeUndefined();
  });
});

describe('fetchActualDividendHistory (live)', () => {
  it(
    'TW ETF 0050 → fundclear/moneydj',
    async () => {
      const rows = await fetchActualDividendHistory('0050', Market.TW, 'TW');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => r.source === 'fundclear' || r.source === 'moneydj')).toBe(true);
      expect(rows.every(r => r.exDate && r.payDate && r.amountPerShare > 0)).toBe(true);
      console.log('TW ETF 0050 sample:', rows[0]);
    },
    60_000
  );

  it(
    'TW stock 2881 → mops/dj/yahoo (外部來源或 proxy 未部署時可能為空)',
    async () => {
      const rows = await fetchActualDividendHistory('2881', Market.TW, 'TW');
      if (rows.length === 0) {
        console.warn('2881 live fetch empty — 若 proxy 尚未部署富邦白名單，屬預期');
        return;
      }
      expect(['mops', 'dj', 'yahoo']).toContain(rows[0].source);
      expect(rows[0].amountPerShare).toBeGreaterThan(0);
      console.log('TW stock 2881 sample:', rows[0]);
    },
    60_000
  );

  it(
    'TW stock 2330 → real pay date for 2026-06-11 dividend',
    async () => {
      const rows = await fetchActualDividendHistory('2330', Market.TW, 'TW');
      const june = rows.find(r => r.exDate === '2026-06-11');
      expect(june).toMatchObject({
        payDate: '2026-07-09',
      });
      expect(['mops', 'yahoo']).toContain(june?.source);
      expect(june?.payDateEstimated).toBeUndefined();
      console.log('TW stock 2330 2026-06-11:', june);
    },
    60_000
  );

  it(
    'US ETF VTI → moneydj',
    async () => {
      const rows = await fetchActualDividendHistory('VTI', Market.US, 'US');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => r.source === 'moneydj')).toBe(true);
      console.log('US ETF VTI sample:', rows[0]);
    },
    60_000
  );

  it(
    'US stock AAPL → stockanalysis',
    async () => {
      const rows = await fetchActualDividendHistory('AAPL', Market.US, 'US');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => r.source === 'stockanalysis')).toBe(true);
      console.log('US stock AAPL sample:', rows[0]);
    },
    60_000
  );

  it(
    'UK VUSA → yahoo',
    async () => {
      const rows = await fetchActualDividendHistory('VUSA', Market.UK, 'UK');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => r.source === 'yahoo')).toBe(true);
      expect(rows.some(r => r.payDateEstimated === true)).toBe(true);
      console.log('UK VUSA sample:', rows[0]);
    },
    60_000
  );
});
