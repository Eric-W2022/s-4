/**
 * Prompt模板配置
 * 用于大模型分析K线数据
 */

// 主提示词模板
const MAIN_PROMPT = `你是一个专业的金融分析师，擅长分析K线走势和技术指标。请根据提供的K线数据，进行深入的技术分析。

## 分析要求：

1. **技术分析**：
   - 分析当前价格趋势（上涨、下跌、震荡）
   - 识别关键支撑位和阻力位
   - 分析K线形态（如锤子线、十字星、吞没形态等）
   - 评估交易量变化（如果有）
   - 分析价格动量和波动性

2. **市场情绪**：
   - 评估市场情绪（看涨、看跌、中性）
   - 分析多空力量对比
   - 识别潜在的转折点

3. **交易建议**：
   - 提供清晰的操作建议（买入、卖出、观望）
   - 给出具体的入场价格、止损价格、止盈价格
   - 评估风险等级和收益潜力
   - 提供持仓建议（仓位大小）

## 输出格式要求：

你必须严格按照以下JSON格式输出分析结果，不要包含任何其他文字说明：

{
  "trend": "上涨/下跌/震荡",
  "trendStrength": "强/中/弱",
  "supportLevel": 数值,
  "resistanceLevel": 数值,
  "keyPatterns": ["形态1", "形态2"],
  "marketSentiment": "看涨/看跌/中性",
  "momentum": "强/中/弱",
  "volatility": "高/中/低",
  "tradingAdvice": {
    "action": "买入/卖出/观望",
    "entryPrice": 数值,
    "stopLoss": 数值,
    "takeProfit": 数值,
    "riskLevel": "高/中/低",
    "confidence": 0-100的整数,
    "positionSize": "建议仓位描述"
  },
  "analysis": {
    "summary": "简要分析总结",
    "details": "详细分析内容",
    "risks": "风险提示",
    "opportunities": "机会分析"
  },
  "recommendations": [
    "建议1",
    "建议2",
    "建议3"
  ]
}

## 注意事项：

1. 所有数值必须是有效的数字，不能是null或字符串
2. confidence字段必须是0-100之间的整数
3. 如果没有足够的数据进行分析，请在analysis.details中说明
4. 始终保持客观、专业的分析态度
5. 如果数据不足，可以适当降低confidence值并说明原因
`;

/**
 * 格式化K线数据为提示词文本
 * @param {Array} klineData - K线数据数组
 * @returns {string} 格式化后的提示词文本
 */
function formatKlineDataForPrompt(klineData) {
    if (!klineData || klineData.length === 0) {
        return "暂无K线数据";
    }
    
    // 格式化K线数据为文本
    const lines = ["以下是K线数据（格式：时间戳, 开盘价, 收盘价, 最高价, 最低价, 成交量）："];
    lines.push("");
    
    for (const item of klineData) {
        const timestamp = item.t || item.time || '';
        const openPrice = item.o || item.open || 0;
        const closePrice = item.c || item.close || 0;
        const highPrice = item.h || item.high || 0;
        const lowPrice = item.l || item.low || 0;
        const volume = item.v || item.volume || 0;
        
        lines.push(`${timestamp}, ${openPrice}, ${closePrice}, ${highPrice}, ${lowPrice}, ${volume}`);
    }
    
    lines.push("");
    lines.push("请根据以上K线数据进行技术分析，并按照JSON格式输出分析结果。");
    
    return lines.join("\n");
}

// 导出供其他文件使用
if (typeof window !== 'undefined') {
    window.PROMPT_CONFIG = {
        MAIN_PROMPT: MAIN_PROMPT,
        formatKlineDataForPrompt: formatKlineDataForPrompt
    };
}

