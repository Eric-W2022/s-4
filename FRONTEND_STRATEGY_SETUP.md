# 纯前端AI策略分析 - 快速指南

## ✨ 核心特性

- ✅ **纯前端实现** - 无需后端API，直接从浏览器请求
- ✅ **自动分析** - 页面加载后自动触发AI策略分析
- ✅ **开箱即用** - 无需配置API密钥或.env文件
- ✅ **实时显示** - 策略结果实时显示在右侧面板

## 🚀 快速开始

### 1. 安装前端依赖
```bash
cd react-frontend
npm install
```

### 2. 启动后端（仅用于市场数据）
```bash
cd backend
python -m backend.app
```

### 3. 启动前端
```bash
cd react-frontend
npm run dev
```

### 4. 访问页面
打开浏览器访问 `http://localhost:5173`

## 📋 工作流程

1. **页面加载** - 系统开始加载伦敦和国内白银的K线数据
2. **数据收集** - 等待6组数据加载完成（伦敦1m/15m/90日 + 国内1m/15m/90日）
3. **自动分析** - 5秒后自动触发AI策略分析
4. **显示结果** - 策略面板显示AI分析结果

## 🔧 技术实现

### 请求新加坡服务器

```typescript
// 文件: react-frontend/src/services/strategyService.ts

const LLM_API_URL = 'https://1256349444-fla6e0vfcj.ap-singapore.tencentscf.com/chat';

const response = await fetch(LLM_API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'accept': 'application/json'
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [...],
    temperature: 0.7,
    max_tokens: 4000
  })
});
```

### 自动分析逻辑

```typescript
// 文件: react-frontend/src/App.tsx

useEffect(() => {
  // 检查所有数据是否已加载
  const hasAllData = 
    londonKline1m.length > 0 &&
    londonKline15m.length > 0 &&
    londonKlineDaily.length > 0 &&
    domesticKline1m.length > 0 &&
    domesticKline15m.length > 0 &&
    domesticKlineDaily.length > 0;
  
  if (hasAllData && !strategy) {
    // 延迟5秒后自动触发分析
    setTimeout(async () => {
      const result = await analyzeStrategy(...);
      setStrategy(result);
    }, 5000);
  }
}, [/* 依赖数据 */]);
```

## 📊 数据流程

```
┌──────────────┐
│  页面加载     │
└──────┬───────┘
       │
       ↓
┌──────────────────────┐
│ 加载市场数据（6组）   │
│ - 伦敦1分钟K线       │
│ - 伦敦15分钟K线      │
│ - 伦敦90日K线        │
│ - 国内1分钟K线       │
│ - 国内15分钟K线      │
│ - 国内90日K线        │
│ - 国内盘口深度       │
└──────┬───────────────┘
       │
       ↓
┌──────────────┐
│ 数据格式化    │
│ (prompts)    │
└──────┬───────┘
       │
       ↓
┌─────────────────────┐
│ 请求新加坡服务器     │
│ POST /chat          │
└──────┬──────────────┘
       │
       ↓
┌──────────────┐
│ 解析AI响应   │
│ 提取JSON     │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ 更新UI显示   │
│ 策略面板     │
└──────────────┘
```

## 🎯 返回数据格式

AI返回的策略数据：

```json
{
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
  "analysisReason": "伦敦白银形成上升三角形态...",
  "nextSteps": "关注8550阻力位，突破后继续持有..."
}
```

## 🔍 调试技巧

### 查看分析过程

打开浏览器控制台（F12），查看详细日志：

```
[自动分析] 等待数据加载完成...
[自动分析] 所有数据已就绪，开始分析...
[策略分析] 开始分析，模型: deepseek-chat
[策略分析] 发送请求到新加坡服务器...
[策略分析] 收到响应，长度: 1234
[策略分析] 分析完成，建议: 买多
[自动分析] 分析完成
```

### 常见问题

**1. 策略面板一直显示"等待市场数据..."**
- 等待10秒，数据可能还在加载
- 检查控制台是否有网络错误
- 确认后端是否正常运行

**2. 分析失败**
- 检查能否访问新加坡服务器
- 查看控制台的详细错误信息
- 刷新页面重试

**3. 分析时间过长**
- 首次分析可能需要20-30秒
- 取决于AI模型的响应速度
- 可以在控制台查看请求状态

## 📂 相关文件

```
react-frontend/src/
├── services/
│   ├── strategyService.ts    # 纯前端策略分析服务
│   └── README.md             # 服务说明文档
├── prompts/
│   ├── strategyPrompts.ts    # 提示词和数据格式化
│   └── README.md             # 提示词说明
├── App.tsx                   # 主应用（自动分析逻辑）
├── types/index.ts            # 类型定义
└── store/appStore.ts         # 状态管理
```

## 🌟 优势

1. **无需后端配置** - 不需要配置.env或API密钥
2. **直接访问** - 浏览器直接请求，减少延迟
3. **简单部署** - 只需部署前端静态文件
4. **实时分析** - 页面加载后自动触发
5. **多模型支持** - 可切换10种不同的AI模型

## 📝 自定义

### 修改分析间隔

默认只在页面加载时分析一次。如需定时分析：

```typescript
// 在App.tsx中添加定时器
useEffect(() => {
  const interval = setInterval(async () => {
    const result = await analyzeStrategy(...);
    setStrategy(result);
  }, 60000); // 每60秒分析一次
  
  return () => clearInterval(interval);
}, []);
```

### 修改延迟时间

```typescript
// 在App.tsx中修改
setTimeout(triggerAnalysis, 3000); // 改为3秒
```

### 更换API服务器

```typescript
// 在strategyService.ts中修改
const LLM_API_URL = 'https://your-api-server.com/chat';
```

## ✅ 总结

- ✨ 纯前端实现，无需后端API配置
- 🚀 开箱即用，自动触发分析
- 📊 实时显示策略建议
- 🔧 可自定义提示词和模型
- 🌐 直接请求新加坡服务器

现在打开浏览器，等待5-10秒，就能看到AI策略分析结果！🎉

