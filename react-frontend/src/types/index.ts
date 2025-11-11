// 数据类型定义

/**
 * K线数据
 */
export interface KlineData {
  t: number;  // 时间戳（毫秒）
  o: number;  // 开盘价
  c: number;  // 收盘价
  h: number;  // 最高价
  l: number;  // 最低价
  v: number;  // 成交量
  tu?: number; // 成交额（可选）
}

/**
 * 实时成交数据
 */
export interface TradeTickData {
  code: string;        // 产品代码
  price: string | number;  // 价格
  volume?: string | number; // 成交量
  tick_time?: string | number; // 时间戳
}

/**
 * 盘口深度数据
 */
export interface DepthData {
  code: string;
  bid_price: string[];   // 买价列表
  bid_volume: string[];  // 买量列表
  ask_price: string[];   // 卖价列表
  ask_volume: string[];  // 卖量列表
  last_price?: string;   // 最新价
  volume?: string;       // 成交量
  amount?: string;       // 成交额
  open_interest?: string; // 持仓量
  highest?: string;      // 最高价
  lowest?: string;       // 最低价
  open?: string;         // 开盘价
  close?: string;        // 收盘价
  average?: string;      // 均价
  settlement?: string;   // 结算价
  pre_settlement?: string; // 昨结算
  pre_close?: string;    // 昨收盘
  pre_open_interest?: string; // 昨持仓
  upper_limit?: string;  // 涨停价
  lower_limit?: string;  // 跌停价
  change?: string;       // 涨跌
  change_percent?: string; // 涨跌幅
  instrument_name?: string; // 合约名称
  price_tick?: string;   // 价格变动单位
  volume_multiple?: string; // 合约乘数
  datetime?: string;     // 行情时间
}

/**
 * 连接状态
 */
export type ConnectionStatus = 'connected' | 'connecting' | 'error' | 'closed';

/**
 * 市场类型
 */
export type MarketType = 'london' | 'domestic';

/**
 * 模型类型
 */
export type ModelType = 
  | 'doubao-seed-1-6-thinking-250715'
  | 'deepseek-chat'
  | 'qwen3-max'
  | 'glm-4.6'
  | 'MiniMax-M2'
  | 'kimi-k2-turbo-preview'
  | 'ernie-x1.1-preview'
  | 'gpt-5'
  | 'claude-sonnet-4-5'
  | 'google-ai-studio/gemini-2.5-pro'
  | 'grok/grok-4';

/**
 * 策略分析结果
 */
export interface StrategyAnalysis {
  tradingAdvice: {
    action: '买多' | '卖空' | '观望';
    confidence: number;
    riskLevel: '高' | '中' | '低';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    lots: number;
    londonPricePrediction15min: number;
    pricePrediction15min: number;
  };
  analysisReason: string;
  chartAnalysis?: {
    pastChart: string;      // 过去图形分析
    currentChart: string;   // 当前图形分析
    futureChart: string;    // 未来图形预测
  };
  timestamp?: number;
  model?: string;
  // 盈亏跟踪
  profitLoss?: {
    actualPrice15min?: number;    // 15分钟后的实际价格
    profitLossPoints?: number;    // 盈亏点数
    profitLossPercent?: number;   // 盈亏百分比
    isWin?: boolean;              // 是否盈利
    status: 'pending' | 'checking' | 'completed';  // 状态
    // 止盈相关
    takeProfitReached?: boolean;  // 是否触达止盈价
    takeProfitPrice?: number;     // 触达止盈时的价格
    takeProfitTime?: number;      // 触达止盈的时间戳
    takeProfitMinutes?: number;   // 多少分钟触达止盈
    // 止损相关
    stopLossReached?: boolean;    // 是否触达止损价
    stopLossPrice?: number;       // 触达止损时的价格
    stopLossTime?: number;        // 触达止损的时间戳
    stopLossMinutes?: number;     // 多少分钟触达止损
  };
}

/**
 * 单手交易操作记录
 */
export interface SingleHandOperation {
  id: string;
  timestamp: number;
  action: '开多' | '开空' | '平仓' | '持有' | '观望';
  price: number;
  reason: string;
  profitLossPoints?: number;  // 平仓时的盈亏点数
  profitLossMoney?: number;   // 平仓时的盈亏金额（元）
  commission?: number;        // 手续费（元），开仓和平仓时各8元
  netProfit?: number;         // 净利润（元），平仓时的盈亏金额减去手续费
  duration?: number;          // 持仓时长（分钟），持有操作时记录
  model?: string;             // 使用的AI模型
}

/**
 * 单手交易当前持仓
 */
export interface SingleHandPosition {
  hasPosition: boolean;       // 是否有持仓
  direction?: '多' | '空';    // 持仓方向
  entryPrice?: number;        // 入场价格
  entryTime?: number;         // 入场时间
  currentPrice?: number;      // 当前价格
  profitLossPoints?: number;  // 当前盈亏点数
  profitLossMoney?: number;   // 当前盈亏金额（元）
  maxPrice?: number;          // 持仓期间的最高价（多单用）
  minPrice?: number;          // 持仓期间的最低价（空单用）
  maxProfitPoints?: number;   // 最高盈利点数
  maxProfitMoney?: number;    // 最高盈利金额（元）
  drawdownPercent?: number;   // 回撤百分比（从最高点回撤的比例）
}

/**
 * 单手交易决策
 */
export interface SingleHandDecision {
  action: '开多' | '开空' | '平仓' | '持有' | '观望';
  reason: string;
  confidence: number;
  targetPrice?: number;       // 目标价格（开仓时）
  timestamp: number;
  model: string;
}

