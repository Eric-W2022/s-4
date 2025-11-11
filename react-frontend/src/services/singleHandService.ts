/**
 * 单手交易服务
 * 使用新加坡服务器进行AI决策分析（与15分钟多手策略一致）
 */

import type { 
  KlineData, 
  DepthData, 
  SingleHandPosition, 
  SingleHandOperation, 
  SingleHandDecision,
  ModelType 
} from '../types';
import type { BollingerBands } from '../prompts/singleHandPrompts';
import { buildSingleHandMessages } from '../prompts/singleHandPrompts';
import { calculateBollingerBands } from '../utils/chart';

// 新加坡服务器配置（与strategyService.ts一致）
const LLM_API_URL = 'https://1256349444-fla6e0vfcj.ap-singapore.tencentscf.com/chat';

/**
 * 调用AI分析单手交易决策
 * 使用新加坡服务器路由
 */
export async function analyzeSingleHandStrategy(
  model: ModelType,
  londonKline1m: KlineData[],
  londonKline15m: KlineData[],
  londonKlineDaily: KlineData[],
  domesticKline1m: KlineData[],
  domesticKline15m: KlineData[],
  domesticKlineDaily: KlineData[],
  domesticDepth: DepthData | null,
  currentPosition: SingleHandPosition,
  recentOperations: SingleHandOperation[],
  currentPrice: number
): Promise<SingleHandDecision> {
  try {
    console.log('[单手交易] 开始AI分析, 模型:', model);
    console.log('[单手交易] 数据统计:');
    console.log('  - 伦敦1分钟:', londonKline1m.length, '条');
    console.log('  - 伦敦15分钟:', londonKline15m.length, '条');
    console.log('  - 伦敦日线:', londonKlineDaily.length, '条');
    console.log('  - 国内1分钟:', domesticKline1m.length, '条');
    console.log('  - 国内15分钟:', domesticKline15m.length, '条');
    console.log('  - 国内日线:', domesticKlineDaily.length, '条');
    console.log('  - 国内盘口:', domesticDepth ? '有' : '无');
    console.log('  - 当前持仓:', currentPosition.hasPosition ? '有' : '无');
    console.log('  - 历史操作:', recentOperations.length, '条');

    // 计算布林带指标
    const bollinger1m = calculateBollingerBands(domesticKline1m, 20, 2);
    const bollinger15m = calculateBollingerBands(domesticKline15m, 20, 2);
    
    // 获取最新的布林带值
    const domesticBollinger1m: BollingerBands | undefined = bollinger1m.upper.length > 0 ? {
      upper: bollinger1m.upper[bollinger1m.upper.length - 1],
      middle: bollinger1m.middle[bollinger1m.middle.length - 1],
      lower: bollinger1m.lower[bollinger1m.lower.length - 1],
    } : undefined;

    const domesticBollinger15m: BollingerBands | undefined = bollinger15m.upper.length > 0 ? {
      upper: bollinger15m.upper[bollinger15m.upper.length - 1],
      middle: bollinger15m.middle[bollinger15m.middle.length - 1],
      lower: bollinger15m.lower[bollinger15m.lower.length - 1],
    } : undefined;

    console.log('  - 1分钟布林带:', domesticBollinger1m ? '有' : '无');
    console.log('  - 15分钟布林带:', domesticBollinger15m ? '有' : '无');

    // 构建系统提示词
    const systemPrompt = `# 单手交易策略分析

你是一位激进的白银期货交易专家，追求大盈利，敢于在强趋势中持仓。

## 交易规则
1. **只能控制一手**: 同时最多持有1手白银期货
2. **可操作类型**: 开多、开空、平仓、持有
3. **盈亏计算**: 每个点价值15元人民币
4. **手续费**: 开仓8元，平仓8元，总计16元
5. **交易目标**: 激进交易，追求大盈利（20-50点），敢于承担风险

## 交易风格
- **激进型**: 趋势明确时果断入场，不犹豫
- **追求大利**: 目标盈利20-50点，不满足于小利
- **敢于持仓**: 强趋势时持仓30分钟以上，等待大行情
- **宽容止损**: 给趋势发展空间，止损设在15-20点
- **趋势跟随**: 顺势而为，追涨杀跌，抓住主升/主跌浪`;

    // 构建消息数组（包含布林带数据）
    const userMessages = buildSingleHandMessages({
      londonKline1m,
      londonKline15m,
      londonKline1d: londonKlineDaily,
      domesticKline1m,
      domesticKline15m,
      domesticKline1d: domesticKlineDaily,
      domesticDepth,
      currentPosition,
      recentOperations,
      currentPrice,
      domesticBollinger1m,
      domesticBollinger15m,
    });

    // 完整消息数组：system + 两个user messages
    const fullMessages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...userMessages
    ];

    console.log('[单手交易] Messages数量:', fullMessages.length);

    // 请求体
    const requestBody = {
      model,
      messages: fullMessages,
      temperature: 0.7,
      max_tokens: 2000,
    };

    console.log('[单手交易] 发送请求到新加坡服务器...');

    // 调用新加坡服务器API
    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[单手交易] API请求失败:', response.status, errorText);
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // 提取AI返回的内容（兼容两种响应格式）
    let content: string;

    if (result.response && Array.isArray(result.response) && result.response.length > 0) {
      // 新格式：{ response: [{ message: "...", delay: 0 }] }
      content = result.response[0].message;
      console.log('[单手交易] 使用 response 格式');
    } else if (result.choices && Array.isArray(result.choices) && result.choices.length > 0) {
      // OpenAI 标准格式：{ choices: [{ message: { content: "..." } }] }
      content = result.choices[0].message.content;
      console.log('[单手交易] 使用 choices 格式');
    } else {
      console.error('[单手交易] API响应格式错误:', result);
      throw new Error('API响应格式错误：缺少 response 或 choices 字段');
    }

    console.log('[单手交易] 收到响应，内容长度:', content.length);

    // 解析JSON响应
    let decisionData: any;

    // 预处理：清理可能存在的markdown代码块标记
    content = content.trim();

    // 移除开头的```json或```
    if (content.startsWith('```json')) {
      content = content.substring(7).trim();
    } else if (content.startsWith('```')) {
      content = content.substring(3).trim();
    }

    // 移除结尾的```
    if (content.endsWith('```')) {
      content = content.substring(0, content.length - 3).trim();
    }

    try {
      // 尝试直接解析JSON
      decisionData = JSON.parse(content);
    } catch (e) {
      console.warn('[单手交易] 直接JSON解析失败，尝试提取JSON部分...');

      // 查找第一个{和最后一个}
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        content = content.substring(firstBrace, lastBrace + 1);
        console.log('[单手交易] 提取JSON部分，长度:', content.length);
      }

      decisionData = JSON.parse(content);
    }

    // 验证返回数据
    if (!decisionData.action || !decisionData.reason || decisionData.confidence === undefined) {
      console.error('[单手交易] 响应数据格式错误:', decisionData);
      throw new Error('响应数据不完整');
    }

    const decision: SingleHandDecision = {
      action: decisionData.action,
      reason: decisionData.reason,
      confidence: decisionData.confidence,
      targetPrice: decisionData.targetPrice,
      timestamp: Date.now(),
      model,
    };

    console.log('[单手交易] ✅ AI决策完成');
    console.log('  - 决策:', decision.action);
    console.log('  - 信心度:', decision.confidence + '%');
    console.log('  - 理由:', decision.reason);

    return decision;
  } catch (error: any) {
    console.error('[单手交易] ❌ AI分析失败:', error);
    throw new Error(`单手交易AI分析失败: ${error.message || '未知错误'}`);
  }
}

