import type { Translations } from './types';
import { zhTW } from './zh-TW';

const zhCN: Translations = JSON.parse(JSON.stringify(zhTW));
zhCN.baseCurrency = { TWD: '台币', USD: '美元', JPY: '日元', EUR: '欧元', GBP: '英镑', HKD: '港币', KRW: '韩元', CAD: '加元', INR: '印度卢比', CNY: '人民币', AUD: '澳元', SAR: '沙特里亚尔', BRL: '巴西雷亚尔' };
zhCN.pages = { dashboard: '投资组合仪表板', history: '历史记录（交易 + 资金流动）', funds: '资金存取与管理', accounts: '证券账户管理', rebalance: '投资组合再平衡', simulator: '资产配置模拟', splits: '股票拆分管理', help: '系统管理与备份' };
zhCN.common = { confirm: '确认', cancel: '取消', delete: '删除', edit: '编辑', save: '保存', close: '关闭', loading: '加载中...', search: '搜索', logoutConfirm: '确定要登出系统吗？', baseCurrency: '基准币', upgrade: '升级', footerLocalDataPrivacy: '本应用所有交易数据均存储在本地，保障您的隐私安全。' };
zhCN.nav = { dashboard: '仪表板', history: '交易记录', funds: '资金管理', accounts: '证券户', rebalance: '再平衡', simulator: '配置模拟', splits: '股票拆分', help: '系统管理', logout: '登出' };
zhCN.login = { title: 'TradeView 登录', subtitle: '投资资产管家', email: '邮箱', password: '密码', login: '登录', privacy: '隐私声明', privacyDesc: '数据存储在个人设备，不涉及个人隐私，请定时备份。', riskDisclaimer: '风险声明', riskDisclaimerDesc: '投资有风险，过往绩效不代表未来表现。' };
zhCN.dashboard = {
  ...zhTW.dashboard,
  netCost: '净投入',
  totalAssets: '总资产',
  totalPL: '总损益',
  detail: '明细',
  includeCash: '含现金',
  detailedStatistics: '详细统计数据',
  totalCost: '总投资成本',
  totalPLAmount: '总损益金额',
  accumulatedCashDividends: '累积配息现金',
  accumulatedStockDividends: '累积股息再投入',
  yearDividendTaxTitle: '本年度配息相关扣款（参考）',
  yearWithheldNhi: '累计二代健保补充保费（仅加总有填写之记录）',
  yearUsWithholding: '累计美股预扣税（已填写者加总；未填则依账户设置回推）',
  yearUsWithholdingHint: '在现金股息记录中填写「预扣税」可让统计更精准。',
  annualizedReturn: '真实年化（XIRR）',
  annualizedReturnRate: '总市值年化报酬率',
  avgExchangeRate: '平均换汇成本',
  currentExchangeRate: '目前汇率',
  totalReturnRate: '累积总报酬率',
  assetVsCostTrend: '资产与成本趋势',
  aiCorrectHistory: 'AI 校正历史资产',
  marketDistribution: '个股／ETF 比重',
  allocation: '资产配置',
  allocationDonutSubtitle: '外圆：各标的市值占比（股／债标的合计，不含现金）／内圆：股债比例',
  stockBondRatioBadge: '股债比例',
  legendMarketOuter: '个股／ETF（外圆）',
  legendStockBondInner: '股债比例（内圆）',
  assetClassOverrideTitle: '自定义股/债分类（覆盖）',
  tickerSymbolLabel: '代码',
  tickerPlaceholderExamples: '例如：AGG / TLT / BND',
  assetClassSelectLabel: '分类',
  equityLabelShort: '股',
  bondLabelShort: '债',
  saveAssetClassOverride: '保存覆盖',
  clearTickerOverride: '清除',
  currentOverridesHeading: '当前覆盖',
  removeOverrideTitle: '点击移除覆盖',
  annualPerformance: '年度绩效表',
  year: '年份',
  startAssets: '期初资产',
  annualNetInflow: '年度净投入',
  endAssets: '期末资产',
  annualProfit: '年度损益',
  annualROI: '年度报酬率',
  brokerageAccounts: '账户列表',
  accountName: '账户名称',
  totalAssetsNT: '总资产',
  marketValueNT: '市值',
  balanceNT: '余额／欠款',
  balanceColumnTooltip:
    '证券户：现金余额；信贷专户：欠款本金。',
  profitNT: '损益',
  profitFormulaTooltip:
    '总损益 = 未实现 + 已实现 + 股息/利息。已实现仅统计 SELL，转仓不计入已实现。',
  accountReturnRateTooltip:
    '累积报酬率 = 损益 ÷ 分母 × 100%。优先净入金；若≤0 则用累计投入成本。转仓若填转移日市值，转出户认列已实现、转入户成本以市值为准。无持股且现金≈0 标示已结清；无持股但仍有现金标示无持仓。',
  accountClosedBadge: '已结清',
  accountFlatBadge: '无持仓',
  unrealizedPL: '未实现损益',
  realizedPL: '已实现损益',
  dividendInterest: '累计股息/利息',
  displayCurrency: '显示币种',
  ntd: '台币',
  usd: '美金',
  portfolioHoldings: '资产配置明细',
  mergedDisplay: '合并显示 (依标的)',
  detailedDisplay: '明细显示 (依账户)',
  aiUpdatePrices: 'AI 联网更新股价 & 汇率',
  estimatedGrowth8: '预估 8% 成长',
  annualizedReturnTarget8: '目标 8%',
  chartLoading: '图表加载中...',
  noChartData: '请先新增资金汇入与交易记录',
  noHoldings: '无持仓',
  noAccounts: '尚无证券户，请至「证券户」新增。',
  assetTrendMergedSubtitle: '左侧主柱：累计投资成本与损益；蓝／橙线：总资产与预估；右侧细柱：该年度资金流入、流出、市场损益与配息。',
  toggleYearlyFlowBars: '年度资金流柱',
  yearlyFlowIn: '年度流入',
  yearlyFlowOut: '年度流出',
  yearlyMarketPL: '年度市场损益',
  yearlyIncome: '年度配息/利息',
  costBreakdown: '净投入成本计算明细',
  netInvestedBreakdown: '净投入成本计算明细',
  calculationFormula: '计算公式：净投入 = 汇入资金 - 汇出资金',
  formulaNote: '美元账户优先使用历史汇率，转账与利息不计入成本。',
  attention: '注意',
  date: '日期',
  category: '类别',
  originalAmount: '原始金额',
  twdCost: '成本 ({currency})',
  totalNetInvested: '总计',
  deposit: '汇入(+)',
  withdraw: '汇出(-)',
  fixedTWD: '指定台币金额',
  historicalRate: '历史汇率',
  currentRate: '目前汇率',
  taiwanDollar: '台币',
  twdIncludesFee: '台币（含手续费）',
  chartLabels: {
    investmentCost: '投资成本',
    accumulatedPL: '累积损益',
    estimatedAssets: '预估总资产 (8%)',
    totalAssets: '总资产',
    toDate: '至今',
    realData: ' (真实股价)',
    estimated: ' (估算)',
    profit: '盈利',
    loss: '亏损',
    barName: '累积损益：绿色=盈利 红色=亏损',
    yearlyPeriodRoi: '年度报酬率',
    chartLegendYearlyPeriodRoi: '右轴折线：仅各年 Q4（当年则为「至今」）一点，与年度绩效表算法相同（非年化）。',
  },
  noHoldingsData: '尚无持仓资料',
  realHistoricalData: '真实历史数据',
  formulaLabel: '计算公式：',
  aiCorrectHistoryTitle: '手动编辑或使用 AI 修正历史股价',
  aiAdvisor: 'Gemini AI 投资顾问',
  aiAdvisorDesc: '分析您的投资组合配置、风险与潜在机会。',
  startAnalysis: '开始分析',
  analyzing: '分析中...',
  viewCalculationDetails: '查看计算明细',
  riskWarning: '投资风险警告',
  riskWarningDesc: '投资有风险，过往绩效不代表未来表现。',
  chartLegendQuarterSnapshot: '✅ 有季末快照（Yahoo 真实数据）',
  chartLegendLinearInterpolation: '⚠️ 线性插值估算（请至历史股价校正 → 一键抓取补充）',
  notInvestmentAdvice: '本应用程式不提供投资建议，所有分析结果仅供参考。',
  netWorth: '净资产',
  totalDebt: '负债合计',
  leverageNetInvestedNote: '净投入可能含借贷拨入（约 {amount}）',
  leverageXirrWarning: '年化报酬含借贷资金，解读时请注意杠杆影响',
  debtDisbursement: '信贷拨入',
  debtRepayment: '信贷还本',
  leverageFormulaNote: '信贷拨入／还本（负债户转账）仍计入净投入与 XIRR；信贷利息不计入净投入。',
  debtAccountsTitle: '信贷／负债',
  creditUsedOfLimit: '已借 {used}／额度 {limit}，使用率 {percent}%',
  estimatedMonthlyInterest: '预计下月利息',
  estimatedMonthlyInterestNote: '依目前欠款余额与年利率估算（单月）',
};
zhCN.marketChart = {
  title: '各市场绩效比较',
  subtitle: '按市场分组，显示累积报酬率与资产占比',
  cumulativeReturn: '累积报酬率',
  weight: '占比',
  value: '市值',
  cumulativeReturnShort: '报酬',
  weightShort: '占比',
  valueShort: '市值',
  noData: '尚无持仓资料',
  ratio: '占比',
};
zhCN.waterfall = {
  title: '资金流瀑布图',
  subtitle: '资金流入、盈亏、配息与流出的累积净值',
  byYear: '按年',
  byQuarter: '按季',
  deposit: '资金流入',
  withdraw: '资金流出',
  stockPL: '股票盈亏',
  dividend: '配息收入',
  net: '本期净值',
  runningTotal: '累计净值',
  periodNet: '本期净',
  noData: '尚无资金流资料',
  plPositive: '股票盈亏(正)',
  plNegative: '股票盈亏(负)',
  legendHintStart: '该期开始时的投资组合总资产（含现金）。',
  legendHintInflow: '期内汇入减汇出。蓝色＝净流入，橙色＝净流出。',
  legendHintDividend: '该期入账的现金股息与利息。',
  legendHintPL: '资产变动扣除净投入与配息后的部分，近似市场损益；绿色为正、红色为负。',
  includingLabel: '（含{item}）',
};
zhCN.dividendHeatmap = {
  title: '股息收入热力图',
  subtitle: '每格代表当月已入账配息金额，颜色越深收入越高；待补登项目请见下方清单',
  totalDividend: '累计配息',
  noData: '尚无现金股息记录',
  bestMonth: '最佳月份',
  less: '少',
  more: '多',
  monthlyBreakdown: '当月明细',
  yearTotal: '年计',
  monthTotal: '月计',
  recordedLabel: '已入账',
  pendingLabel: '待补登',
};
zhCN.dividendTax = {
  ...zhTW.dividendTax,
  twTooltipTitle: '税务试算（参考）',
  estSinglePayout: '预计单次配息（依最近一次每股配息 × 持股）',
  estNhiFee: '预计二代健保补充保费（2.11%，试算）',
  splitHint0050: '若分散于不同券商／给付单位，单次给付是否跨门槛可能不同，实务以发放单位扣缴为准。',
  usNetTooltipTitle: '美股配息预扣（参考）',
  marketWithholdingRef: '配息预扣（试算）',
  estGrossPerPayout: '预估单次毛额（每股 × 股数）',
  estNetAfterWithholding: '预估税后入账（假设 30% 预扣，约 70%）',
  upcomingTitle: '未来 90 天内预计除息（Yahoo）',
  upcomingSubtitle: '金额依「最近一次每股现金股利 × 目前持股」试算，与实际发放可能不同。',
  upcomingEmpty: '目前无符合条件的除息日程，或尚无法取得公开资料。',
  upcomingExDate: '除息日',
  upcomingInferredMonthHint:
    '此「推估月」来自近年除息月份规律，并会跳过您本年度已记录的月份；Yahoo 目前未列出未来 90 天内的确定除息日（故除息日显示「—」）。金额仍以「最近一次每股现金股利 × 目前持股」试算，非官方公告。',
  upcomingEstTwd: '预估配息 (TWD)',
  upcomingEstUsd: '预估税后 (USD)',
  dataFromYahoo: '数据来源：Yahoo Finance（缓存在本机）',
  disclaimerShort: '仅供参考，非报税或法律建议。',
  usBadgeShort: '70%',
  nhiForecastTag: '预估单次配息将触发二代健保扣费',
  pendingActualTitle: '待确认实绩配息',
  pendingActualSubtitle: '今年已除息、尚未在交易记录出现的配息会列于下方清单；点击「新增」即以发放日入账并显示于热力图，「取消」则不再提示该笔。',
  pendingActualDripHint: '若为股息再投入 (DRIP)，请至交易记录「记一笔」登记，勿按「新增」。',
  pendingActualEmpty: '目前没有需要补登的实绩配息。',
  pendingActualLoading: '加载实绩数据…',
  pendingActualAddBtn: '新增',
  pendingActualAddCol: '新增至交易记录',
  pendingActualDismissBtn: '取消',
  pendingActualToggleHide: '隐藏清单',
  pendingActualToggleShow: '显示清单',
  pendingActualEstimatedDate: '估发放日',
  pendingActualSourceMoneyDj: '实绩',
  pendingActualSourceYahoo: 'Yahoo 备补',
  pendingActualPayDate: '发放日',
  pendingActualPerShare: '每股股息',
  pendingActualEstAmount: '试算实领（税后）',
  pendingActualAccount: '入账账户',
  pendingActualNoteTemplate: '自动导入：每股 {perShare}，持股 {qty}',
  pendingActualConfirmGrossAmount: '税前总额',
  pendingActualCompositionEstimated: '官方预估健保所得占比（股利 {dividend}%＋利息 {interest}%）',
  pendingActualNhiEligibleIncome: '预计健保计费所得',
  pendingActualCompositionWarning: '组成比例为基金资讯观测站公告前预估；实际扣费以收益分配通知书为准。',
  pendingActualCompositionUnavailable: '官方尚未公布此笔 ETF 配息组成，未自动扣除二代健保。',
  pendingActualWireFeeOption: '扣除汇费 10 元',
  pendingActualWireFeeHint: '台股汇费依券商／银行而定；若实际入账有扣款再勾选。',
  pendingActualWireFeeLabel: '汇费',
};
zhCN.funds = {
  ...zhTW.funds,
  title: '资金管理',
  operations: '操作选项',
  clearAll: '清空筛选资金',
  batchImport: '批次汇入',
  addRecord: '记一笔',
  filter: '查询/筛选',
  clearFilters: '清除所有筛选',
  accountFilter: '账户筛选',
  typeFilter: '类别筛选',
  dateFrom: '起始日期',
  dateTo: '结束日期',
  allAccounts: '所有账户',
  allTypes: '所有类别',
  deposit: '汇入',
  withdraw: '汇出',
  transfer: '转账',
  interest: '利息',
  loanInterest: '信贷利息',
  showRecords: '显示 {count} 笔记录',
  totalRecords: '共 {total} 笔',
  last30Days: '最近30天',
  thisYear: '今年',
  confirmClearAll: '确认清空筛选资金记录？',
  confirmClearAllMessage: '将删除 {count} 笔筛选范围内的入金、出金、转账与利息记录，且无法恢复。建议先备份数据。',
  confirmClear: '确认清空',
};
zhCN.accounts = {
  ...zhTW.accounts,
  addAccount: '新增证券户 / 银行账户',
  accountName: '账户名称',
  accountNamePlaceholder: '例如: 富邦证券, Firstrade',
  currency: '币别',
  currencyTWD: '台币',
  currencyUSD: '美元',
  currencyJPY: '日元',
  currencyEUR: '欧元',
  currencyGBP: '英镑',
  currencyHKD: '港币',
  currencyKRW: '韩元',
  currencyCNY: '人民币',
  currencyINR: '印度卢比',
  currencyCAD: '加元',
  currencyAUD: '澳元',
  currencySAR: '沙特里亚尔',
  currencyBRL: '巴西雷亚尔',
  subBrokerage: '海外券商',
  add: '新增',
  update: '更新',
  editAccount: '编辑账户',
  balance: '余额',
  cancel: '取消',
  updateAccount: '更新账户',
  confirmDelete: '确认删除账户',
  confirmDeleteMessage: '您确定要删除「{name}」吗？',
  deleteWarning: '注意：这不会删除该账户下的历史交易记录，但在筛选时可能会出现异常。',
  deleteAccount: '确认删除',
  cannotDeleteClosedTitle: '无法删除已结清／无持仓账户',
  cannotDeleteClosedMessage:
    '此账户已无持股（或已结清）。删除会让历史交易变成「未知账户」。若不想在列表看到，请改为隐藏。',
  hideAccount: '隐藏账户',
  hiddenAccountsSection: '已隐藏账户',
  restoreAccount: '恢复显示',
  duplicateHiddenNameHint:
    '账户名称「{name}」与已隐藏账户相同。请先恢复该账户，或使用其他名称。',
  noAccounts: '尚无账户，请上方新增第一个证券户。',
  cashBalance: '现金余额',
  editAccountTitle: '编辑账户',
  accountKind: '账户类型',
  accountKindBrokerage: '证券户（投资）',
  accountKindLiability: '负债专户（信贷）',
  debtKind: '信贷类型',
  debtKindPersonal: '个人信贷',
  debtKindMortgage: '房屋信贷',
  debtKindSecurities: '借券信贷',
  annualInterestRate: '年利率 (%)',
  creditLimit: '信贷额度',
  linkedBrokerageAccount: '主要对应证券户',
  debtBalance: '欠款本金',
  liabilityHint: '拨款请用资金管理「转账」：负债户 → 证券活存。',
};
zhCN.rebalance = {
  ...zhTW.rebalance,
  title: '个股再平衡',
  resetToCurrent: '带入目前比重',
  totalAssets: '总资产 (含现金)',
  enable: '平衡',
  symbol: '标的',
  currentPrice: '现价',
  currentValue: '现值',
  currentWeight: '目前占比',
  targetWeight: '目标占比',
  targetValue: '目标价值',
  adjustAmount: '调整金额',
  suggestedAction: '建议操作',
  cash: '现金',
  totalEnabled: '已启用项目',
  remainingFunds: '剩余资金',
  notParticipating: '不参与平衡',
  accounts: '个账户',
  description: '说明：',
  description1: '相同名称的个股会自动合并显示，目标占比会按现值比例分配给各个账户。',
  description2: '勾选「平衡」栏位来选择哪些股债需要再平衡，未勾选的项目将不参与再平衡计算。',
  description3: '现金部分也可以勾选，若勾选现金，可以手动设定现金目标比例；若不勾选，现金将维持现状。',
  description4: '目标占比会自动保存。若未手动设定现金目标，系统会自动计算剩余比例分配给现金；若手动设定现金目标，则使用您设定的值。',
  description5: '若「现金」目标比例为负值，代表您的股票目标配置超过 100%，请调降部分持股目标。',
  description6: '点击「带入目前比重」可快速重置所有目标值为当前现况。',
  buy: '买',
  sell: '卖',
  accountLabel: '(账户)',
  sharesLabel: '(股)',
  totalLabel: '总计 (',
  accountCount: '个账户',
};
zhCN.labels = { ...zhTW.labels, date: '日期', account: '账户', amount: '金额', balance: '余额', action: '操作', type: '类别', price: '单价', quantity: '数量', currency: '币别', fee: '手续费', exchangeRate: '汇率', totalCost: '总计成本', category: '类别', description: '标的/描述', note: '备注' };
zhCN.history = {
  ...zhTW.history,
  tabTransactions: '交易记录',
  tabTimeline: '持有时间轴',
  operations: '操作选项',
  batchUpdateMarket: '批量修改市场',
  clearAll: '清空筛选交易',
  batchImport: '批次汇入',
  addRecord: '记一笔',
  filter: '查询/筛选',
  clearFilters: '清除所有筛选',
  accountFilter: '账户筛选',
  tickerFilter: '股票代号筛选',
  dateFrom: '开始日期',
  dateTo: '结束日期',
  includeCashFlow: '包含现金流记录',
  showingRecords: '显示 {count} 笔记录',
  totalRecords: '共 {total} 笔：{transactionCount} 笔交易{hasCashFlow}',
  last30Days: '最近30天',
  thisYear: '今年',
  noTransactions: '尚无交易记录',
  noMatchingTransactions: '找不到符合条件的交易',
  edit: '编辑',
  delete: '删除',
  includeCashFlowDesc: '勾选后会显示资金汇入、提取、转账等记录，方便查看余额变化',
  hiddenCashFlowRecords: '已隐藏 {count} 笔现金流记录',
  cashFlowDeposit: '资金汇入',
  cashFlowWithdraw: '资金提取',
  cashFlowTransfer: '账户转出',
  cashFlowTransferIn: '账户转入',
};
zhCN.stockTimeline = {
  ...zhTW.stockTimeline,
  noTransactionsHint: '暂无交易记录，请先新增交易。',
  searchPlaceholder: '搜索代码...',
  allMarkets: '全部市场',
  statusAll: '全部',
  statusHolding: '持有中',
  statusClosed: '已结清',
  sortByFirstBuy: '按首次买入',
  sortByTicker: '按代码',
  sortByPLPercent: '按损益 %',
  countUnit: '档',
  symbol: '标的',
  plAndStatus: '损益 / 状态',
  holdingTitle: '持有中',
  closedTitle: '已结清',
  firstBuy: '首次买入',
  lastTrade: '最后交易',
  holdingDays: '持有天数',
  avgCost: '均成本',
  currentPrice: '现价',
  holdingQty: '持有量',
  pl: '损益',
  fee: '手续费',
  noMatches: '查无符合条件的标的',
  legendBuy: '买',
  legendSell: '卖',
  legendStockDividend: '股',
  legendCashDividend: '息',
  legendTransferIn: '汇入持股',
  legendTransferOut: '汇出持股',
  legendHolding: '持有中',
};
zhCN.holdings = { ...zhTW.holdings, portfolioHoldings: '资产配置明细', mergedDisplay: '合并显示 (依标的)', detailedDisplay: '明细显示 (依账户)', aiUpdatePrices: 'AI 联网更新股价 & 汇率', aiSearching: 'AI 搜寻中...', market: '市场', ticker: '代号', quantity: '数量', currentPrice: '现价', weight: '比重', cost: '总成本', marketValue: '市值', profitLoss: '损益', annualizedROI: '年化', dailyChange: '今日涨跌', avgPrice: '均价', noHoldings: '尚无持仓资料，请新增交易。' };
zhCN.simulator = {
  ...zhTW.simulator,
  title: '资产配置模拟说明',
  description: '此工具可让您比较不同资产配置的预期获利。请输入各种股票或 ETF 的成立以来年化报酬率作为假设值，系统会根据您的配置比例计算组合的预期表现。',
  descriptionWarning: '⚠️ 注意：过往绩效不代表未来表现，此模拟仅供参考。',
  basicSettings: '基本设定',
  initialAmount: '初始投资金额',
  investmentYears: '投资年数',
  regularInvestment: '定期定额投资（选填）',
  regularAmount: '定期定额金额',
  frequency: '投入频率',
  monthly: '每月投入',
  quarterly: '每季投入',
  yearly: '每年投入',
  annualTotal: '年度总投入',
  setToZero: '设定为 0 则不使用定期定额',
  importFromHoldings: '现有持仓导入',
  importButton: '从现有持仓导入',
  manualAdd: '手动添加资产',
  ticker: '股票代号',
  tickerPlaceholder: '例如: 0050',
  market: '市场',
  marketTW: '台股',
  marketUS: '美股',
  marketUK: '英股',
  marketJP: '日股',
  marketCN: '中国(沪)',
  marketSZ: '中国(深)',
  marketIN: '印度',
  marketCA: '加拿大',
  marketFR: '法国',
  marketHK: '香港',
  marketKR: '韩国',
  marketDE: '德国',
  marketAU: '澳洲',
  marketSA: '沙特',
  marketBR: '巴西',
  annualReturn: '年化报酬率',
  autoQuery: '🔍 自动查询',
  querying: '查询中',
  allocation: '配置比例',
  add: '添加',
  assetList: '资产配置列表',
  autoBalance: '自动平衡',
  clearAll: '清空全部',
  allocationSum: '配置比例总和:',
  totalInvested: '总投入金额',
  finalValue: '最终价值',
  totalReturn: '总报酬',
  portfolioAnnualReturn: '组合年化报酬',
  initial: '初始',
  yearlyProjection: '年度预测趋势图',
  yearlyReturnAnalysis: '年度报酬分析',
  detailedYearlyProjection: '详细年度预测',
  year: '年份',
  assetValue: '资产价值',
  yearlyReturn: '年度报酬',
  cumulativeInvestment: '累积投入',
  yearlyReturnRate: '年度报酬率',
  allocationWarning: '⚠️ 配置比例总和必须等于 100%，目前为',
  confirmClear: '确认清空',
  confirmClearMessage: '确定要清空所有资产配置吗？此操作无法恢复。',
  dataWarning: '⚠️ 数据完整性警告：',
  dataWarningDesc: '建议：如果计算结果明显低于预期，可能是因为 Yahoo Finance 的历史数据不完整。您可以参考官方资料或手动输入更准确的年化报酬率。',
  cagrExplanation: '📊 年化报酬率计算说明：',
  cagrFormula: 'CAGR = ((当前价格 / 初始价格) ^ (1 / 年数)) - 1',
  cagrFormulaDesc: '系统使用 CAGR (复合年成长率) 公式计算：',
  cagrExample: '这表示如果从上市时买入并持有至今，每年的平均复合报酬率。',
  cagrExampleValue: '范例：股票从 100 元涨到 200 元，经过 5 年，年化报酬率约为 14.87%',
  errorEnterTicker: '请输入股票代号',
  errorEnterAllocation: '请输入配置比例',
  errorAllocationRange: '配置比例必须在 0% 到 100% 之间',
  errorAllocationSum: '配置比例总和不能超过 100%',
  errorNoHoldings: '目前没有持仓资料可导入',
  errorEnterTickerFirst: '请先输入股票代号',
  errorCannotGetReturn: '无法取得 {ticker} 的年化报酬率，请手动输入',
  errorQueryFailed: '查询年化报酬率失败，请手动输入',
  close: '关闭',
  cancel: '取消',
  yearPrefix: '第',
  yearSuffix: '年',
  queryingReturn: '正在查询 {ticker} 的年化报酬率...',
  autoQueryTitle: '自动查询上市以来的年化报酬率',
  addRow: '添加行',
  action: '操作',
  delete: '删除',
  addAll: '加入配置列表',
  yearlyInvestment: '年度投入',
};
zhCN.help = {
  dataManagement: '数据备份与还原',
  export: '备份数据',
  exportDesc: '将您的交易记录、账户设定与股价信息导出为 JSON 文件，建议定期备份以免数据丢失。',
  downloadBackup: '下载备份文件 (.json)',
  import: '还原数据',
  importWarning: '警告：导入备份文件将会完全覆盖您目前的系统数据。',
  uploadBackup: '上传备份文件',
  authorizedUsers: '用户授权名单',
  authorizedUsersDesc: '以下为系统预设可免密码登录的 Email 名单（已脱敏）：',
  emailAccount: 'Email 账号',
  status: '状态',
  systemAuthorized: '系统授权',
  contact: '联系我们',
  contactTitle: '问题回报与建议',
  contactDesc: '若有功能建议或 Bug 回报，欢迎来信。业余时间维护，回复较慢请见谅。',
  contactEmail: '联系管理员',
  subscription: '会员订阅（内购）',
  subscriptionTitle: '申请会员 / 管理订阅',
  subscriptionDesc: '通过 App Store 订阅可解锁完整功能。可在此查看方案、购买或恢复购买记录。',
  subscribeButton: '打开订阅方案',
  deleteAppAccount: '删除账号与数据',
  deleteAppAccountDesc: '永久清除本机登录状态与所有相关数据（交易、账户等）。此操作仅影响此设备且无法复原。订阅取消请至设备「设置 → 订阅项目」。',
  confirmDeleteAppAccount: '确认删除账号与数据',
  confirmDeleteAppAccountMessage: '将永久清除账号「{user}」在本机的所有数据，且无法复原。确定要删除吗？',
  documentation: '使用说明',
  copyAll: '复制全文',
  copied: '已复制!',
  downloadPdf: '下载 PDF',
  pdfGenerating: '正在生成 PDF…',
  pdfShareTitle: 'TradeView 使用说明书',
  pdfDownloadFailed: 'PDF 生成或保存失败，请稍后再试。',
  pdfDownloadTextFallback: 'PDF 无法生成，已改为文字档 (.txt) 分享，内容与使用说明相同。',
  confirmImport: '警告：确认覆盖数据？',
  confirmImportMessage: '您即将导入 {fileName}。',
  confirmImportWarning: '这将会完全清除目前的交易记录与设定，且无法恢复。',
  confirmOverride: '确认覆盖',
  documentationContent: `# TradeView 使用说明书

> **隐私与安全声明**：
> 本系统采用离线优先架构，**所有交易数据皆储存于您的本机装置**（iOS／Android App 或电脑浏览器），不会上传至任何服务器。**系统不涉及收集个人资料**，请安心使用。

## 1. 系统简介
TradeView 是一个支持各国股市的资产管理工具，协助投资人追踪资产变化、计算报酬率并管理资金流向。

## 2. 快速开始
依下列顺序完成首次设定（与汉堡菜单「证券户 → 资金管理 → 交易记录 → 仪表板」的操作流程一致）：
1. **建立账户**：前往「证券户」新增您的银行或证券账户。
2. **导入资金**：前往「资金管理」，点「记一笔」，类别选 **汇入资金 (Import/Salary)** 将薪资或存款记录到系统中。
3. **新增交易**：前往「交易记录」，点右上角「记一笔」输入股票买卖记录。
4. **查看报表**：回到「仪表板」查看绩效摘要；**会员**另可查看累积损益图、资产配置、市场绩效与股息热力图等进阶图表。

## 3. 功能详解
以下依汉堡菜单顺序说明（**访客**与**会员**可见项目略有不同，详见 FAQ）。

### 仪表板
「仪表板」为默认首页，显示绩效摘要卡与持仓明细。**会员**另可查看累积损益图、资产配置饼图、市场绩效与股息热力图等进阶区块。若有信贷专户欠款，会显示 **信贷／负债** 相关卡片（详见下方信贷 Q&A）。

**股息热力图（会员）**：若待补登项目为**股息再投入 (DRIP)**，请至「交易记录」点「记一笔」登记；**勿**在热力图待补清单按「新增」（该按钮仅适用现金股息）。

### 交易记录
记录买卖、股利与持股转移。点右上角「记一笔」新增；可透过「批量修改市场」一次调整多笔交易的市场设定。另可点 **「批次汇入」**、**「清空筛选交易」**。

**交易类别**
* **Buy/Sell**：一般买卖。
* **股息再投入 (DRIP)**：股票股利或股息再投入，持股数增加。
* **现金股息 (Cash)**：现金派发，账户余额增加。
* **汇出持股 (Transfer Out)**：股票自该证券户转出至其他证券户。
* **汇入持股 (Transfer In)**：股票自其他证券户转入该证券户。

**持股转移（甲证券 → 乙证券）**
**建议（一次完成）**：「记一笔」→ 类别选 **汇出持股 (Transfer Out)** → 交易账户选来源（甲证券）→ 填日期、市场、代号、股数 → 于画面选择 **汇入持股目标账户**（乙证券）→ 先按 **「保存交易」**，再于确认窗按 **「确认保存」**。系统会**同时建立** **汇出持股** 与 **汇入持股** 两笔记录；自动建立的汇入持股笔**手续费为 0**，有手续费时请在 **汇出持股** 这笔填写。价格默认为该户该标的平均成本，请以成本为准、勿用市价。

### 资金管理
点「记一笔」登打资金流向，类别包含：
* **汇入资金 (Import/Salary)**：外部资金流入（如薪资）。
* **汇出资金 (Export/Living)**：资金流出（如生活费提领）。
* **内部转账 (Transfer)**：不同账户间的资金移动（如银行转证券户）。
* **利息收入 (Interest)**：记录存款或证券户利息。
* **信贷利息**：贷款利息支出；记在「证券户」时扣现金。

另可点 **「批次汇入」**、**「清空筛选资金」**。

### 证券户
新增、编辑银行或证券账户。**账户类型** 可选一般 **证券户（投资）** 或 **负债专户（信贷）**；信贷账户操作请见下方 Q&A。

### 股票拆分
「股票拆分」页面可登记拆分事件。交易记录维持当时登录的股数与价格；拆分事件仅在计算持仓与损益时依生效日自动调整。若生效日后的交易已改为拆分后股数，请勿重复登录。

### 再平衡（会员）
「再平衡」可设定各标的目标占比：相同名称的个股会自动合并显示；勾选 **平衡** 字段来选择哪些项目参与再平衡计算。目标占比会自动储存，亦可点「带入目前比重」快速重置。

### 配置模拟
「配置模拟」可比较不同资产配置的预期获利。输入各标的年化报酬率假设值与配置比例即可试算；页内「🔍 自动查询」取得的是 CAGR（与「仪表板」**真实年化（XIRR）** 不同）。⚠️ 过往绩效不代表未来表现，此模拟仅供参考。

### 信贷／负债专户（Q&A）

Q: 信贷户的**余额／欠款**是什么？
A: 代表**目前欠款**（欠银行多少），不是可动用的现金。余额归零 = 已还清。

Q: 如何建立信贷账户？
A: 「证券户」→ **账户类型** 选 **负债专户（信贷）** → 填 **账户名称**、**币别**、**年利率 (%)**、**信贷额度**（选填）→ 点「新增」。初始余额请留 **0**。

Q: 银行拨款到证券户，怎么记？
A: 这代表**银行把信贷资金拨入您的证券活存**。请用一笔 **内部转账 (Transfer)** 同时反映：**负债专户欠款增加**、**证券户现金增加**（并计入净投入）。

**操作步骤**（「资金管理」→ 点 **记一笔**）：
1. **类型** 选 **内部转账 (Transfer)**
2. **来源账户** 选 **负债专户（信贷）**
3. **转入目标账户** 选收到款的 **证券户（投资）**
4. 填 **拨款日期**、**金额**（等同银行实际拨入之本金）；若两户**币别不同**，请填 **汇率**
5. 确认后保存

**只记这一笔即可**。请**勿**再对负债专户另记 **汇入资金 (Import/Salary)**，否则欠款会被重复计算。选定「负债 → 证券」时，表单会提示「信贷拨款：从负债专户转入证券户，将计入净投入。」

Q: 如何还本？
A: 这代表**从证券户拿出现金，偿还信贷本金**（不含利息）。请用一笔 **内部转账 (Transfer)** 同时反映：**证券户现金减少**、**负债专户欠款减少**（并计入净投入）。

**操作步骤**（「资金管理」→ 点 **记一笔**）：
1. **类型** 选 **内部转账 (Transfer)**
2. **来源账户** 选扣款的 **证券户（投资）**
3. **转入目标账户** 选 **负债专户（信贷）**
4. 填 **还款日期**、**金额**（仅填**本金**；利息请见下一题）；若两户**币别不同**，请填 **汇率**
5. 确认后保存

**请勿**用 **汇出资金 (Export/Living)** 代替还本。信贷专户余额只追踪**本金**；本金还清后应归 **0**。选定「证券 → 负债」时，表单会提示「信贷还本：从证券户转回负债专户。」

Q: 信贷利息要记在哪？
A: 「证券户」。「资金管理」→「信贷利息」→ 选证券户，会扣现金（下拉选单仅显示证券户，不含信贷专户）。若银行一次扣「本金＋利息」，请**分两笔**：①「内部转账 (Transfer)」（证券户→信贷户）记**本金**；②「信贷利息」记**证券户**记利息。

Q: 怎样算还清了？
A: 以信贷户**欠款余额是否归零**为准（负数代表多付利息，亦视为已结清）。还款总额含利息时，通常大于当初借款本金，这是正常的。

Q: 还清后要删账户吗？
A: 不用。账户与历史记录可保留；余额为 0 时，「仪表板」不再显示信贷区块。

Q: 「仪表板」有欠款时怎么显示？
A: **信贷专户**的 **余额／欠款** 栏 > 0（即欠款本金）：显示 **信贷／负债** 卡片，主卡改为**净资产**（总资产 − 负债合计）。该栏 **= 0**：不显示信贷区块，主卡恢复**总资产**。

## 4. 常见问题 (FAQ)

Q: 如何计算年化报酬率？
A: 「仪表板」的 **真实年化（XIRR）** 为资金加权年化，依汇入／汇出记录与目前总资产计算（不定期现金流）；与 **仅看价涨跌** 的 CAGR 不同。「配置模拟」内 **🔍 自动查询** 的年化为 CAGR。

Q: 汇率如何设定？
A: 可在右上角设定全域 USD/TWD 汇率，或在「内部转账 (Transfer)」时指定当下汇率。

Q: 访客与会员有何差异？
A: **访客**可登入并使用「仪表板」、「交易记录」、「资金管理」、「证券户」、「股票拆分」、「配置模拟」等基本功能；仪表板显示绩效摘要卡与持仓明细。**会员**另可解锁「再平衡」菜单，以及累积损益图、资产配置图、市场绩效、股息热力图与 **AI 校正历史资产** 等进阶功能。可于「系统管理」**申请会员**、**打开订阅方案**。

Q: 会员有何优点？
A: 界面会多出「再平衡」、进阶「仪表板」图表、市场绩效、股息热力图与历史数据分析等功能，让使用者更加了解自己投资结果。

Q: 数据储存与隐私？
A: 如同前述，**数据完全储存在您个人的本机装置上**，不涉及个资问题。为避免 App 解除安装、装置损坏或数据遗失，**强烈建议定期点选下方的「下载备份文件 (.json)」**自行保存 JSON 文件。

Q: 无法下载备份文件？
A: **iOS／Android App**：请点「下载备份文件 (.json)」后透过系统分享菜单储存至「文件」、iCloud 或其他云端。**网页版**若于 LINE 内开启，弹跳视窗可能被阻挡而无法下载，请改用 Safari 或 Chrome 操作。

Q: 为何股价无法更新？
A: 检查该只股票市场是否设定正确，若错误请在「交易记录」里选择「批量修改市场」进行更换。

Q: 股价与汇率为何与按「AI 联网更新股价 & 汇率」得到的现价不同？
A: 股价与汇率因抓取网页现值，故现值会延迟三至五分钟不等，请勿作为买卖参考，建议买卖仍以证券公司为主。本软件仅适合作统计资产功能，如紧急预备金、旅游基金、退休金、定存、股债券等统计参考，并无证券交易买卖功能；另外投资有赚有赔，请预留紧急预备金，感谢您的使用。

Q: 「仪表板」的 **已借／额度／使用率** 如何计算？
A: 仅在该信贷专户 **余额／欠款** 栏 > 0 时显示此卡片。**已借**＝该栏数字（资金记录累计之欠款本金）。**额度**＝账户设定的 **信贷额度**（与账户同币别）。**使用率**＝已借 ÷ 额度 × 100%（上限显示 100%）。未设定额度则不显示进度条。

Q: **预计下月利息** 如何计算？
A: **预计下月利息**＝目前欠款余额 × **年利率 (%)** ÷ 100 ÷ 12。例：欠款 200 万、年利率 2.2% → 2,000,000 × 2.2 ÷ 100 ÷ 12 ≈ **3,667** 元／月。此为单利、整月本金不变的**估算**，实际银行可能按日计息或月中还本而不同；@ 后数字为账户设定的年利率。

Q: 信贷与净投入、XIRR、净资产的关系？
A: **信贷拨入／还本**（负债户↔证券户转账）会计入**净投入**与**XIRR**（视为杠杆资金）；**信贷利息**不计入净投入。「仪表板」**总资产**为证券资产＋证券户现金；**负债合计**为各负债户欠款换算加总；**净资产**＝总资产 − 负债合计。**欠款余额归零后**，「仪表板」不显示信贷卡片、负债合计与借贷相关警示，但历史拨入／还本仍保留在净投入明细中供查账。曾有借贷时解读 XIRR 请留意杠杆影响。

Q: 「仪表板」的 **海外所得税务进度** 是什么？
A: 当**基准币为台币 (TWD)** 时，「仪表板」的 **详细统计数据** 区块会显示海外所得试算进度（非台湾市场之已实现损益与股利合计），并参考 100 万申报门槛与 670 万基本扣除额试算最低税负。**仅供报税规划参考**，未含保险给付等其他所得，不构成税务建议。

## 5. 重要免责声明

**投资风险警告**：
- ⚠️ 投资有风险，过往绩效不代表未来表现。
- 本应用程序仅提供资产统计与管理功能，不提供投资建议。
- 本应用程序不具备证券交易功能，无法进行实际买卖操作。
- 所有投资决策应由使用者自行判断，并承担相关风险。
- 使用者应自行评估投资风险，并在需要时咨询专业财务顾问。

**非投资建议声明**：
- 本应用程序提供的所有信息、分析、图表与 AI 建议仅供参考，不构成任何投资建议。
- 本应用程序不保证任何投资结果或报酬率。
- 使用者应根据自身情况做出投资决策，并对所有投资决策负责。

**数据准确性**：
- 本应用程序提供的股价、汇率等数据可能因网络延迟而与实际市场价格有所差异。
- 使用者不应将本应用程序的数据作为实际买卖的唯一参考依据。
- 建议以证券公司或金融机构提供的即时报价为准。`,
};
zhCN.batchImportModal = {
  title: '批次汇入交易 (Batch Import)',
  selectAccount: '1. 选择汇入账户',
  selectAccountPlaceholder: '-- 请选择账户 --',
  noAccountsWarning: '⚠️ 无法进行批次汇入',
  noAccountsMessage: '系统中没有任何账户，请先到「证券户」页面建立账户，然后再回来进行批次汇入。',
  tabPaste: '直接贴上文字 (Paste)',
  tabUpload: '上传 CSV 文件 (Upload)',
  pasteLabel: '请将 Excel 或表格数据复制贴于此 (支持格式: 日期 | 买/卖/股息/转移 | 代号 | 价格 | 数量 | 手续费 | 总金额)',
  pasteFormat: '💡 「转移」类别：若数量为负视为汇出持股，正则视为汇入持股。',
  pasteTip: '支持从券商对账单复制后直接解析。',
  pastePlaceholder:
    '2022/3/30\t买\tVT\t103.23\t1.00\t0.00\t103.23\n2025/2/11\t转移\tVT\t93.41\t-167.73\t0.00\t15667.99',
  parseButton: '解析贴上内容',
  uploadLabel: '支持 CSV 汇出档：嘉信 (Charles Schwab)、Firstrade',
  uploadSupported: '支持嘉信（Charles Schwab）与 Firstrade 的 CSV 格式。',
  noFileSelected: '未选择任何文件',
  selectFile: '选择文件',
  previewTitle: '预览汇入数据',
  previewSuccess: '成功',
  previewSelected: '已选',
  previewFailed: '未成功',
  previewSelectTransactions: '请选择要汇入的交易',
  selectAll: '全选',
  deselectAll: '取消全选',
  allSelected: '已全选',
  selectedCount: '已选择 {selected} / {total} 笔',
  tableDate: '日期',
  tableAction: '动作',
  tableMarket: '市场',
  tableSymbol: '代码',
  tableQty: '数量',
  tablePrice: '价格',
  tableFees: '费用',
  tableAmount: '金额',
  cancel: '取消',
  confirmImport: '确认汇入',
  confirmImportCount: '({count} 笔)',
  errorNoAccounts: '没有账户，无法汇入',
  errorNoAccountSelected: '请先选择账户',
  errorNoData: '无法汇入：没有数据。请贴上交易文字并解析，或上传 CSV 文件。',
  errorParseFirst: '⚠️ 请先点击「解析贴上内容」按钮，确认表格预览出现数据后，再按下确认汇入。',
  errorNoTransactionsSelected: '请至少选择一笔交易进行汇入',
  errorParseFailed: '无法解析数据。共 {count} 笔数据格式错误，请检查。',
  errorParseFailedCount: '共 {count} 笔格式错误',
  errorParseError: '解析发生错误：{error}。请检查数据格式。',
};
zhCN.historicalModal = {
  title: '历史股价校正 (Time Machine)',
  selectYearLabel: '选择年份',
  selectQuarterLabel: '季',
  yearOption: '{year} 年',
  noHistoryYears: '无历史资料',
  fillYearEndButton: '🤖 补齐 {year} Q{quarter} 缺漏资料',
  aiSearching: 'AI 搜寻中...',
  batchProgress: '⏳ 抓取中 {current}/{total}（{year} 年）',
  batchFetchAll: '🚀 一键抓取所有年度',
  forceRefresh: '强制重新抓取（覆盖已有数据）',
  yearEndDataTitle: '{year} 年底数据',
    periodDataTitle: '{year} Q{quarter} 数据',
  exchangeRateLabel: '汇率 (USD/TWD):',
  colMarket: '市场',
  colTicker: '代号',
  colClosePrice: '收盘价 ({date})',
    colClosePriceShort: '收盘价',
  noHoldingsThisYear: '该年份无持股',
  pricePlaceholder: '输入股价',
  hintTitle: '💡 说明：',
  hintBullet1:
    '第一颗按钮（「🤖 补齐 {year} Q{quarter} 缺漏资料」）：针对下拉菜单目前选定的年份与季度，抓取该季末股价／汇率；只补数值为 0 或未填的字段，已填数据不会被覆盖。',
  hintBullet2:
    '「🚀 一键抓取」：同时抓取年底（12/31）+ Q1～Q3 季末（3/31、6/30、9/30）股价，让累积损益图可按季显示真实数据。',
  hintBullet3: '勾选「强制重新抓取」可覆盖已有数据。',
  cancel: '取消',
  saveUpdateChart: '保存并更新图表',
  alertAllComplete: '所有年度抓取完成！共处理 {count} 个年度（含年底 + Q1~Q3 季末）。',
  alertNoUpdateNeeded:
    '所有持股与汇率皆已有数据，无须 AI 更新。\n若需强制重新抓取，请勾选「强制重新抓取」。',
  alertFetchFailed:
    '无法取得 {count} 只股票的历史股价，请检查网络连接或稍后再试。\n\n查询的代号：{tickers}',
  alertAiError: 'AI 更新失败，请稍后再试',
};

zhCN.subscription = {
  plan: '方案：',
  monthly: '月付',
  yearly: '年付',
  periodEndLabel: '有效期至：',
  lengthLabel: '方案周期：',
  lengthMonth: '1 个月',
  lengthYear: '12 个月',
  monthlyDesc: '按月付费，随时可取消',
  yearlyDesc: '年付更优惠',
  savePercent: '节省 2 个月费用',
  featureTitle: '会员包含的功能：',
  feature1: '进阶仪表板与资产配置图表',
  feature2: '资产再平衡功能',
  feature3: '市场绩效、股息热力图与历史数据分析',
  feature4: '会员专属功能持续更新',
  title: '申请 TradeView 会员',
  subtitle: '解锁所有功能，享受完整的投资组合管理体验',
  memberStatus: '您已是会员',
  inAppOnlyTitle: '会员申请功能仅在应用中可用',
  inAppOnlyDesc: '请下载 iOS 或 Android 应用以申请会员。',
  loading: '加载中...',
  recommended: '推荐',
  currentPlan: '当前方案',
  processing: '处理中...',
  perYear: '/年',
  perMonth: '/月',
  restorePurchases: '恢复购买',
  termsOfUse: '服务条款（EULA）',
  privacyPolicy: '隐私政策',
  purchaseSuccess: '会员申请成功！感谢您的支持。',
  purchaseFailedPrefix: '购买失败：',
  restoreSuccess: '已恢复会员！',
  restoreNotFound: '未找到可恢复的会员。',
  initFailed: '初始化失败',
  purchaseFailed: '购买失败',
  restoreFailed: '恢复失败',
  becomeMember: '申请会员',
};

zhCN.purchaseModal = {
  title: '选择会员方案',
  subtitle: '选择适合您的方案，开通完整会员功能',
  onlyAndroid: '此功能仅在 Android 应用中可用',
  loadProductsFailed: '加载产品失败',
  loginFirst: '请先登录',
  purchaseFailed: '购买失败',
  monthlyTitle: '月制会员',
  monthlyDesc: '按月计费，可随时取消',
  monthlyPrice: 'NT$ 60/月',
  yearlyTitle: '年制会员',
  yearlyDesc: '按年计费，更优惠',
  yearlyPrice: 'NT$ 590/年',
  loading: '加载中...',
  popular: '推荐',
  processing: '处理中...',
  purchaseNow: '立即购买',
  footer: '购买后将自动开通会员功能。订阅可随时在 Google Play 商店中取消。',
};

zhCN.batchCashFlowModal = {
  title: '批次汇入资金 (Batch Cash Flow)',
  guideTitle: '使用说明：',
  guideBody:
    '请直接从 Excel 复制包含「日期、台币、美元、汇率、手续费、总计、账户、类别」的数据并贴上。最后一栏为类别，倒数第二栏为账户。',
  guideNoteFx:
    '※ 第一列：纯台币入账—台币与总计填金额，美元与汇率栏留空。第二列：跨境 TWD→美金 时填汇率。第三列：美国境内美金入账（如 ACH）无需换汇，汇率栏留空。',
  columnHeaderExample: '日期 | 台币 | 美元 | 汇率 | 手续费 | 总计 | 账户 | 类别',
  pasteDemoRow1Account: '国泰',
  pastePlaceholderApprox: '（约 {approx}，按基准币与汇率）',
  parseFailed:
    '无法解析数据。\n成功: 0 笔\n失败: {count} 笔\n请确认格式是否为 Tab 分隔（直接从 Excel 复制）。',
  unmappedAccounts: '请先设置以下账户的对应关系：\n{accounts}',
  mappingTitle: '1. 账户名称对应 (Account Mapping)',
  mappingDesc: '请将「文件中的账户名称」对应到您「系统中的证券户」。',
  fileNameLabel: '文件名称:',
  selectAccount: '-- 请选择对应账户 --',
  previewTitle: '2. 数据预览',
  successLabel: '成功',
  failedLabel: '未成功',
  failedUnit: '笔',
  colDate: '日期',
  colType: '类别',
  colAmount: '金额 (USD/TWD)',
  colFee: '手续费',
  colTwdCost: '实际台币成本',
  colFileAccount: '文件账户',
  colMappedAccount: '对应系统账户',
  unmapped: '未对应',
  cancel: '取消',
  parseData: '解析数据',
  confirmImport: '确认汇入',
};

zhCN.appMessages = {
  alertTitleInfo: '提示',
  loginErrorTitle: '登录错误',
  loginSuccessTitle: '登录成功',
  loginFailedTitle: '登录失败',
  updateSuccessTitle: '更新成功',
  deleteSuccessTitle: '删除成功',
  restoreSuccessTitle: '还原成功',
  importFailedTitle: '导入失败',
  downloadErrorTitle: '下载错误',
  genericErrorTitle: '错误',
  enterEmail: '请输入 Email 信箱',
  adminWelcome: '欢迎回来，管理员！',
  adminPasswordWrong: '管理员密码错误',
  guestLoginNotice: '已为您登录「非会员模式」。\n\n您尚未注册，若需开通会员模式，请按「升级」发送申请信通知管理员开通权限。',
  contactSubject: 'TradeView Bug / 问题回报',
  contactBody: 'Hi 管理员,\n\n我的账号是：{user}\n\n我想回报以下问题或建议：\n\n（请在此描述 Bug、操作步骤或功能建议）\n\n谢谢。',
  updatePriceSuccess: '成功更新 {count} 笔股价',
  updatePriceSuccessWithRate: '成功更新 {count} 笔股价，并同步更新汇率为 {rate}',
  autoUpdateFailed: '自动更新失败',
  downloadFailed: '下载失败：请尝试使用浏览器打开此页面。',
  shareTitle: 'TradeView 备份文件',
  backupFailed: '备份失败：{error}',
  restoreSuccess: '成功还原数据！',
  importFailed: '导入失败：文件格式错误。',
  txUpdated: '交易记录已更新',
  marketUpdated: '成功更新 {count} 笔交易的市场设置',
  txDeleted: '交易记录已删除',
  txCleared: '✅ 成功清空 {count} 笔交易记录！',
  accountUpdated: '账户「{name}」已更新',
  accountDeleted: '账户「{name}」已删除',
  cashFlowUpdated: '资金记录已更新',
  cashFlowDeleted: '现金流记录已删除',
  cashFlowCleared: '✅ 成功清空 {count} 笔筛选资金记录！',
  historicalSaved: '历史资产数据更新完成！报表已根据真实股价修正。',
  loginPasswordPlaceholder: '请输入密码',
  confirmClearTxTitle: '确认清空筛选交易？',
  confirmClearTxMessage: '将删除 {count} 笔筛选范围内的交易记录，此操作无法恢复，请确认您已备份数据。',
  confirmClearAction: '确认清空',
  deleteTxTitle: '删除交易',
  deleteTxMessage: '确定要删除这笔交易记录吗？',
  cashFlowDeleteTitle: '确认删除资金记录',
  unknownAccount: '未知账户',
  accountLabel: '账户：',
  dateLabel: '日期：',
  typeLabel: '类型：',
  amountLabel: '金额：',
  cashFlowDeleteWarningTitle: '⚠️ 注意',
  cashFlowDeleteWarningBody: '此账户有 {count} 笔相关交易记录。删除此资金记录可能会影响账户余额计算的准确性。',
  cashFlowDeleteMessage: '确定要删除这笔资金记录吗？此操作无法恢复。',
  confirmDeleteAction: '确认删除',
};

zhCN.transactionForm = {
  ...zhTW.transactionForm,
  account: '交易账户',
  ticker: '代码 (Ticker)',
  tickerPlaceholder: '例如：2330、AAPL 或 DTLA',
  category: '类别',
  quantity: '数量 (股)',
  quantityFixed: '数量 (固定为 1)',
  note: '备注',
  saveTransaction: '保存交易',
  confirmTitle: '确认交易信息',
  confirmMessage: '请仔细确认以下信息是否正确：',
  accountLabel: '交易账户：',
  tickerLabel: '代码：',
  typeLabel: '类型：',
  quantityLabel: '数量：',
  noteLabel: '备注：',
  totalAmount: '总金额：',
  cashDividendQuantityConfirm: '1 笔',
  confirmSave: '确认保存',
  previewTitle: '计算金额预览：',
  calculationMethod: '计算方式：',
  deductionShort: '扣款',
  typeBuy: '买入 (Buy)',
  typeSell: '卖出 (Sell)',
  typeTransferIn: '汇入持股 (Transfer In)',
  typeTransferOut: '汇出持股 (Transfer Out)',
  transferInSectionTitle: '汇入持股信息',
  targetAccount: '汇入持股目标账户',
  targetAccountPlaceholder: '请选择汇入持股的账户…',
  errorNoAccount: '请先建立并选择证券账户',
  errorNoTargetAccount: '请选择汇入持股目标账户',
  errorSameTransferAccount: '来源账户与目标账户不可相同',
  errorInsufficientTransferOutQuantity: '汇出股数超过目前可用持股',
  transferInConfirmHint: '将同步建立汇入持股',
};

zhCN.fundForm = {
  ...zhTW.fundForm,
  addFundRecord: '新增资金记录',
  editFundRecord: '编辑资金记录',
  type: '类型',
  account: '账户',
  sourceAccount: '来源账户',
  amount: '金额',
  targetAccount: '转入目标账户',
  selectAccount: '选择账户...',
  exchangeRate: '汇率',
  exchangeRateUSD: '汇率 (TWD/USD)',
  exchangeRateJPY: '汇率 (TWD/JPY)',
  exchangeRateUsdTwd: '汇率 (USD/TWD)',
  exchangeRateUsdJpy: '汇率 (USD/JPY)',
  exchangeRatePair: '汇率 ({quote}/{base})',
  exchangeRateUsdBase: '汇率 (USD/{base})',
  exchangeRateInvalid: '无法换算汇率，请确认基准币与各币别对台币汇率设定是否完整。',
  crossCurrencyTransfer: '不同币别转账',
  sameCurrencyTransfer: '同币别转账 (汇率 1.0)',
  feesNote: '汇费/转账费',
  note: '备注',
  updateRecord: '更新记录',
  typeDeposit: '汇入资金 (Import/Salary)',
  typeWithdraw: '汇出资金 (Export/Living)',
  typeTransfer: '内部转账 (Transfer)',
  confirmTitle: '确认资金记录',
  confirmMessage: '请仔细确认以下信息是否正确：',
  typeLabel: '类型：',
  accountLabel: '账户：',
  targetAccountLabel: '目标账户：',
  amountLabel: '金额：',
  exchangeRateLabel: '汇率：',
  noteLabel: '备注：',
  totalTWD: '总金额 ({currency})：',
  confirmSave: '确认保存',
  errorNoAccount: '请先建立账户',
  recurringKindDeposit: '定期汇入（主动资产）',
  recurringKindDebtAlert: '负债缴款提醒',
  transferDebtDisbursementHint: '信贷拨款：从负债专户转入证券户，将计入净投入。',
  transferDebtRepaymentHint: '信贷还本：从证券户转回负债专户。',
  recurringSectionTitle: '定期规程与负债警示',
  recurringRulesTitle: '定期规程',
  debtAlertSettingsTitle: '负债警示设定',
  toggleShowRecurring: '显示定期规程',
  toggleHideRecurring: '隐藏定期规程',
  toggleShowDebtAlert: '显示负债警示',
  toggleHideDebtAlert: '隐藏负债警示',
  minSafetySpread: '利差安全边际 (%)',
  minSafetySpreadHelp:
    '当负债专户**尚有欠款**且对应证券户之报酬率，扣除借贷年利率后低于此门槛时，于仪表板与本页显示利差偏低提示（仅供参考，非投资建议）。欠款余额为 0 时不显示。负债缴款提醒请以「新增规则」建立。',
  recurringDayShort: '每月 {day} 日 · {account} · {amount} {ccy}',
  recurringDisclaimer:
    '仅在打开本应用时检查并入账；若长期未开启，下次开启会尝试补上应入账的月份。不含后台排程。',
  recurringDayOfMonth: '每月几号',
  recurringStartMonth: '起始月份（选填）',
  recurringStartMonthHint: '留空则从规则创建当月起算',
  recurringAddRule: '新增规则',
  recurringEditRule: '编辑规则',
  recurringSaveRule: '保存规则',
  recurringDeleteRule: '删除规则',
  recurringEnabled: '启用',
  recurringLastApplied: '上次已套用：{period}',
  recurringNoRules: '尚未设定定期汇入',
  recurringDeleteConfirm: '确定删除此规则？（已产生的入金记录不会删除）',
  recurringInvalidAmount: '请选择账户并输入有效金额',
  recurringAmountTwdOptional: '实际新台币入账金额（选填）',
  recurringAmountTwdHelp:
    '外币账户：程序会用「金额 × 汇率 + 手续费」估算成本；若与银行对账单上的数额不同，请填对账单金额以覆盖换算。留空则完全依汇率计算。',
  recurringNoteBadge: '定期',
};

export { zhCN };
