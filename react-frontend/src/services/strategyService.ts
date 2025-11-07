// 纯前端AI策略分析服务
// 直接请求新加坡服务器（与旧版script.js格式一致）

import { createStrategyAnalysisRequest } from '../prompts/strategyPrompts';
import type { KlineData, DepthData, ModelType } from '../types';

// 新加坡服务器配置（与旧版frontend/script.js一致）
const LLM_API_URL = 'https://1256349444-fla6e0vfcj.ap-singapore.tencentscf.com/chat';

interface StrategyAnalysisResult {
  tradingAdvice: {
    action: '买多' | '卖空' | '观望';
    confidence: number;
    riskLevel: '高' | '中' | '低';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    lots: number;
    londonPricePrediction15min: number;
    pricePrediction15min: number;
  };
  analysisReason: string;
}

/**
 * 调用AI分析交易策略
 * 直接请求新加坡服务器，传递messages、temperature和提示词
 */
export async function analyzeStrategy(
  model: ModelType,
  londonKline1m: KlineData[],
  londonKline15m: KlineData[],
  londonKlineDaily: KlineData[],
  domesticKline1m: KlineData[],
  domesticKline15m: KlineData[],
  domesticKlineDaily: KlineData[],
  domesticDepth: DepthData | null
): Promise<StrategyAnalysisResult> {
  try {
    console.log('[策略分析] 开始分析，模型:', model);
    console.log('[策略分析] 数据统计:');
    console.log('  - 伦敦1分钟:', londonKline1m.length, '条');
    console.log('  - 伦敦15分钟:', londonKline15m.length, '条');
    console.log('  - 伦敦90日:', londonKlineDaily.length, '条');
    console.log('  - 国内1分钟:', domesticKline1m.length, '条');
    console.log('  - 国内15分钟:', domesticKline15m.length, '条');
    console.log('  - 国内90日:', domesticKlineDaily.length, '条');
    console.log('  - 国内盘口:', domesticDepth ? '有' : '无');
    
    // 创建请求数据（包含systemPrompt和messages）
    const request = createStrategyAnalysisRequest(
      model,
      londonKline1m,
      londonKline15m,
      londonKlineDaily,
      domesticKline1m,
      domesticKline15m,
      domesticKlineDaily,
      domesticDepth
    );
    
    // 构建发送给AI的消息（与旧版script.js格式一致）
    const messages = [
      {
        role: 'system',
        content: request.systemPrompt
      },
      ...request.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];
    
    // 请求体（传递messages、temperature、model和max_tokens）
    const requestBody = {
      model: request.model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4000,
    };
    
    console.log('[策略分析] 发送请求到新加坡服务器...');
    console.log('[策略分析] Messages数量:', messages.length);
    console.log('[策略分析] Temperature:', 0.7);
    
    // 发送请求（与旧版script.js格式一致）
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
      console.error('[策略分析] API请求失败:', response.status, errorText);
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    // 提取AI返回的内容（兼容两种响应格式）
    let content: string;
    
    if (result.response && Array.isArray(result.response) && result.response.length > 0) {
      // 新格式：{ response: [{ message: "...", delay: 0 }] }
      content = result.response[0].message;
      console.log('[策略分析] 使用 response 格式');
    } else if (result.choices && Array.isArray(result.choices) && result.choices.length > 0) {
      // OpenAI 标准格式：{ choices: [{ message: { content: "..." } }] }
      content = result.choices[0].message.content;
      console.log('[策略分析] 使用 choices 格式');
    } else {
      console.error('[策略分析] API响应格式错误:', result);
      throw new Error('API响应格式错误：缺少 response 或 choices 字段');
    }
    console.log('[策略分析] 收到响应，内容长度:', content.length);
    
    // 解析JSON响应
    let strategyData: StrategyAnalysisResult;
    
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
      strategyData = JSON.parse(content);
    } catch (e) {
      console.warn('[策略分析] 直接JSON解析失败，尝试提取JSON部分...');
      
      // 查找第一个{和最后一个}
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        content = content.substring(firstBrace, lastBrace + 1);
        console.log('[策略分析] 提取JSON部分，长度:', content.length);
      }
      
      strategyData = JSON.parse(content);
    }
    
    // 验证数据结构
    if (!strategyData.tradingAdvice) {
      console.error('[策略分析] 响应数据格式错误:', strategyData);
      throw new Error('响应数据缺少tradingAdvice字段');
    }
    
    console.log('[策略分析] ✅ 分析完成');
    console.log('  - 建议:', strategyData.tradingAdvice.action);
    console.log('  - 信心度:', strategyData.tradingAdvice.confidence + '%');
    console.log('  - 风险:', strategyData.tradingAdvice.riskLevel);
    console.log('  - 入场价:', strategyData.tradingAdvice.entryPrice);
    console.log('  - 分析理由:', strategyData.analysisReason);
    
    return strategyData;
    
  } catch (error: any) {
    console.error('[策略分析] ❌ 分析失败:', error);
    throw new Error(`策略分析失败: ${error.message || '未知错误'}`);
  }
}

