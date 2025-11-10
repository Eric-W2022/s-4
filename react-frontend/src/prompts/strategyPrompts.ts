// 交易策略分析提示词

import type { KlineData, DepthData, StrategyAnalysis } from '../types';

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
 * 格式化历史预测和盈亏数据
 */
export function formatHistoricalStrategies(strategies: StrategyAnalysis[]): string {
  if (!strategies || strategies.length === 0) return '暂无历史策略数据';
  
  const now = Date.now();
  const fifteenMinutes = 15 * 60 * 1000;
  
  // 过滤出15分钟内的策略
  const recentStrategies = strategies.filter(s => {
    const age = now - (s.timestamp || 0);
    return age <= fifteenMinutes && s.tradingAdvice && !((s as any).error);
  });
  
  if (recentStrategies.length === 0) return '最近15分钟内暂无策略数据';
  
  const lines: string[] = [];
  lines.push(`最近15分钟内的 ${recentStrategies.length} 条策略预测与实际结果：\n`);
  
  recentStrategies.forEach((strategy, index) => {
    const timeAgo = Math.round((now - (strategy.timestamp || 0)) / 60000);
    const time = new Date(strategy.timestamp || 0).toLocaleString('zh-CN', { 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const advice = strategy.tradingAdvice;
    const profitLoss = strategy.profitLoss;
    
    lines.push(`${index + 1}. [${time}] (${timeAgo}分钟前)`);
    lines.push(`   操作: ${advice.action} | 手数: ${advice.lots}手 | 信心度: ${advice.confidence}%`);
    lines.push(`   入场价: ${advice.entryPrice.toFixed(0)} | 止损: ${advice.stopLoss.toFixed(0)} | 止盈: ${advice.takeProfit.toFixed(0)}`);
    lines.push(`   预测15分钟后国内价格: ${advice.pricePrediction15min.toFixed(0)} | 伦敦: ${advice.londonPricePrediction15min.toFixed(2)}`);
    
    // 盈亏情况
    if (profitLoss && profitLoss.profitLossPoints !== undefined) {
      const status = profitLoss.status === 'completed' ? '已完成' : '进行中';
      const result = profitLoss.isWin ? '✓盈利' : profitLoss.isWin === false ? '✗亏损' : '持平';
      const points = profitLoss.profitLossPoints > 0 ? `+${profitLoss.profitLossPoints.toFixed(0)}` : profitLoss.profitLossPoints.toFixed(0);
      
      lines.push(`   实际结果: ${result} ${points}点 (${status})`);
      
      // 如果触达止盈
      if (profitLoss.takeProfitReached) {
        lines.push(`   止盈触达: 在${profitLoss.takeProfitMinutes}分钟后触达止盈价 ${advice.takeProfit.toFixed(0)}`);
      }
    } else {
      lines.push(`   实际结果: 数据待更新`);
    }
    
    lines.push('');
  });
  
  // 统计信息
  const completedStrategies = recentStrategies.filter(s => s.profitLoss?.profitLossPoints !== undefined);
  if (completedStrategies.length > 0) {
    const winCount = completedStrategies.filter(s => s.profitLoss?.isWin).length;
    const totalProfitLoss = completedStrategies.reduce((sum, s) => sum + (s.profitLoss?.profitLossPoints || 0), 0);
    const winRate = ((winCount / completedStrategies.length) * 100).toFixed(1);
    
    lines.push(`统计: 胜率 ${winRate}% (${winCount}胜/${completedStrategies.length - winCount}负) | 总盈亏 ${totalProfitLoss > 0 ? '+' : ''}${totalProfitLoss.toFixed(0)}点`);
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
- **最近15分钟的历史策略预测及其实际盈亏结果**（非常重要！）

请从以下角度进行综合分析：
1. **历史策略回顾**：分析最近15分钟内的历史预测准确性和盈亏情况，总结成功和失败的原因
2. **技术面分析**：K线形态、均线趋势、支撑阻力位、成交量变化
3. **短期和长期趋势**：结合1分钟、15分钟和日线数据判断多周期趋势
4. **市场情绪**：盘口买卖力量对比、成交活跃度
5. **价格预测**：基于当前数据和历史经验预测未来15分钟的价格走势
6. **图形分析**：详细分析过去、当前和未来的图形特征
7. **策略优化**：根据历史盈亏情况调整止盈止损策略，提高胜率

你必须以JSON格式返回分析结果，包含以下字段：
{
  "tradingAdvice": {
    "action": "买多" | "卖空" | "观望",
    "confidence": 0-100的整数（表示信心度百分比）,
    "riskLevel": "高" | "中" | "低",
    "entryPrice": 数字（建议入场价格）,
    "stopLoss": 数字（止损价格）,
    "takeProfit": 数字（止盈价格）,
    "lots": 1（固定为1手，每次交易只能1手）,
    "londonPricePrediction15min": 数字（预测15分钟后伦敦白银价格，美元）,
    "pricePrediction15min": 数字（预测15分钟后国内白银价格，人民币）
  },
  "analysisReason": "字符串（简要说明交易建议的理由，控制在150字以内，包括：技术面分析、趋势判断、关键点位等）",
  "chartAnalysis": {
    "pastChart": "字符串（分析过去的图形走势，包括关键K线形态、趋势线、重要支撑阻力位，控制在100字以内）",
    "currentChart": "字符串（分析当前的图形状态，包括当前位置、买卖力量对比、关键技术指标，控制在100字以内）",
    "futureChart": "字符串（预测未来的图形走势，包括可能的突破方向、目标位、关键观察点，控制在100字以内）"
  }
}

注意事项：
- **重要**：手数固定为1手，不要建议多手交易
- **重要**：止盈止损价格应该基于15分钟短期预测，不要设置过大的价格区间
- 建议入场价应该基于当前最新价格，合理的入场点位
- **止损价格**：应该控制在入场价的0.5-1.5%范围内（国内白银约5-15元的价差）
- **止盈价格**：应该控制在入场价的1-3%范围内（国内白银约10-30元的价差）
- 止盈止损要符合15分钟的短期波动特征，不要设置日内或长期目标
- 风险收益比建议在1:1.5 到 1:2.5 之间
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
  domesticDepth: DepthData | null,
  historicalStrategies: StrategyAnalysis[] = []
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

  // 消息8：历史策略预测与实际结果（最近15分钟）
  messages.push({
    role: 'user' as const,
    content: `【历史策略预测与实际盈亏】（最近15分钟）\n${formatHistoricalStrategies(historicalStrategies)}\n\n注意：请参考以上历史预测的准确性和盈亏情况，从中学习并调整你的策略建议，提高预测准确度和盈利率。`
  });

  // 消息9：请求分析
  messages.push({
    role: 'user' as const,
    content: `请基于以上所有数据（包括历史预测结果），进行综合分析并给出交易策略建议。请严格按照JSON格式返回结果。`
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
  domesticDepth: DepthData | null,
  historicalStrategies: StrategyAnalysis[] = []
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
      domesticDepth,
      historicalStrategies
    )
  };
}

