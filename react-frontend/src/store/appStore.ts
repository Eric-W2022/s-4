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

  // 交易策略（保留历史记录）
  strategies: StrategyAnalysis[];
  addStrategy: (data: StrategyAnalysis) => void;
  updateStrategyProfitLoss: (index: number, profitLoss: StrategyAnalysis['profitLoss']) => void;
  clearStrategies: () => void;
  deleteStrategy: (index: number) => void;

  // 连接状态
  londonConnectionStatus: 'connected' | 'connecting' | 'error' | 'closed';
  domesticConnectionStatus: 'connected' | 'connecting' | 'error' | 'closed';
  setLondonConnectionStatus: (status: 'connected' | 'connecting' | 'error' | 'closed') => void;
  setDomesticConnectionStatus: (status: 'connected' | 'connecting' | 'error' | 'closed') => void;
}

// 从localStorage加载保存的模型
const loadSelectedModel = (): ModelType => {
  try {
    const saved = localStorage.getItem('selectedModel');
    if (saved) {
      console.log('[Store] 从localStorage加载模型:', saved);
      return saved as ModelType;
    }
  } catch (error) {
    console.error('[Store] 加载模型失败:', error);
  }
  return 'deepseek-chat'; // 默认模型
};

// 从localStorage加载保存的策略历史
const loadStrategies = (): StrategyAnalysis[] => {
  try {
    const saved = localStorage.getItem('strategies');
    if (saved) {
      const strategies = JSON.parse(saved);
      // 过滤掉90分钟以前的策略
      const now = Date.now();
      const ninetyMinutes = 90 * 60 * 1000;
      const recentStrategies = strategies.filter((s: StrategyAnalysis) => {
        const age = now - (s.timestamp || 0);
        return age <= ninetyMinutes;
      });
      console.log('[Store] 从localStorage加载策略历史，共', strategies.length, '条，过滤后', recentStrategies.length, '条');
      
      // 如果过滤后数量变化，更新localStorage
      if (recentStrategies.length !== strategies.length) {
        try {
          localStorage.setItem('strategies', JSON.stringify(recentStrategies));
        } catch (error) {
          console.error('[Store] 更新策略历史失败:', error);
        }
      }
      
      return recentStrategies;
    }
  } catch (error) {
    console.error('[Store] 加载策略历史失败:', error);
  }
  return [];
};

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // 初始状态
      selectedModel: loadSelectedModel(),
      londonKline1m: [],
      londonKline15m: [],
      londonKlineDaily: [],
      londonTradeTick: null,
      domesticKline1m: [],
      domesticKline15m: [],
      domesticKlineDaily: [],
      domesticTradeTick: null,
      domesticDepth: null,
      strategies: loadStrategies(),
      londonConnectionStatus: 'connecting',
      domesticConnectionStatus: 'connecting',

      // Actions
      setSelectedModel: (model) => {
        // 保存到localStorage
        try {
          localStorage.setItem('selectedModel', model);
          console.log('[Store] 保存模型到localStorage:', model);
        } catch (error) {
          console.error('[Store] 保存模型失败:', error);
        }
        set({ selectedModel: model });
      },
      setLondonKline1m: (data) => set({ londonKline1m: data }),
      setLondonKline15m: (data) => set({ londonKline15m: data }),
      setLondonKlineDaily: (data) => set({ londonKlineDaily: data }),
      setLondonTradeTick: (data) => set({ londonTradeTick: data }),
      setDomesticKline1m: (data) => set({ domesticKline1m: data }),
      setDomesticKline15m: (data) => set({ domesticKline15m: data }),
      setDomesticKlineDaily: (data) => set({ domesticKlineDaily: data }),
      setDomesticTradeTick: (data) => set({ domesticTradeTick: data }),
      setDomesticDepth: (data) => set({ domesticDepth: data }),
      addStrategy: (data) => set((state) => {
        // 过滤掉90分钟以前的策略
        const now = Date.now();
        const ninetyMinutes = 90 * 60 * 1000;
        const recentStrategies = state.strategies.filter(s => {
          const age = now - (s.timestamp || 0);
          return age <= ninetyMinutes;
        });
        
        // 新策略添加到开头
        const newStrategies = [data, ...recentStrategies];
        console.log('[Store] 添加新策略，当前保留', newStrategies.length, '条（90分钟内）');
        
        // 保存到localStorage
        try {
          localStorage.setItem('strategies', JSON.stringify(newStrategies));
        } catch (error) {
          console.error('[Store] 保存策略历史失败:', error);
        }
        return { strategies: newStrategies };
      }),
      updateStrategyProfitLoss: (index, profitLoss) => set((state) => {
        const newStrategies = [...state.strategies];
        if (newStrategies[index]) {
          newStrategies[index] = {
            ...newStrategies[index],
            profitLoss
          };
          // 保存到localStorage
          try {
            localStorage.setItem('strategies', JSON.stringify(newStrategies));
          } catch (error) {
            console.error('[Store] 保存策略历史失败:', error);
          }
        }
        return { strategies: newStrategies };
      }),
      clearStrategies: () => {
        try {
          localStorage.removeItem('strategies');
        } catch (error) {
          console.error('[Store] 清除策略历史失败:', error);
        }
        return set({ strategies: [] });
      },
      deleteStrategy: (index) => set((state) => {
        const newStrategies = state.strategies.filter((_, i) => i !== index);
        console.log('[Store] 删除策略，索引:', index, '，剩余:', newStrategies.length);
        // 保存到localStorage
        try {
          localStorage.setItem('strategies', JSON.stringify(newStrategies));
        } catch (error) {
          console.error('[Store] 保存策略历史失败:', error);
        }
        return { strategies: newStrategies };
      }),
      setLondonConnectionStatus: (status) => set({ londonConnectionStatus: status }),
      setDomesticConnectionStatus: (status) => set({ domesticConnectionStatus: status }),
    }),
    { name: 'AppStore' }
  )
);

