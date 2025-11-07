// 市场数据 Hooks
import { useQuery } from '@tanstack/react-query';
import { marketDataApi } from '../api/marketData';
import { UPDATE_INTERVALS } from '../constants';

// K线数据查询
export const useKlineData = (
  symbol: string,
  interval: string,
  limit: number = 100,
  refetchInterval?: number | false
) => {
  return useQuery({
    queryKey: ['kline', symbol, interval, limit],
    queryFn: () => marketDataApi.getKline(symbol, interval, limit),
    refetchInterval: refetchInterval === false ? false : (refetchInterval || UPDATE_INTERVALS.KLINE_1M),
    staleTime: 5000, // 数据5秒内视为新鲜
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};

// 实时价格查询
export const useTradeTick = (symbol: string) => {
  return useQuery({
    queryKey: ['trade-tick', symbol],
    queryFn: () => marketDataApi.getTradeTick(symbol),
    refetchInterval: UPDATE_INTERVALS.TRADE_TICK,
    staleTime: 500,
    retry: 3,
  });
};

// 盘口深度查询
export const useDepth = (symbol: string) => {
  return useQuery({
    queryKey: ['depth', symbol],
    queryFn: () => marketDataApi.getDepth(symbol),
    refetchInterval: UPDATE_INTERVALS.DEPTH,
    staleTime: 1000,
    retry: 3,
  });
};

