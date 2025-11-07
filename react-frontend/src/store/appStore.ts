// 全局状态管理
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ModelType, KlineData, TradeTickData, DepthData, StrategyAnalysis } from '../types';

interface AppState {
  // 选择的模型
  selectedModel: ModelType;
  setSelectedModel: (model: ModelType) => void;

  // 伦敦白银数据
  londonKline1m: KlineData[];
  londonKline15m: KlineData[];
  londonKlineDaily: KlineData[];
  londonTradeTick: TradeTickData | null;
  setLondonKline1m: (data: KlineData[]) => void;
  setLondonKline15m: (data: KlineData[]) => void;
  setLondonKlineDaily: (data: KlineData[]) => void;
  setLondonTradeTick: (data: TradeTickData | null) => void;

  // 国内白银数据
  domesticKline1m: KlineData[];
  domesticKline15m: KlineData[];
  domesticKlineDaily: KlineData[];
  domesticTradeTick: TradeTickData | null;
  domesticDepth: DepthData | null;
  setDomesticKline1m: (data: KlineData[]) => void;
  setDomesticKline15m: (data: KlineData[]) => void;
  setDomesticKlineDaily: (data: KlineData[]) => void;
  setDomesticTradeTick: (data: TradeTickData | null) => void;
  setDomesticDepth: (data: DepthData | null) => void;

  // 交易策略
  strategy: StrategyAnalysis | null;
  setStrategy: (data: StrategyAnalysis | null) => void;

  // 连接状态
  londonConnectionStatus: 'connected' | 'connecting' | 'error' | 'closed';
  domesticConnectionStatus: 'connected' | 'connecting' | 'error' | 'closed';
  setLondonConnectionStatus: (status: 'connected' | 'connecting' | 'error' | 'closed') => void;
  setDomesticConnectionStatus: (status: 'connected' | 'connecting' | 'error' | 'closed') => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // 初始状态
      selectedModel: 'deepseek-chat',
      londonKline1m: [],
      londonKline15m: [],
      londonKlineDaily: [],
      londonTradeTick: null,
      domesticKline1m: [],
      domesticKline15m: [],
      domesticKlineDaily: [],
      domesticTradeTick: null,
      domesticDepth: null,
      strategy: null,
      londonConnectionStatus: 'connecting',
      domesticConnectionStatus: 'connecting',

      // Actions
      setSelectedModel: (model) => set({ selectedModel: model }),
      setLondonKline1m: (data) => set({ londonKline1m: data }),
      setLondonKline15m: (data) => set({ londonKline15m: data }),
      setLondonKlineDaily: (data) => set({ londonKlineDaily: data }),
      setLondonTradeTick: (data) => set({ londonTradeTick: data }),
      setDomesticKline1m: (data) => set({ domesticKline1m: data }),
      setDomesticKline15m: (data) => set({ domesticKline15m: data }),
      setDomesticKlineDaily: (data) => set({ domesticKlineDaily: data }),
      setDomesticTradeTick: (data) => set({ domesticTradeTick: data }),
      setDomesticDepth: (data) => set({ domesticDepth: data }),
      setStrategy: (data) => set({ strategy: data }),
      setLondonConnectionStatus: (status) => set({ londonConnectionStatus: status }),
      setDomesticConnectionStatus: (status) => set({ domesticConnectionStatus: status }),
    }),
    { name: 'AppStore' }
  )
);

