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
import { buildSingleHandPrompt } from '../prompts/singleHandPrompts';

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
  londonKline1d: KlineData[],
  domesticKline1m: KlineData[],
  domesticKline15m: KlineData[],
  domesticKline1d: KlineData[],
  domesticDepth: DepthData | null,
  currentPosition: SingleHandPosition,
  recentOperations: SingleHandOperation[],
  currentPrice: number
): Promise<SingleHandDecision> {
  try {
    // 构建提示词
    const prompt = buildSingleHandPrompt({
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
    });

    console.log('[单手交易] 开始AI分析, 模型:', model);
    console.log('[单手交易] 数据统计:');
    console.log('  - 伦敦1分钟:', londonKline1m.length, '条');
    console.log('  - 伦敦15分钟:', londonKline15m.length, '条');
    console.log('  - 伦敦日线:', londonKline1d.length, '条');
    console.log('  - 国内1分钟:', domesticKline1m.length, '条');
    console.log('  - 国内15分钟:', domesticKline15m.length, '条');
    console.log('  - 国内日线:', domesticKline1d.length, '条');
    console.log('  - 国内盘口:', domesticDepth ? '有' : '无');
    console.log('  - 当前持仓:', currentPosition.hasPosition ? '有' : '无');
    console.log('  - 历史操作:', recentOperations.length, '条');

    // 构建发送给AI的消息（与strategyService.ts格式一致）
    const messages = [
      {
        role: 'user',
        content: prompt,
      }
    ];

    // 请求体
    const requestBody = {
      model,
      messages,
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

