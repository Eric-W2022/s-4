# AI策略分析功能设置指南

## 功能概述

本系统已集成大模型AI进行实时交易策略分析，能够：

- 综合分析伦敦白银和国内白银的多周期K线数据（1分钟、15分钟、90日）
- 结合国内白银的实时盘口深度数据
- 提供智能交易建议（买多/卖空/观望）
- 给出入场价、止损价、止盈价和建议手数
- 预测未来15分钟的价格走势
- 评估交易风险等级和信心度
- 每60秒自动更新一次策略建议

## 快速开始

### 1. 安装依赖

**后端依赖：**
```bash
pip install -r requirements.txt
```

新增依赖：`python-dotenv>=1.0.0`（已添加到requirements.txt）

**前端依赖：**
```bash
cd react-frontend
npm install
```

### 2. 配置大模型API

创建 `.env` 文件在项目根目录：

```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env 文件，填入你的API配置
```

`.env` 文件内容：
```bash
# 大模型API配置
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your_api_key_here
```

**支持的API服务商：**

| 服务商 | API Base URL | 说明 |
|--------|-------------|------|
| OpenAI | https://api.openai.com/v1 | GPT系列 |
| DeepSeek | https://api.deepseek.com/v1 | DeepSeek Chat |
| 豆包（字节） | https://ark.cn-beijing.volces.com/api/v3 | 豆包系列 |
| 通义千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 | Qwen系列 |
| 智谱AI | https://open.bigmodel.cn/api/paas/v4 | GLM系列 |
| 其他兼容OpenAI接口的服务商 | - | 任何实现了OpenAI Chat Completions API的服务 |

### 3. 启动服务

**启动后端：**
```bash
cd backend
python -m backend.app
```

后端将在 `http://localhost:8080` 运行

**启动React前端：**
```bash
cd react-frontend
npm run dev
```

前端将在 `http://localhost:5173` 运行（Vite默认端口）

### 4. 使用策略分析

1. 打开浏览器访问前端地址
2. 等待市场数据加载完成
3. 在右侧"实时交易策略"面板查看AI分析结果
4. 点击面板顶部的模型名称可切换不同的AI模型

## 文件结构

### 新增文件

```
s-4/
├── .env.example                          # 环境变量配置示例
├── AI_STRATEGY_SETUP.md                 # 本文档
├── backend/
│   ├── routes/
│   │   └── strategy.py                  # 策略分析路由（新增）
│   └── config/
│       └── settings.py                  # 已更新：添加LLM配置
├── react-frontend/
│   └── src/
│       ├── prompts/                     # 提示词文件夹（新增）
│       │   ├── strategyPrompts.ts      # 提示词和数据格式化
│       │   └── README.md               # 提示词说明文档
│       ├── api/
│       │   └── strategy.ts             # 策略分析API客户端（新增）
│       ├── hooks/
│       │   └── useStrategyAnalysis.ts  # 策略分析Hook（新增）
│       └── types/
│           └── index.ts                # 已更新：策略类型定义
└── requirements.txt                     # 已更新：添加python-dotenv
```

### 修改的文件

- `backend/app.py` - 注册了strategy路由
- `react-frontend/src/App.tsx` - 集成了策略分析Hook
- `react-frontend/src/types/index.ts` - 更新了StrategyAnalysis类型
- `README.md` - 添加了AI策略分析功能说明

## API接口说明

### 策略分析接口

**端点：** `POST /api/strategy/analyze`

**请求体：**
```json
{
  "model": "deepseek-chat",
  "systemPrompt": "你是一位专业的贵金属交易策略分析师...",
  "messages": [
    {"role": "user", "content": "【伦敦现货白银 1分钟K线】..."},
    {"role": "user", "content": "【伦敦现货白银 15分钟K线】..."},
    // ... 更多消息
  ]
}
```

**响应体：**
```json
{
  "ret": 200,
  "msg": "ok",
  "data": {
    "tradingAdvice": {
      "action": "买多",
      "confidence": 75,
      "riskLevel": "中",
      "entryPrice": 8500,
      "stopLoss": 8450,
      "takeProfit": 8600,
      "lots": 2,
      "londonPricePrediction15min": 32.50,
      "pricePrediction15min": 8520
    },
    "analysisReason": "技术面分析...",
    "nextSteps": "后续操作建议..."
  }
}
```

## 支持的AI模型

系统支持以下AI模型（可在前端切换）：

1. **DeepSeek Chat** - 推理能力强，成本低
2. **豆包 Seed 1.6 Thinking** - 深度思考模式
3. **通义千问 3 Max** - 阿里云大模型
4. **GLM-4.6** - 智谱AI
5. **MiniMax M2** - MiniMax大模型
6. **Kimi K2** - Moonshot AI
7. **GPT-5** - OpenAI（如果可用）
8. **Claude Sonnet 4.5** - Anthropic
9. **Gemini 2.5 Pro** - Google
10. **Grok-4** - xAI

## 自定义提示词

提示词位于 `react-frontend/src/prompts/strategyPrompts.ts`

### 主要函数

1. **getSystemPrompt()** - 系统提示词
   - 定义AI的角色（专业贵金属交易分析师）
   - 说明分析任务和方法
   - 规定输出格式（JSON）

2. **formatKlineData()** - K线数据格式化
   - 将K线数组转换为易读文本
   - 包含时间、开高低收、涨跌幅、成交量

3. **formatDepthData()** - 盘口数据格式化
   - 格式化五档买卖盘口
   - 包含最新价、成交量、涨跌幅等

4. **generateMarketDataMessages()** - 生成市场数据消息
   - 将所有市场数据组织成多个user消息
   - 按照：伦敦1m → 伦敦15m → 伦敦90日 → 国内1m → 国内15m → 国内90日 → 盘口

### 修改提示词

编辑 `strategyPrompts.ts` 中的 `getSystemPrompt()` 函数：

```typescript
export function getSystemPrompt(): string {
  return `你是一位专业的贵金属交易策略分析师...
  
  // 在这里修改：
  // 1. 调整分析角度
  // 2. 修改输出格式要求
  // 3. 添加特定的交易规则
  // 4. 调整风险偏好
  
  ...`;
}
```

### 修改数据格式

在同一文件中修改 `formatKlineData()` 和 `formatDepthData()` 函数来调整数据展示方式。

## 配置选项

### 分析间隔

在 `react-frontend/src/App.tsx` 中修改：

```typescript
const { strategy, isLoading } = useStrategyAnalysis({
  // ... 其他参数
  interval: 60000, // 60秒，可以调整为其他值
});
```

### 数据条数

在提示词函数中调整：

```typescript
// 在 generateMarketDataMessages() 中
messages.push({
  role: 'user' as const,
  content: `【伦敦现货白银 1分钟K线】（最近20根）\n${formatKlineData(londonKline1m, 20)}`
  // 修改这里的 20 为其他数字
});
```

## 故障排查

### 1. 策略面板显示"等待市场数据..."

**原因：** 市场数据未加载完成或策略分析未启动

**解决方法：**
- 检查浏览器控制台是否有数据请求错误
- 等待5-10秒让系统初始化
- 刷新页面重试

### 2. 策略分析失败

**可能原因：**
- `.env` 文件未配置或配置错误
- API密钥无效
- API服务不可用
- 网络连接问题

**解决方法：**
1. 检查 `.env` 文件是否存在且配置正确
2. 验证API密钥是否有效
3. 检查后端日志：`logs/app_*.log`
4. 测试API连接：
   ```bash
   curl -X POST http://localhost:8080/api/strategy/analyze \
     -H "Content-Type: application/json" \
     -d '{"model":"deepseek-chat","systemPrompt":"test","messages":[]}'
   ```

### 3. 模型响应格式错误

**现象：** 后端日志显示JSON解析失败

**原因：** 模型返回的不是纯JSON格式

**解决方法：**
- 系统会自动尝试从markdown代码块中提取JSON
- 如果仍然失败，可能需要调整提示词，强调"只返回JSON"
- 或在 `backend/routes/strategy.py` 中增强JSON提取逻辑

### 4. python-dotenv导入错误

**错误信息：** `ModuleNotFoundError: No module named 'dotenv'`

**解决方法：**
```bash
pip install python-dotenv
# 或
pip install -r requirements.txt
```

## 性能优化

### 减少API调用成本

1. **增加分析间隔**
   ```typescript
   interval: 120000, // 改为120秒（2分钟）
   ```

2. **减少发送的数据量**
   ```typescript
   // 在 formatKlineData() 中减少数据条数
   const recentData = data.slice(-10); // 从20根改为10根
   ```

3. **选择成本更低的模型**
   - DeepSeek Chat 通常比 GPT-4 便宜很多
   - 国内模型（通义千问、GLM等）可能更便宜

### 提高响应速度

1. **使用更快的模型**
   - DeepSeek Chat 响应速度快
   - 避免使用"thinking"模式的模型

2. **减少上下文长度**
   - 减少每个K线数据的展示条数
   - 简化提示词描述

## 扩展开发

### 添加新的分析指标

1. 在 `formatKlineData()` 中计算新指标
2. 在提示词中说明如何使用这些指标
3. 在返回的JSON中添加新字段

### 支持更多交易对

1. 修改 `constants/index.ts` 添加新的交易对
2. 更新提示词中的描述
3. 调整数据格式化函数

### 添加历史策略记录

1. 在store中添加策略历史数组
2. 创建新组件展示历史策略
3. 添加策略对比和回测功能

## 安全注意事项

1. **API密钥安全**
   - 不要将 `.env` 文件提交到Git仓库
   - `.env` 已在 `.gitignore` 中（确认）
   - 定期更换API密钥

2. **交易风险提示**
   - AI分析仅供参考，不构成投资建议
   - 实际交易前应进行人工审核
   - 建议添加免责声明

3. **数据安全**
   - 敏感交易数据不要发送给第三方API
   - 考虑使用自部署的大模型

## 技术支持

如有问题，请检查：

1. **日志文件**：`logs/app_*.log`
2. **浏览器控制台**：F12打开开发者工具
3. **网络请求**：检查API调用是否成功
4. **环境变量**：确认 `.env` 配置正确

## 更新日志

- 2025-11-07：初始版本发布
  - 集成大模型策略分析
  - 支持10种主流AI模型
  - 自动化分析流程
  - 完整的提示词系统

