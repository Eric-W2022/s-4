// 全局状态管理
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { 
  ModelType, 
  KlineData, 
  TradeTickData, 
  DepthData, 
  StrategyAnalysis,
  SingleHandPosition,
  SingleHandOperation 
} from '../types';

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

  // 单手交易状态
  singleHandPosition: SingleHandPosition;
  singleHandOperations: SingleHandOperation[];
  setSingleHandPosition: (position: SingleHandPosition) => void;
  addSingleHandOperation: (operation: SingleHandOperation) => void;
  deleteSingleHandOperation: (operationId: string) => void;
  clearSingleHandOperations: () => void;

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
      // 只保留最近的300条
      const recentStrategies = strategies.slice(0, 300);
      console.log('[Store] 从localStorage加载策略历史，共', strategies.length, '条，保留', recentStrategies.length, '条');
      
      // 如果数量超过300，更新localStorage
      if (strategies.length > 300) {
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

// 从localStorage加载单手交易持仓
const loadSingleHandPosition = (): SingleHandPosition => {
  try {
    const saved = localStorage.getItem('singleHandPosition');
    if (saved) {
      const position = JSON.parse(saved);
      console.log('[Store] 从localStorage加载单手持仓:', position.hasPosition ? '有持仓' : '无持仓');
      return position;
    }
  } catch (error) {
    console.error('[Store] 加载单手持仓失败:', error);
  }
  return { hasPosition: false };
};

// 从localStorage加载单手交易操作记录
const loadSingleHandOperations = (): SingleHandOperation[] => {
  try {
    const saved = localStorage.getItem('singleHandOperations');
    if (saved) {
      const operations = JSON.parse(saved);
      // 只保留最近的50条
      const recentOperations = operations.slice(0, 50);
      console.log('[Store] 从localStorage加载单手操作记录，共', operations.length, '条，保留', recentOperations.length, '条');
      
      // 如果数量超过50，更新localStorage
      if (operations.length > 50) {
        try {
          localStorage.setItem('singleHandOperations', JSON.stringify(recentOperations));
        } catch (error) {
          console.error('[Store] 更新单手操作记录失败:', error);
        }
      }
      
      return recentOperations;
    }
  } catch (error) {
    console.error('[Store] 加载单手操作记录失败:', error);
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
      singleHandPosition: loadSingleHandPosition(),
      singleHandOperations: loadSingleHandOperations(),
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
        // 新策略添加到开头，保留最多300条
        const newStrategies = [data, ...state.strategies].slice(0, 300);
        console.log('[Store] 添加新策略，当前保留', newStrategies.length, '条（最多300条）');
        
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
      
      // 单手交易操作
      setSingleHandPosition: (position) => {
        // 保存到localStorage
        try {
          localStorage.setItem('singleHandPosition', JSON.stringify(position));
          console.log('[Store] 保存单手持仓到localStorage:', position.hasPosition ? '有持仓' : '无持仓');
        } catch (error) {
          console.error('[Store] 保存单手持仓失败:', error);
        }
        set({ singleHandPosition: position });
      },
      addSingleHandOperation: (operation) => set((state) => {
        // 新操作添加到开头，保留最多50条
        const newOperations = [operation, ...state.singleHandOperations].slice(0, 50);
        console.log('[Store] 添加单手操作记录，当前保留', newOperations.length, '条（最多50条）');
        
        // 保存到localStorage
        try {
          localStorage.setItem('singleHandOperations', JSON.stringify(newOperations));
        } catch (error) {
          console.error('[Store] 保存单手操作记录失败:', error);
        }
        return { singleHandOperations: newOperations };
      }),
      deleteSingleHandOperation: (operationId) => set((state) => {
        const newOperations = state.singleHandOperations.filter(op => op.id !== operationId);
        console.log('[Store] 删除单手操作记录，ID:', operationId, '，剩余:', newOperations.length);
        
        // 保存到localStorage
        try {
          localStorage.setItem('singleHandOperations', JSON.stringify(newOperations));
        } catch (error) {
          console.error('[Store] 保存单手操作记录失败:', error);
        }
        return { singleHandOperations: newOperations };
      }),
      clearSingleHandOperations: () => {
        try {
          localStorage.removeItem('singleHandOperations');
          localStorage.removeItem('singleHandPosition');
          console.log('[Store] 清除单手交易数据');
        } catch (error) {
          console.error('[Store] 清除单手交易数据失败:', error);
        }
        return set({ 
          singleHandOperations: [],
          singleHandPosition: { hasPosition: false }
        });
      },
      
      setLondonConnectionStatus: (status) => set({ londonConnectionStatus: status }),
      setDomesticConnectionStatus: (status) => set({ domesticConnectionStatus: status }),
    }),
    { name: 'AppStore' }
  )
);

