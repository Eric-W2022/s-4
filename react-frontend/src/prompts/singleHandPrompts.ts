/**
 * 单手交易策略提示词
 * 用于AI分析单手交易决策
 */

import type { KlineData, DepthData, SingleHandPosition, SingleHandOperation } from '../types';

export interface BollingerBands {
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

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
  domesticBollinger1m?: BollingerBands;  // 国内1分钟布林带
  domesticBollinger15m?: BollingerBands;  // 国内15分钟布林带
}

/**
 * 构建单手交易策略提示词消息数组
 */
export function buildSingleHandMessages(params: SingleHandPromptParams): Array<{role: string, content: string}> {
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
    domesticBollinger1m,
    domesticBollinger15m,
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

  // 格式化布林带数据
  const formatBollinger = (bollinger?: BollingerBands, label: string = '') => {
    if (!bollinger || bollinger.upper === null || bollinger.middle === null || bollinger.lower === null) {
      return `${label}布林带：数据不可用`;
    }
    return `${label}布林带：上轨${bollinger.upper.toFixed(0)} | 中轨${bollinger.middle.toFixed(0)} | 下轨${bollinger.lower.toFixed(0)}`;
  };

  // 每个数据项都是一个独立的user message
  const messages = [
    {
      role: 'user',
      content: `当前价格\n国内白银主力当前价: ${currentPrice.toFixed(0)}`
    },
    {
      role: 'user',
      content: `伦敦现货白银 (1分钟K线，最近100根)\n${formatKlineData(londonKline1m, 100)}`
    },
    {
      role: 'user',
      content: `伦敦现货白银 (15分钟K线，最近50根)\n${formatKlineData(londonKline15m, 50)}`
    },
    {
      role: 'user',
      content: `伦敦现货白银 (日线，最近50根)\n${formatKlineDataDaily(londonKline1d, 50)}`
    },
    {
      role: 'user',
      content: `国内白银主力 (1分钟K线，最近100根)\n${formatKlineData(domesticKline1m, 100)}`
    },
    {
      role: 'user',
      content: `国内白银主力 (15分钟K线，最近50根)\n${formatKlineData(domesticKline15m, 50)}`
    },
    {
      role: 'user',
      content: `国内白银主力 (日线，最近50根)\n${formatKlineDataDaily(domesticKline1d, 50)}`
    },
    {
      role: 'user',
      content: `国内白银盘口\n${formatDepthData(domesticDepth)}`
    },
    {
      role: 'user',
      content: `技术指标\n${formatBollinger(domesticBollinger1m, '1分钟')}\n${formatBollinger(domesticBollinger15m, '15分钟')}`
    },
    {
      role: 'user',
      content: `当前持仓状态\n${formatPosition(currentPosition)}`
    },
    {
      role: 'user',
      content: `最近10条操作记录\n${formatOperations(recentOperations)}`
    }
  ];

  // 最后一个user message：分析要求
  const analysisMessage = {
    role: 'user',
    content: `分析要求

请基于以上市场数据和持仓状态，给出你的交易决策。

分析维度

1. **图形技术分析**（15分钟短线）：
   - K线形态：头肩顶/底、双顶/底、三角形、楔形、吞没、锤子线等经典形态
   - 均线系统：MA5、MA10、MA20的排列和交叉情况（金叉/死叉）
   - 布林带：价格与布林带上中下轨的位置关系
     * 价格触及上轨：超买，可能回调
     * 价格触及下轨：超卖，可能反弹
     * 价格在中轨附近：震荡，等待方向
     * 布林带收窄：酝酿突破
     * 布林带扩张：趋势加速
   - 趋势判断：上升趋势、下降趋势、横盘震荡
   - 支撑阻力：关键价格支撑位和阻力位（结合K线、布林带、整数关口）
   - 成交量：放量突破、缩量整理、量价配合情况

2. **多周期共振**：
   - 日线趋势：大周期方向判断
   - 15分钟趋势：中周期方向
   - 1分钟趋势：入场时机把握
   - 伦敦与国内：内外盘联动性分析

3. **盘口分析**：
   - 买卖盘力量对比（买一买二 vs 卖一卖二）
   - 大单压力：是否有明显的大单挂单
   - 成交活跃度：盘口流动性判断

4. **持仓评估**（如有持仓）：
   - 当前盈亏：是否达到止盈/止损条件
   - 持仓时长：是否超过合理持仓时间
   - 市场变化：开仓后市场是否按预期发展
   - 及时决策：盈利时及时止盈，亏损时果断止损

5. **历史操作反思**：
   - 分析最近操作的成功率
   - 总结失败操作的原因
   - 避免重复犯错
   - 强化成功策略

策略偏好（短线15分钟内）

**开仓策略**：
- ✓ 趋势明确时顺势开仓（多周期K线方向一致）
- ✓ 多周期共振（日线、15分钟、1分钟方向一致）
- ✓ 布林带突破：价格突破上轨做多，跌破下轨做空
- ✓ 布林带反转：价格触及下轨反弹做多，触及上轨回调做空
- ✓ 关键位置突破：整数关口、前高前低突破时跟进
- ✓ K线形态确认：吞没、锤子线等反转形态
- ✗ 趋势不明时观望（价格在布林中轨附近反复）
- ✗ 布林带极端位置谨慎追高杀低

**平仓策略**（优先级从高到低）：
1. **止盈**：盈利达到10-20点时，果断止盈（15分钟短线目标）
2. **止损**：亏损达到5-10点时，立即止损（控制风险）
3. **时间止损**：持仓超过10分钟未盈利，考虑离场
4. **趋势反转**：K线形态反转时，及时平仓
5. **盘口变化**：买卖力量明显逆转时平仓

**持有策略**：
- 盈利中且趋势未改变：继续持有
- 盈利较小但趋势强劲：持有等待
- 时间<5分钟且未触及止损：观察持有

风险控制

- 单次亏损控制在10点以内（150元）
- 单次盈利目标10-20点（150-300元）
- 扣除手续费16元后仍有利润
- 避免频繁交易（手续费成本）
- 宁可少赚不要亏损

输出格式

请严格按照以下JSON格式输出（不要包含markdown代码块标记）:

{
  "action": "开多/开空/平仓/持有/观望",
  "reason": "详细的决策理由，包括：1)图形形态分析 2)趋势判断 3)支撑阻力位 4)盘口情况 5)持仓评估(如有) 6)操作依据",
  "confidence": 85,
  "targetPrice": 8650
}

字段说明：
- action: 必须是"开多"、"开空"、"平仓"、"持有"或"观望"之一
- reason: 详细说明分析逻辑（150字以内，重点突出）
- confidence: 信心度（0-100），基于技术指标一致性
- targetPrice: 目标价格（开仓时必填，平仓、持有和观望时可不填）

约束条件：
1. 如果当前有持仓，不能再开新仓，只能选择"平仓"或"持有"
2. 如果当前无持仓，不能选择"平仓"或"持有"，只能选择"开多"、"开空"或"观望"
3. 开仓时confidence必须≥60%，否则选择"观望"
4. 考虑短线交易特点（15分钟内），及时止盈止损
5. 参考历史操作记录，避免重复失误，提高成功率`
  };

  // 返回所有消息（10个数据message + 1个分析要求message）
  return [...messages, analysisMessage];
}

