import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { Holding } from '../types';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useMarket } from '../contexts/MarketContext';
import { useUI } from '../contexts/UIContext';
import {
  holdingValueToTWD,
  valueInBaseCurrency,
  nativeValueInAccountCurrencyToTWD,
  valuationCurrencyForHolding,
  formatCurrency,
} from '../utils/calculations';
import { t } from '../utils/i18n';

const MARKET_TO_COUNTRY_CODE: Record<string, string> = {
  US: 'us', TW: 'tw', JP: 'jp', UK: 'gb', CN: 'cn',
  SZ: 'cn', IN: 'in', CA: 'ca', FR: 'fr', HK: 'hk',
  KR: 'kr', DE: 'de', AU: 'au', SA: 'sa', BR: 'br',
};

const MARKET_COLORS: Record<string, string> = {
  US: '#3b82f6', TW: '#22c55e', JP: '#f97316', UK: '#8b5cf6',
  CN: '#f59e0b', SZ: '#d97706', IN: '#14b8a6', CA: '#f43f5e',
  FR: '#6366f1', HK: '#0ea5e9', KR: '#fb923c', DE: '#eab308',
  AU: '#84cc16', SA: '#10b981', BR: '#06b6d4',
};

type Metric = 'cumulativeReturn' | 'weight' | 'value';

const MarketPerformanceChart: React.FC = () => {
  const { holdings, accounts } = usePortfolio();
  const { baseCurrency, rates } = useMarket();
  const { language, isGuest } = useUI();
  const tr = t(language);
  const [metric, setMetric] = useState<Metric>('cumulativeReturn');

  const data = useMemo(() => {
    const map: Record<string, { totalValueTwd: number; totalCostTwd: number; count: number }> = {};
    holdings.forEach((h: Holding) => {
      const m = h.market as string;
      const valTwd = holdingValueToTWD(h, accounts, rates);
      const ccy = valuationCurrencyForHolding(h, accounts);
      const costTwd = nativeValueInAccountCurrencyToTWD(h.totalCost, ccy, rates);
      if (!map[m]) map[m] = { totalValueTwd: 0, totalCostTwd: 0, count: 0 };
      map[m].totalValueTwd += valTwd;
      map[m].totalCostTwd += costTwd;
      map[m].count++;
    });
    const totalPortfolio = Object.values(map).reduce((s, v) => s + v.totalValueTwd, 0);
    return Object.entries(map)
      .map(([market, v]) => ({
        market,
        countryCode: MARKET_TO_COUNTRY_CODE[market] ?? '',
        label: market,
        cumulativeReturn:
          v.totalCostTwd > 0 ? ((v.totalValueTwd - v.totalCostTwd) / v.totalCostTwd) * 100 : 0,
        weight: totalPortfolio > 0 ? (v.totalValueTwd / totalPortfolio) * 100 : 0,
        value: valueInBaseCurrency(v.totalValueTwd, baseCurrency, rates),
        count: v.count,
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => {
        if (metric === 'cumulativeReturn') return b.cumulativeReturn - a.cumulativeReturn;
        if (metric === 'weight') return b.weight - a.weight;
        return b.value - a.value;
      });
  }, [holdings, accounts, rates, baseCurrency, metric]);

  const formatValue = (v: number) => {
    if (metric === 'cumulativeReturn' || metric === 'weight') return `${v.toFixed(1)}%`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    return v.toFixed(0);
  };

  const metricLabels: Record<Metric, string> = {
    cumulativeReturn: tr.marketChart.cumulativeReturn,
    weight: tr.marketChart.weight,
    value: `${tr.marketChart.value} (${baseCurrency})`,
  };
  const metricButtonLabels: Record<Metric, string> = {
    cumulativeReturn: tr.marketChart.cumulativeReturnShort,
    weight: tr.marketChart.weightShort,
    value: tr.marketChart.valueShort,
  };

  if (isGuest) return null;

  if (data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl shadow">
        <p className="text-slate-400 text-sm text-center py-8">{tr.marketChart.noData}</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-5">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800 text-xl">{tr.marketChart.title}</h3>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{tr.marketChart.subtitle}</p>
        </div>
        <div className="flex w-full sm:w-auto shrink-0 rounded-lg border border-slate-200 overflow-hidden text-xs sm:text-sm font-medium">
          {(['cumulativeReturn', 'weight', 'value'] as Metric[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 whitespace-nowrap transition ${metric === m ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {metricButtonLabels[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 5 }} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tick={{ fill: '#64748b' }} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={formatValue} />
            <Tooltip
              contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff' }}
              formatter={(value: number) => [formatValue(value), metricLabels[metric]]}
              labelFormatter={(label: string) => label}
            />
            <Bar dataKey={metric} radius={[6, 6, 0, 0]} isAnimationActive>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={MARKET_COLORS[entry.market] ?? '#6366f1'} />
              ))}
              <LabelList dataKey={metric} position="top" formatter={formatValue} style={{ fontSize: '10px', fill: '#64748b', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.slice(0, 4).map(d => {
          const retColor = d.cumulativeReturn >= 0 ? 'text-emerald-600' : 'text-rose-600';
          const retSign = d.cumulativeReturn >= 0 ? '+' : '';
          const retStr = `${retSign}${d.cumulativeReturn.toFixed(1)}%`;
          const weightStr = `${d.weight.toFixed(1)}% ${tr.marketChart.ratio}`;

          return (
            <div key={d.market} className="rounded-lg p-3 bg-slate-50 border border-slate-100 flex items-center gap-2.5">
              {d.countryCode ? (
                <img
                  src={`https://flagcdn.com/w40/${d.countryCode}.png`}
                  srcSet={`https://flagcdn.com/w40/${d.countryCode}.png 1x, https://flagcdn.com/w80/${d.countryCode}.png 2x`}
                  width={20}
                  height={15}
                  loading="lazy"
                  alt={`${d.market} flag`}
                  className="rounded-sm border border-slate-200 object-cover shrink-0"
                />
              ) : (
                <span className="inline-flex w-5 h-4 items-center justify-center rounded-sm border border-slate-200 text-xs text-slate-500 bg-white shrink-0">
                  {d.market}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-700">{d.market}</div>
                {metric === 'cumulativeReturn' && (
                  <>
                    <div className={`text-sm font-bold tabular-nums ${retColor}`}>{retStr}</div>
                    <div className="text-xs text-slate-400">{weightStr}</div>
                  </>
                )}
                {metric === 'weight' && (
                  <>
                    <div className="text-sm font-bold tabular-nums text-slate-800">{weightStr}</div>
                    <div className={`text-xs tabular-nums ${retColor}`}>
                      {tr.marketChart.cumulativeReturn} {retStr}
                    </div>
                  </>
                )}
                {metric === 'value' && (
                  <>
                    <div className="text-sm font-bold tabular-nums text-slate-800">{formatCurrency(d.value, baseCurrency)}</div>
                    <div className="text-xs text-slate-400 flex flex-wrap gap-x-1 items-baseline">
                      <span>{weightStr}</span>
                      <span className="text-slate-300">·</span>
                      <span className={retColor}>{retStr}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MarketPerformanceChart;
