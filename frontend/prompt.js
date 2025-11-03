/**
 * Prompt模板配置
 * 用于大模型分析K线数据
 */

// 主提示词模板
const MAIN_PROMPT = `你是一个专业的金融分析师，擅长分析K线走势和技术指标。请根据提供的K线数据，进行深入的技术分析。

## 分析要求：

1. **技术分析**：
   - 综合分析伦敦现货白银和国内白银的价格趋势（上涨、下跌、震荡）
   - 分析K线形态（如锤子线、十字星、吞没形态等）
   - 分析两个市场的联动关系和相关性

2. **市场情绪**：
   - 评估市场情绪（看涨、看跌、中性）
   - 分析多空力量对比
   - 识别潜在的转折点

3. **交易建议**：
   - 提供清晰的操作建议（买多、卖空、观望）
   - 评估风险等级和收益潜力

## 输出格式要求：

你必须严格按照以下JSON格式输出分析结果，不要包含任何其他文字说明：

\`\`\`json
{
  "analysisReason": "分析理由（控制在100字内，简洁明了地说明当前市场状况和操作依据）",
  "tradingAdvice": {
    "action": "买多/卖空/观望",
    "confidence": 0-100的整数,
    "riskLevel": "高/中/低"
  }
}
\`\`\`

## 注意事项：

1. analysisReason字段必须控制在100字以内，简洁明了
2. confidence字段必须是0-100之间的整数
3. action字段只能是"买多"、"卖空"或"观望"之一
4. riskLevel字段只能是"高"、"中"或"低"之一
5. 如果没有足够的数据进行分析，请在analysisReason中说明
6. 始终保持客观、专业的分析态度
`;

/**
 * 格式化单市场K线数据为提示词文本
 * @param {Array} klineData - K线数据数组
 * @param {string} marketName - 市场名称（如"伦敦现货白银"或"国内白银"）
 * @param {string} symbol - 交易品种（如"Silver"或"AG"）
 * @returns {string} 格式化后的提示词文本
 */
function formatKlineDataForPrompt(klineData, marketName, symbol) {
    const lines = [];
    
    if (klineData && klineData.length > 0) {
        lines.push(`=== ${marketName}（${symbol}）K线数据（格式：时间戳, 开盘价, 收盘价, 最高价, 最低价, 成交量） ===`);
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
    } else {
        lines.push(`=== ${marketName}（${symbol}）K线数据：暂无数据 ===`);
    }
    
    return lines.join("\n");
}

// 导出供其他文件使用
if (typeof window !== 'undefined') {
    window.PROMPT_CONFIG = {
        MAIN_PROMPT: MAIN_PROMPT,
        formatKlineDataForPrompt: formatKlineDataForPrompt
    };
}
