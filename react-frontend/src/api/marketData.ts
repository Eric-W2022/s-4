// 市场数据 API
import { apiClient } from './client';
import type { KlineData, TradeTickData, DepthData, StrategyAnalysis } from '../types';

export interface KlineResponse {
  data: KlineData[];
}

export interface TradeTickResponse {
  ret: number;
  msg: string;
  data: {
    tick_list: TradeTickData[];
  };
}

export interface DepthResponse {
  ret: number;
  msg: string;
  data: {
    depth_list: DepthData[];
  };
}

export const marketDataApi = {
  // 获取K线数据
  getKline: async (
    symbol: string,
    interval: string = '1m',
    limit: number = 100
  ): Promise<KlineData[]> => {
    const response = await apiClient.get<KlineData[]>('/api/data/kline', {
      params: { symbol, interval, limit },
    });
    return response.data;
  },

  // 获取实时价格
  getTradeTick: async (symbol: string): Promise<TradeTickData | null> => {
    const response = await apiClient.get<TradeTickResponse>('/api/data/trade-tick', {
      params: { symbol },
    });
    if (response.data.ret === 200 && response.data.data.tick_list.length > 0) {
      return response.data.data.tick_list[0];
    }
    return null;
  },

  // 获取盘口深度
  getDepth: async (symbol: string): Promise<DepthData | null> => {
    const response = await apiClient.get<DepthResponse>('/api/data/depth-tick', {
      params: { symbol },
    });
    if (response.data.ret === 200 && response.data.data.depth_list.length > 0) {
      return response.data.data.depth_list[0];
    }
    return null;
  },

  // 保存预测数据
  savePrediction: async (strategy: StrategyAnalysis): Promise<void> => {
    try {
      const predictionData = {
        timestamp: strategy.timestamp || Date.now(),
        model: strategy.model || 'unknown',
        action: strategy.tradingAdvice.action,
        confidence: strategy.tradingAdvice.confidence,
        riskLevel: strategy.tradingAdvice.riskLevel,
        entryPrice: strategy.tradingAdvice.entryPrice,
        stopLoss: strategy.tradingAdvice.stopLoss,
        takeProfit: strategy.tradingAdvice.takeProfit,
        lots: strategy.tradingAdvice.lots,
        londonPricePrediction15min: strategy.tradingAdvice.londonPricePrediction15min,
        pricePrediction15min: strategy.tradingAdvice.pricePrediction15min,
        analysisReason: strategy.analysisReason,
        profitLossPoints: strategy.profitLoss?.profitLossPoints,
        profitLossPercent: strategy.profitLoss?.profitLossPercent,
        isWin: strategy.profitLoss?.isWin,
        takeProfitReached: strategy.profitLoss?.takeProfitReached,
        takeProfitMinutes: strategy.profitLoss?.takeProfitMinutes,
      };

      await apiClient.post('/api/data/save-prediction', predictionData);
      console.log('[保存预测] 预测数据已保存到后端');
    } catch (error) {
      console.error('[保存预测] 保存失败:', error);
      // 不抛出错误，避免影响主流程
    }
  },
};

