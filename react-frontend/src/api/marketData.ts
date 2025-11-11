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

  // 保存预测数据（包含新预测和需要更新的历史数据）
  savePrediction: async (newStrategy: StrategyAnalysis, allStrategies: StrategyAnalysis[]): Promise<void> => {
    try {
      // 转换新预测数据
      const newPredictionData = {
        timestamp: newStrategy.timestamp || Date.now(),
        model: newStrategy.model || 'unknown',
        action: newStrategy.tradingAdvice.action,
        confidence: newStrategy.tradingAdvice.confidence,
        riskLevel: newStrategy.tradingAdvice.riskLevel,
        entryPrice: newStrategy.tradingAdvice.entryPrice,
        stopLoss: newStrategy.tradingAdvice.stopLoss,
        takeProfit: newStrategy.tradingAdvice.takeProfit,
        lots: newStrategy.tradingAdvice.lots,
        londonPricePrediction15min: newStrategy.tradingAdvice.londonPricePrediction15min,
        pricePrediction15min: newStrategy.tradingAdvice.pricePrediction15min,
        analysisReason: newStrategy.analysisReason,
        profitLossPoints: newStrategy.profitLoss?.profitLossPoints,
        profitLossPercent: newStrategy.profitLoss?.profitLossPercent,
        isWin: newStrategy.profitLoss?.isWin,
        takeProfitReached: newStrategy.profitLoss?.takeProfitReached,
        takeProfitMinutes: newStrategy.profitLoss?.takeProfitMinutes,
      };

      // 获取15分钟内的其他策略用于更新
      const now = Date.now();
      const fifteenMinutes = 15 * 60 * 1000;
      const recentStrategies = allStrategies
        .filter(s => {
          const age = now - (s.timestamp || 0);
          return age <= fifteenMinutes && s.timestamp !== newStrategy.timestamp && s.tradingAdvice;
        })
        .map(s => ({
          timestamp: s.timestamp || 0,
          model: s.model || 'unknown',
          action: s.tradingAdvice.action,
          confidence: s.tradingAdvice.confidence,
          riskLevel: s.tradingAdvice.riskLevel,
          entryPrice: s.tradingAdvice.entryPrice,
          stopLoss: s.tradingAdvice.stopLoss,
          takeProfit: s.tradingAdvice.takeProfit,
          lots: s.tradingAdvice.lots,
          londonPricePrediction15min: s.tradingAdvice.londonPricePrediction15min,
          pricePrediction15min: s.tradingAdvice.pricePrediction15min,
          analysisReason: s.analysisReason,
          profitLossPoints: s.profitLoss?.profitLossPoints,
          profitLossPercent: s.profitLoss?.profitLossPercent,
          isWin: s.profitLoss?.isWin,
          takeProfitReached: s.profitLoss?.takeProfitReached,
          takeProfitMinutes: s.profitLoss?.takeProfitMinutes,
        }));

      const requestData = {
        newPrediction: newPredictionData,
        recentPredictions: recentStrategies
      };

      await apiClient.post('/api/data/save-prediction', requestData);
      console.log('[保存预测] 预测数据已保存到后端，更新了', recentStrategies.length, '条历史数据');
    } catch (error) {
      console.error('[保存预测] 保存失败:', error);
      // 不抛出错误，避免影响主流程
    }
  },
};

