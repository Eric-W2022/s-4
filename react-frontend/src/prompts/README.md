# 策略分析提示词说明

本文件夹包含用于交易策略分析的提示词和数据格式化工具。

## 文件说明

### `strategyPrompts.ts`

包含以下功能：

1. **数据格式化函数**
   - `formatKlineData()`: 将K线数据格式化为易读的文本格式
   - `formatDepthData()`: 将盘口深度数据格式化为易读的文本格式

2. **提示词生成**
   - `getSystemPrompt()`: 生成系统提示词，定义大模型的角色和任务
   - `generateMarketDataMessages()`: 将市场数据组织成多个用户消息

3. **请求构建**
   - `createStrategyAnalysisRequest()`: 创建完整的策略分析请求

## 数据流程

1. 前端收集市场数据：
   - 伦敦白银：1分钟、15分钟、90日K线
   - 国内白银：1分钟、15分钟、90日K线、实时盘口

2. 通过提示词函数格式化数据

3. 发送给后端API：`/api/strategy/analyze`

4. 后端调用大模型进行分析

5. 返回结构化的交易建议（JSON格式）

## 返回数据格式

```typescript
{
  "tradingAdvice": {
    "action": "买多" | "卖空" | "观望",
    "confidence": 0-100,  // 信心度百分比
    "riskLevel": "高" | "中" | "低",
    "entryPrice": number,  // 建议入场价
    "stopLoss": number,    // 止损价
    "takeProfit": number,  // 止盈价
    "lots": number,        // 建议手数（1-5）
    "londonPricePrediction15min": number,  // 伦敦白银15分钟价格预测
    "pricePrediction15min": number         // 国内白银15分钟价格预测
  },
  "analysisReason": string,  // 分析理由
  "nextSteps": string        // 后续操作思路
}
```

## 使用示例

```typescript
import { createStrategyAnalysisRequest } from './strategyPrompts';

// 创建分析请求
const request = createStrategyAnalysisRequest(
  'deepseek-chat',  // 模型名称
  londonKline1m,
  londonKline15m,
  londonKlineDaily,
  domesticKline1m,
  domesticKline15m,
  domesticKlineDaily,
  domesticDepth
);

// 发送请求
const result = await strategyApi.analyzeStrategy(request);
```

## 配置说明

### 后端配置

需要在后端配置大模型API：

1. 复制 `.env.example` 为 `.env`
2. 配置 `LLM_API_BASE_URL` 和 `LLM_API_KEY`

### 支持的模型

- DeepSeek Chat
- 豆包 Seed 1.6 Thinking
- 通义千问 3 Max
- GLM-4.6
- MiniMax M2
- Kimi K2
- GPT-5
- Claude Sonnet 4.5
- Gemini 2.5 Pro
- Grok-4

## 自动分析

系统会自动每60秒进行一次策略分析，当市场数据更新时会自动触发。

可以在 `App.tsx` 中调整分析间隔：

```typescript
const { strategy, isLoading } = useStrategyAnalysis({
  // ... 其他参数
  interval: 60000, // 60秒，可以调整
});
```

