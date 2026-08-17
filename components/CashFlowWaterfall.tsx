import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Brush,
  TooltipProps,
  ReferenceLine,
} from 'recharts';
import { WaterfallPeriodRow } from '../portfolioTypes';
import { formatCurrency, valueInBaseCurrency } from '../utils/calculations';
import { useMarket } from '../contexts/MarketContext';
import { useUI } from '../contexts/UIContext';
import { t } from '../utils/i18n';

interface Props {
  rows: WaterfallPeriodRow[];
  /** 與外層標題合併顯示時隱藏內建標題 */
  hideHeader?: boolean;
  /** 外層容器已設高度時，圖表區填滿剩餘空間（儀表板主圖同款） */
  fillParent?: boolean;
  /** 窄螢幕：較緊 margin，繪圖區較大 */
  isCompact?: boolean;
}

const WF_COLOR_INFLOW_POS = '#3b82f6';
const WF_COLOR_INFLOW_NEG = '#f97316';
const WF_COLOR_DIVIDEND = '#eab308';
const WF_COLOR_PL_POS = '#10b981';
const WF_COLOR_PL_NEG = '#ef4444';

type WfDatum = {
  period: string;
  segPLPosSwapped: number;
  segPLPosDefault: number;
  segPLNeg: number;
  segFlowPosDefault: number;
  segFlowPosSwapped: number;
  segFlowNeg: number;
  segIncomeDefault: number;
  segIncomeSwapped: number;
  segPLForTooltip: number;
  segFlowForTooltip: number;
};

const STANDALONE_CHART_HEIGHT = 'h-[380px] md:h-[540px]';
const STANDALONE_CHART_HEIGHT_COMPACT = 'h-[400px] md:h-[540px]';

export const WaterfallLegendHints: React.FC = () => {
  const { language } = useUI();
  const tr = t(language);

  return (
    <div className="mt-3 max-sm:px-3 border-t border-slate-200 dark:border-slate-600 pt-2.5 space-y-2 text-[14px] leading-snug text-slate-600 dark:text-slate-400">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <span className="inline-flex items-start gap-2 min-w-[min(100%,280px)] grow max-w-full">
          <span className="inline-flex gap-0.5 shrink-0 mt-0.5">
            <span
              className="w-3 h-3 rounded-sm ring-1 ring-slate-200/80 dark:ring-slate-600"
              style={{ backgroundColor: WF_COLOR_INFLOW_POS }}
            />
            <span
              className="w-3 h-3 rounded-sm ring-1 ring-slate-200/80 dark:ring-slate-600"
              style={{ backgroundColor: WF_COLOR_INFLOW_NEG }}
            />
          </span>
          <span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{tr.dashboard.annualNetInflow}</span>
            <span className="text-slate-500 dark:text-slate-400"> — {tr.waterfall.legendHintInflow}</span>
          </span>
        </span>
        <span className="inline-flex items-start gap-2 min-w-[min(100%,280px)] grow max-w-full">
          <span
            className="w-3 h-3 rounded-sm shrink-0 mt-0.5 ring-1 ring-slate-200/80 dark:ring-slate-600"
            style={{ backgroundColor: WF_COLOR_DIVIDEND }}
          />
          <span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{tr.waterfall.dividend}</span>
            <span className="text-slate-500 dark:text-slate-400"> — {tr.waterfall.legendHintDividend}</span>
          </span>
        </span>
        <span className="inline-flex items-start gap-2 min-w-[min(100%,280px)] grow max-w-full">
          <span className="inline-flex gap-0.5 shrink-0 mt-0.5">
            <span
              className="w-3 h-3 rounded-sm ring-1 ring-slate-200/80 dark:ring-slate-600"
              style={{ backgroundColor: WF_COLOR_PL_POS }}
            />
            <span
              className="w-3 h-3 rounded-sm ring-1 ring-slate-200/80 dark:ring-slate-600"
              style={{ backgroundColor: WF_COLOR_PL_NEG }}
            />
          </span>
          <span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{tr.waterfall.stockPL}</span>
            <span className="text-slate-500 dark:text-slate-400"> — {tr.waterfall.legendHintPL}</span>
          </span>
        </span>
      </div>
    </div>
  );
};

const CashFlowWaterfall: React.FC<Props> = ({ rows, hideHeader, fillParent, isCompact }) => {
  const { baseCurrency, rates } = useMarket();
  const { language } = useUI();
  const tr = t(language);
  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const axisTextColor = isDarkMode ? '#cbd5e1' : '#64748b';
  const axisLineColor = isDarkMode ? '#64748b' : '#94a3b8';

  const toBase = useCallback(
    (v: number) => valueInBaseCurrency(v, baseCurrency, rates),
    [baseCurrency, rates]
  );

  const data = useMemo(() => {
    return rows.map(r => {
      const flow = toBase(r.netInflow);
      const pl = toBase(r.marketPL);
      const income = toBase(r.income);
      const flowPos = flow >= 0 ? flow : 0;
      const flowNeg = flow < 0 ? flow : 0;
      const shouldSwapFlowAndPL = pl > 0;
      const shouldSwapFlowAndIncome = pl < 0;

      return {
        period: r.period,
        // 股票盈虧為正時，將「投入」放在底部、股票盈虧疊在最上方；虧損時維持原順序
        segPLPosSwapped: shouldSwapFlowAndPL ? pl : 0,
        segPLPosDefault: shouldSwapFlowAndPL ? 0 : (pl >= 0 ? pl : 0),
        segPLNeg: pl < 0 ? pl : 0,
        /** 拆成兩段固定 fill，避免堆疊 Bar 上 Cell 顏色被 Recharts 忽略 */
        segFlowPosDefault: shouldSwapFlowAndPL ? 0 : flowPos,
        segFlowPosSwapped: shouldSwapFlowAndPL ? flowPos : 0,
        segFlowNeg: flowNeg,
        segIncomeDefault: shouldSwapFlowAndIncome ? 0 : income,
        segIncomeSwapped: shouldSwapFlowAndIncome ? income : 0,
        segPLForTooltip: pl,
        segFlowForTooltip: flow,
      };
    });
  }, [rows, toBase]);

  /** 與累積損益一致：手機預設 7 年、桌面 8 年；超過時可用 Brush 拖看更早 */
  const brushVisibleCount = isCompact ? 7 : 8;
  const showBrush = isCompact ? data.length > 7 : data.length > 8;
  const brushDefaultIndices = useMemo(() => {
    const len = data.length;
    if (len === 0) return { startIndex: 0, endIndex: 0 };
    const endIndex = len - 1;
    const startIndex = Math.max(0, len - brushVisibleCount);
    return { startIndex, endIndex };
  }, [data.length, brushVisibleCount]);
  const [brushIndices, setBrushIndices] = useState(brushDefaultIndices);
  useEffect(() => {
    setBrushIndices(brushDefaultIndices);
  }, [data.length, brushVisibleCount, brushDefaultIndices]);

  const waterfallTooltipContent = React.useCallback(
    ({ active, payload, label, contentStyle }: TooltipProps<number, string>) => {
      if (!active || !payload?.length) return null;
      const row = payload[0]?.payload as WfDatum | undefined;
      if (!row) return null;

      const flow = row.segFlowForTooltip;
      const income = row.segIncomeDefault + row.segIncomeSwapped;
      const annualPLWithIncome = row.segPLForTooltip + income;
      const inflowColor =
        flow > 0 ? WF_COLOR_INFLOW_POS : flow < 0 ? WF_COLOR_INFLOW_NEG : '#64748b';
      const annualPLColor =
        annualPLWithIncome > 0 ? WF_COLOR_PL_POS : annualPLWithIncome < 0 ? WF_COLOR_PL_NEG : '#64748b';
      const dividendIncludedLabel = tr.waterfall.includingLabel.replace('{item}', tr.waterfall.dividend);

      const item = (key: string, color: string, name: string, value: number) => (
        <li
          key={key}
          className="recharts-tooltip-item"
          style={{ display: 'block', paddingTop: 4, paddingBottom: 4, color, margin: 0 }}
        >
          <span className="recharts-tooltip-item-name">{name}</span>
          <span className="recharts-tooltip-item-separator"> : </span>
          <span className="recharts-tooltip-item-value">{formatCurrency(value, baseCurrency)}</span>
        </li>
      );

      return (
        <div
          className="recharts-default-tooltip"
          style={{
            margin: 0,
            padding: 10,
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            ...contentStyle,
          }}
        >
          <p
            className="recharts-tooltip-label"
            style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}
          >
            {label}
          </p>
          <ul className="recharts-tooltip-item-list" style={{ padding: 0, margin: 0, listStyle: 'none' }}>
            {item('flow', inflowColor, tr.dashboard.annualNetInflow, flow)}
            {item('annual-pl', annualPLColor, tr.dashboard.annualProfit, annualPLWithIncome)}
            {item('income', WF_COLOR_DIVIDEND, dividendIncludedLabel, income)}
          </ul>
        </div>
      );
    },
    [baseCurrency, tr, isDarkMode]
  );

  const chartHeightClass = isCompact ? STANDALONE_CHART_HEIGHT_COMPACT : STANDALONE_CHART_HEIGHT;
  /** 與儀表板累積損益圖相同：固定 Y 軸寬，避免 Recharts 預設 ~60px 把繪圖區往右推 */
  const leftAxisWidth = isCompact ? 30 : 39;
  const chartMargin = isCompact
    ? { top: 8, left: 2, right: 2, bottom: 58 }
    : { top: 10, left: 4, right: 16, bottom: 56 };

  if (rows.length === 0) {
    return (
      <div
        className={`${fillParent ? 'h-full' : chartHeightClass} flex items-center justify-center text-slate-400 text-sm`}
      >
        {tr.waterfall.noData}
      </div>
    );
  }

  return (
    <div className={fillParent ? 'w-full h-full min-h-0' : 'w-full'}>
      {!hideHeader && (
        <div className="mb-1">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{tr.waterfall.title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{tr.waterfall.subtitle}</p>
        </div>
      )}
      <div className={fillParent ? 'h-full w-full min-h-0' : `w-full ${chartHeightClass}`}>
        <ResponsiveContainer width="100%" height="100%" debounce={50}>
          <BarChart data={data} margin={chartMargin} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-slate-700" />
            <XAxis
              dataKey="period"
              stroke={axisTextColor}
              tick={{ fill: axisTextColor }}
              axisLine={{ stroke: axisLineColor }}
              tickLine={{ stroke: axisLineColor }}
              fontSize={10}
              angle={-40}
              textAnchor="end"
              height={68}
              interval={0}
            />
            <YAxis
              orientation="left"
              stroke={axisTextColor}
              tick={{ fill: axisTextColor, fontSize: 9 }}
              axisLine={{ stroke: axisLineColor }}
              tickLine={{ stroke: axisLineColor }}
              width={leftAxisWidth}
              tickMargin={2}
              tickFormatter={(val: number) => {
                if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
                if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
                return val.toFixed(0);
              }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 3" />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
              content={waterfallTooltipContent}
            />
            <Legend
              wrapperStyle={{ color: axisTextColor, fontSize: 14, paddingTop: 6 }}
              formatter={(value: string) => {
                if (value === 'segPLPosSwapped' || value === 'segPLPosDefault') return tr.waterfall.stockPL;
                if (value === 'segFlowPosDefault' || value === 'segFlowPosSwapped') return tr.dashboard.annualNetInflow;
                if (value === 'segIncomeDefault' || value === 'segIncomeSwapped') return tr.waterfall.dividend;
                return value;
              }}
            />
            <Bar
              dataKey="segFlowPosSwapped"
              name="segFlowPosSwapped"
              stackId="wf"
              fill={WF_COLOR_INFLOW_POS}
              radius={[0, 0, 0, 0]}
            />
            <Bar dataKey="segIncomeSwapped" name="segIncomeSwapped" stackId="wf" fill={WF_COLOR_DIVIDEND} radius={[0, 0, 0, 0]} legendType="none" />
            <Bar dataKey="segIncomeDefault" name="segIncomeDefault" stackId="wf" fill={WF_COLOR_DIVIDEND} radius={[0, 0, 0, 0]} />
            <Bar
              dataKey="segFlowPosDefault"
              name="segFlowPosDefault"
              stackId="wf"
              fill={WF_COLOR_INFLOW_POS}
              radius={[2, 2, 0, 0]}
              legendType="none"
            />
            <Bar dataKey="segPLPosDefault" name="segPLPosDefault" stackId="wf" fill={WF_COLOR_PL_POS} radius={[2, 2, 0, 0]} />
            <Bar dataKey="segPLPosSwapped" name="segPLPosSwapped" stackId="wf" fill={WF_COLOR_PL_POS} radius={[2, 2, 0, 0]} legendType="none" />
            <Bar
              dataKey="segFlowNeg"
              name="segFlowNeg"
              stackId="wf"
              fill={WF_COLOR_INFLOW_NEG}
              radius={[0, 0, 0, 0]}
              legendType="none"
            />
            <Bar dataKey="segPLNeg" name="segPLNeg" stackId="wf" fill={WF_COLOR_PL_NEG} radius={[2, 2, 0, 0]} legendType="none" />
            {showBrush && (
              <Brush
                dataKey="period"
                height={24}
                stroke="#94a3b8"
                travellerWidth={12}
                startIndex={brushIndices.startIndex}
                endIndex={brushIndices.endIndex}
                onChange={(next) => {
                  if (
                    next &&
                    typeof next.startIndex === 'number' &&
                    typeof next.endIndex === 'number'
                  ) {
                    setBrushIndices({
                      startIndex: next.startIndex,
                      endIndex: next.endIndex,
                    });
                  }
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {!fillParent && <WaterfallLegendHints />}
    </div>
  );
};

export default CashFlowWaterfall;
