/**
 * 单手交易策略提示词
 * 用于AI分析单手交易决策
 */

import type { KlineData, DepthData, SingleHandPosition, SingleHandOperation } from '../types';

export interface SingleHandPromptParams {
  londonKline1m: KlineData[];
  londonKline15m: KlineData[];
  londonKline1d: KlineData[];
  domesticKline1m: KlineData[];
  domesticKline15m: KlineData[];
  domesticKline1d: KlineData[];
  domesticDepth: DepthData | null;
  currentPosition: SingleHandPosition;
  recentOperations: SingleHandOperation[];  // 最近10条操作记录
  currentPrice: number;  // 当前价格
}

/**
 * 构建单手交易策略提示词
 */
export function buildSingleHandPrompt(params: SingleHandPromptParams): string {
  const {
    londonKline1m,
    londonKline15m,
    londonKline1d,
    domesticKline1m,
    domesticKline15m,
    domesticKline1d,
    domesticDepth,
    currentPosition,
    recentOperations,
    currentPrice,
  } = params;

  // 格式化K线数据（分钟级别）
  const formatKlineData = (klines: KlineData[], count: number = 20) => {
    return klines.slice(-count).map(k => {
      const time = new Date(k.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return `${time}: 开${k.o.toFixed(2)}/高${k.h.toFixed(2)}/低${k.l.toFixed(2)}/收${k.c.toFixed(2)}`;
    }).join('\n');
  };

  // 格式化K线数据（日线级别）
  const formatKlineDataDaily = (klines: KlineData[], count: number = 50) => {
    return klines.slice(-count).map(k => {
      const date = new Date(k.t).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      return `${date}: 开${k.o.toFixed(2)}/高${k.h.toFixed(2)}/低${k.l.toFixed(2)}/收${k.c.toFixed(2)}`;
    }).join('\n');
  };

  // 格式化盘口数据
  const formatDepthData = (depth: DepthData | null) => {
    if (!depth) return '盘口数据不可用';
    
    const asks = depth.ask_price.slice(0, 5).map((price, idx) => 
      `卖${5-idx}: ${price} (${depth.ask_volume[idx]})`
    ).reverse().join('\n');
    
    const bids = depth.bid_price.slice(0, 5).map((price, idx) => 
      `买${idx+1}: ${price} (${depth.bid_volume[idx]})`
    ).join('\n');
    
    return `${asks}\n当前价: ${depth.last_price}\n${bids}`;
  };

  // 格式化当前持仓
  const formatPosition = (position: SingleHandPosition) => {
    if (!position.hasPosition) {
      return '当前无持仓，可以开仓';
    }
    
    const duration = position.entryTime 
      ? Math.round((Date.now() - position.entryTime) / 60000) 
      : 0;
    
    return `当前持仓: ${position.direction}单
入场价: ${position.entryPrice?.toFixed(0)}
入场时间: ${position.entryTime ? new Date(position.entryTime).toLocaleTimeString('zh-CN') : '未知'}
持仓时长: ${duration}分钟
当前价格: ${position.currentPrice?.toFixed(0)}
盈亏点数: ${position.profitLossPoints?.toFixed(0)}点
盈亏金额: ${position.profitLossMoney?.toFixed(0)}元 (每点15元)`;
  };

  // 格式化操作历史
  const formatOperations = (operations: SingleHandOperation[]) => {
    if (operations.length === 0) {
      return '暂无历史操作记录';
    }
    
    return operations.map((op, idx) => {
      const time = new Date(op.timestamp).toLocaleTimeString('zh-CN');
      const profitInfo = op.profitLossPoints !== undefined 
        ? ` | 盈亏: ${op.profitLossPoints.toFixed(0)}点 (${op.profitLossMoney?.toFixed(0)}元)`
        : '';
      return `${idx+1}. [${time}] ${op.action} @ ${op.price.toFixed(0)}${profitInfo}\n   原因: ${op.reason}`;
    }).join('\n\n');
  };

  const prompt = `# 单手交易策略分析

你是一位经验丰富的白银期货短线交易专家，负责管理一手白银期货的交易决策。

## 交易规则
1. **只能控制一手**: 同时最多持有1手白银期货
2. **可操作类型**: 开多、开空、平仓、持有
3. **盈亏计算**: 每个点价值15元人民币
4. **交易目标**: 短线交易，追求稳健收益，控制风险

## 当前市场数据

### 当前价格
国内白银主力当前价: ${currentPrice.toFixed(0)}

### 伦敦现货白银 (1分钟K线，最近100根)
${formatKlineData(londonKline1m, 100)}

### 伦敦现货白银 (15分钟K线，最近50根)
${formatKlineData(londonKline15m, 50)}

### 伦敦现货白银 (日线，最近50根)
${formatKlineDataDaily(londonKline1d, 50)}

### 国内白银主力 (1分钟K线，最近100根)
${formatKlineData(domesticKline1m, 100)}

### 国内白银主力 (15分钟K线，最近50根)
${formatKlineData(domesticKline15m, 50)}

### 国内白银主力 (日线，最近50根)
${formatKlineDataDaily(domesticKline1d, 50)}

### 国内白银盘口
${formatDepthData(domesticDepth)}

## 当前持仓状态
${formatPosition(currentPosition)}

## 最近10条操作记录
${formatOperations(recentOperations)}

## 分析要求

请基于以上市场数据和持仓状态，给出你的交易决策：

1. **决策分析**: 
   - 分析当前市场趋势（上涨/下跌/震荡）
   - 分析关键价格支撑位和阻力位
   - 如果有持仓，评估当前盈亏和持仓合理性
   - 参考历史操作记录，避免重复失误

2. **操作建议**:
   - 如果无持仓: 考虑是否开多、开空或继续观望
   - 如果有持仓: 考虑是否平仓止盈/止损，或继续持有
   - 给出具体的操作理由

3. **风险控制**:
   - 评估当前市场风险
   - 如果建议开仓，说明预期目标价位
   - 如果建议持有，说明继续持有的条件

## 输出格式

请严格按照以下JSON格式输出（不要包含markdown代码块标记）:

{
  "action": "开多/开空/平仓/持有",
  "reason": "详细的决策理由，包括技术分析和风险评估",
  "confidence": 85,
  "targetPrice": 8650
}

说明：
- action: 必须是"开多"、"开空"、"平仓"或"持有"之一
- reason: 详细说明你的分析逻辑和决策依据
- confidence: 信心度（0-100），表示对这个决策的把握程度
- targetPrice: 目标价格（仅在开仓时需要，平仓和持有时可不填）

注意：
1. 如果当前有持仓，不能再开新仓，只能选择"平仓"或"持有"
2. 如果当前无持仓，不能选择"平仓"，只能选择"开多"、"开空"或"持有"
3. 考虑短线交易特点，及时止盈止损
4. 参考历史操作记录，总结经验教训
`;

  return prompt;
}

