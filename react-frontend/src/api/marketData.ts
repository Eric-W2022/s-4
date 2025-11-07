// 市场数据 API
import { apiClient } from './client';
import type { KlineData, TradeTickData, DepthData } from '../types';

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
};

