# 策略分析服务说明

## 纯前端实现

本服务采用**纯前端实现**，直接从浏览器请求新加坡服务器的AI接口，无需经过后端代理。

## 服务配置

- **API地址**: `https://1256349444-fla6e0vfcj.ap-singapore.tencentscf.com/chat`
- **请求方式**: POST
- **内容类型**: application/json

## 工作流程

1. **数据收集**: 从store中获取所有市场数据（伦敦和国内白银的K线、盘口）
2. **格式化**: 使用`prompts/strategyPrompts.ts`中的函数格式化数据
3. **请求AI**: 直接发送POST请求到新加坡服务器
4. **解析响应**: 提取JSON格式的策略建议
5. **更新UI**: 将结果保存到store，StrategyPanel自动显示

## 自动分析

页面加载后，系统会：
1. 等待所有数据加载完成（约5秒）
2. 自动触发一次AI策略分析
3. 在策略面板显示分析结果

## 手动分析

如需手动触发分析，可以在App组件中调用：

```typescript
import { analyzeStrategy } from './services/strategyService';

const result = await analyzeStrategy(
  selectedModel,
  londonKline1m,
  londonKline15m,
  londonKlineDaily,
  domesticKline1m,
  domesticKline15m,
  domesticKlineDaily,
  domesticDepth
);

setStrategy(result);
```

## 支持的模型

- deepseek-chat (默认)
- doubao-seed-1-6-thinking-250715
- qwen3-max
- glm-4.6
- MiniMax-M2
- kimi-k2-0905-preview
- gpt-5
- claude-sonnet-4-5
- google-ai-studio/gemini-2.5-pro
- grok/grok-4

## 错误处理

服务会自动处理以下错误：
- 网络请求失败
- API响应错误
- JSON解析失败（会尝试从markdown代码块中提取）

所有错误都会在控制台输出详细日志。

## 无需后端配置

✅ 不需要配置.env文件  
✅ 不需要后端API密钥  
✅ 不需要后端代理服务  
✅ 直接从浏览器请求新加坡服务器  

## 注意事项

1. 确保浏览器能够访问新加坡服务器
2. 首次分析可能需要10-30秒（取决于模型响应速度）
3. 如果分析失败，请检查浏览器控制台的错误信息
4. 确保所有市场数据已加载完成

