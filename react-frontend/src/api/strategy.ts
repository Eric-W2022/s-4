// 策略分析 API
import { apiClient } from './client';
import type { StrategyAnalysisRequest } from '../prompts/strategyPrompts';

export interface StrategyAnalysisResponse {
  ret: number;
  msg: string;
  data: {
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
  };
}

export const strategyApi = {
  /**
   * 调用大模型分析交易策略
   */
  analyzeStrategy: async (request: StrategyAnalysisRequest): Promise<StrategyAnalysisResponse['data']> => {
    const response = await apiClient.post<StrategyAnalysisResponse>(
      '/api/strategy/analyze',
      request,
      {
        timeout: 60000, // 60秒超时
      }
    );
    
    if (response.data.ret === 200) {
      return response.data.data;
    } else {
      throw new Error(response.data.msg || '策略分析失败');
    }
  },
};

