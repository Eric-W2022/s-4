// 纯前端AI策略分析服务
// 直接请求新加坡服务器

import { createStrategyAnalysisRequest } from '../prompts/strategyPrompts';
import type { KlineData, DepthData, ModelType } from '../types';

// 新加坡服务器配置
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
  nextSteps: string;
}

/**
 * 调用AI分析交易策略
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
    
    // 创建请求数据
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
    
    // 构建发送给AI的消息
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
    
    const requestBody = {
      model: request.model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4000,
    };
    
    console.log('[策略分析] 发送请求到新加坡服务器...');
    
    // 发送请求
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
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    // 提取AI返回的内容
    if (!result.choices || result.choices.length === 0) {
      throw new Error('API响应格式错误：没有choices字段');
    }
    
    let content = result.choices[0].message.content;
    console.log('[策略分析] 收到响应，长度:', content.length);
    
    // 解析JSON响应
    let strategyData: StrategyAnalysisResult;
    
    try {
      // 尝试直接解析JSON
      strategyData = JSON.parse(content);
    } catch (e) {
      console.warn('[策略分析] 直接JSON解析失败，尝试提取...');
      
      // 尝试从markdown代码块中提取
      if (content.includes('```json')) {
        const jsonStart = content.indexOf('```json') + 7;
        const jsonEnd = content.indexOf('```', jsonStart);
        content = content.substring(jsonStart, jsonEnd).trim();
      } else if (content.includes('```')) {
        const jsonStart = content.indexOf('```') + 3;
        const jsonEnd = content.indexOf('```', jsonStart);
        content = content.substring(jsonStart, jsonEnd).trim();
      } else {
        // 查找第一个{和最后一个}
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          content = content.substring(firstBrace, lastBrace + 1);
        }
      }
      
      strategyData = JSON.parse(content);
    }
    
    // 验证数据结构
    if (!strategyData.tradingAdvice) {
      throw new Error('响应数据缺少tradingAdvice字段');
    }
    
    console.log('[策略分析] 分析完成，建议:', strategyData.tradingAdvice.action);
    
    return strategyData;
    
  } catch (error: any) {
    console.error('[策略分析] 分析失败:', error);
    throw new Error(`策略分析失败: ${error.message || '未知错误'}`);
  }
}

