// 交易策略分析提示词

import type { KlineData, DepthData } from '../types';

/**
 * 格式化K线数据为易读的文本
 */
export function formatKlineData(data: KlineData[], limit: number = 20): string {
  if (!data || data.length === 0) return '无数据';
  
  // 取最近的数据
  const recentData = data.slice(-limit);
  
  return recentData.map((kline, index) => {
    const time = new Date(kline.t).toLocaleString('zh-CN', { 
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const priceChange = kline.c - kline.o;
    const priceChangePercent = ((priceChange / kline.o) * 100).toFixed(2);
    const direction = priceChange > 0 ? '↑' : priceChange < 0 ? '↓' : '→';
    
    return `${index + 1}. [${time}] 开:${kline.o.toFixed(2)} 高:${kline.h.toFixed(2)} 低:${kline.l.toFixed(2)} 收:${kline.c.toFixed(2)} ${direction}${priceChangePercent}% 量:${kline.v}`;
  }).join('\n');
}

/**
 * 格式化盘口深度数据
 */
export function formatDepthData(depth: DepthData | null): string {
  if (!depth) return '无深度数据';
  
  const lines: string[] = [];
  
  // 基本信息
  if (depth.last_price) lines.push(`最新价: ${depth.last_price}`);
  if (depth.open) lines.push(`开盘价: ${depth.open}`);
  if (depth.highest) lines.push(`最高价: ${depth.highest}`);
  if (depth.lowest) lines.push(`最低价: ${depth.lowest}`);
  if (depth.volume) lines.push(`成交量: ${depth.volume}`);
  if (depth.amount) lines.push(`成交额: ${depth.amount}`);
  if (depth.change_percent) lines.push(`涨跌幅: ${depth.change_percent}%`);
  
  // 盘口数据
  lines.push('\n卖盘（卖5-卖1）:');
  for (let i = Math.min(4, depth.ask_price.length - 1); i >= 0; i--) {
    lines.push(`  卖${i + 1}: ${depth.ask_price[i]} × ${depth.ask_volume[i]}`);
  }
  
  lines.push('\n买盘（买1-买5）:');
  for (let i = 0; i < Math.min(5, depth.bid_price.length); i++) {
    lines.push(`  买${i + 1}: ${depth.bid_price[i]} × ${depth.bid_volume[i]}`);
  }
  
  return lines.join('\n');
}

/**
 * 生成系统提示词
 */
export function getSystemPrompt(): string {
  return `你是一位专业的贵金属交易策略分析师，专注于伦敦现货白银和国内白银期货的套利和交易策略分析。

你的任务是基于以下数据进行深度分析并给出交易建议：
- 伦敦现货白银的1分钟、15分钟和90日K线数据
- 国内白银主力合约的1分钟、15分钟和90日K线数据
- 国内白银的实时盘口深度数据
- 最新的市场价格信息

请从以下角度进行综合分析：
1. **技术面分析**：K线形态、均线趋势、支撑阻力位、成交量变化
2. **短期和长期趋势**：结合1分钟、15分钟和日线数据判断多周期趋势
3. **市场情绪**：盘口买卖力量对比、成交活跃度
4. **价格预测**：基于当前数据预测未来15分钟的价格走势

你必须以JSON格式返回分析结果，包含以下字段：
{
  "tradingAdvice": {
    "action": "买多" | "卖空" | "观望",
    "confidence": 0-100的整数（表示信心度百分比）,
    "riskLevel": "高" | "中" | "低",
    "entryPrice": 数字（建议入场价格）,
    "stopLoss": 数字（止损价格）,
    "takeProfit": 数字（止盈价格）,
    "lots": 整数（建议手数，1-5手）,
    "londonPricePrediction15min": 数字（预测15分钟后伦敦白银价格，美元）,
    "pricePrediction15min": 数字（预测15分钟后国内白银价格，人民币）
  },
  "analysisReason": "字符串（详细说明交易建议的理由，包括技术面、趋势、盘口等分析）",
  "nextSteps": "字符串（后续操作思路和需要关注的关键价位）"
}

注意事项：
- 建议入场价应该基于当前最新价格，合理的入场点位
- 止损价格应该控制在入场价的1-3%范围内
- 止盈价格应该至少是止损幅度的2倍（风险收益比至少1:2）
- 信心度应该基于多个技术指标的一致性来判断
- 只返回JSON，不要包含其他文字说明`;
}

/**
 * 生成市场数据消息
 */
export function generateMarketDataMessages(
  londonKline1m: KlineData[],
  londonKline15m: KlineData[],
  londonKlineDaily: KlineData[],
  domesticKline1m: KlineData[],
  domesticKline15m: KlineData[],
  domesticKlineDaily: KlineData[],
  domesticDepth: DepthData | null
): Array<{ role: 'user'; content: string }> {
  const messages = [];

  // 消息1：伦敦白银1分钟K线
  messages.push({
    role: 'user' as const,
    content: `【伦敦现货白银 1分钟K线】（最近20根）\n${formatKlineData(londonKline1m, 20)}`
  });

  // 消息2：伦敦白银15分钟K线
  messages.push({
    role: 'user' as const,
    content: `【伦敦现货白银 15分钟K线】（最近20根）\n${formatKlineData(londonKline15m, 20)}`
  });

  // 消息3：伦敦白银90日K线
  messages.push({
    role: 'user' as const,
    content: `【伦敦现货白银 日线】（最近90天）\n${formatKlineData(londonKlineDaily, 90)}`
  });

  // 消息4：国内白银1分钟K线
  messages.push({
    role: 'user' as const,
    content: `【国内白银主力 1分钟K线】（最近20根）\n${formatKlineData(domesticKline1m, 20)}`
  });

  // 消息5：国内白银15分钟K线
  messages.push({
    role: 'user' as const,
    content: `【国内白银主力 15分钟K线】（最近20根）\n${formatKlineData(domesticKline15m, 20)}`
  });

  // 消息6：国内白银90日K线
  messages.push({
    role: 'user' as const,
    content: `【国内白银主力 日线】（最近90天）\n${formatKlineData(domesticKlineDaily, 90)}`
  });

  // 消息7：国内白银盘口深度
  messages.push({
    role: 'user' as const,
    content: `【国内白银主力 实时盘口】\n${formatDepthData(domesticDepth)}`
  });

  // 消息8：请求分析
  messages.push({
    role: 'user' as const,
    content: `请基于以上所有数据，进行综合分析并给出交易策略建议。请严格按照JSON格式返回结果。`
  });

  return messages;
}

/**
 * 生成完整的请求负载
 */
export interface StrategyAnalysisRequest {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user'; content: string }>;
}

export function createStrategyAnalysisRequest(
  model: string,
  londonKline1m: KlineData[],
  londonKline15m: KlineData[],
  londonKlineDaily: KlineData[],
  domesticKline1m: KlineData[],
  domesticKline15m: KlineData[],
  domesticKlineDaily: KlineData[],
  domesticDepth: DepthData | null
): StrategyAnalysisRequest {
  return {
    model,
    systemPrompt: getSystemPrompt(),
    messages: generateMarketDataMessages(
      londonKline1m,
      londonKline15m,
      londonKlineDaily,
      domesticKline1m,
      domesticKline15m,
      domesticKlineDaily,
      domesticDepth
    )
  };
}

