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

  // 单手交易状态（支持5个模型独立状态）
  singleHandPositions: Record<string, SingleHandPosition>; // key: modelId
  singleHandOperationsMap: Record<string, SingleHandOperation[]>; // key: modelId
  setSingleHandPosition: (modelId: string, position: SingleHandPosition) => void;
  addSingleHandOperation: (modelId: string, operation: SingleHandOperation) => void;
  deleteSingleHandOperation: (modelId: string, operationId: string) => void;
  clearSingleHandOperations: (modelId: string) => void;
  
  // 单手交易自动请求开关（每个模型独立控制）
  singleHandAutoRequest: Record<string, boolean>; // key: modelId, value: 是否自动请求
  setSingleHandAutoRequest: (modelId: string, enabled: boolean) => void;
  
  // 每个模型选择的AI模型（每个模型独立选择）
  singleHandModels: Record<string, ModelType>; // key: modelId, value: 选择的模型
  setSingleHandModel: (modelId: string, model: ModelType) => void;

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

// 从localStorage加载单手交易持仓（按模型ID）
const loadSingleHandPositions = (): Record<string, SingleHandPosition> => {
  const positions: Record<string, SingleHandPosition> = {};
  const modelIds = ['model1', 'model2', 'model3', 'model4', 'model5']; // 5个模型的ID
  
  modelIds.forEach(modelId => {
    try {
      const saved = localStorage.getItem(`singleHandPosition_${modelId}`);
      if (saved) {
        const position = JSON.parse(saved);
        console.log(`[Store] 从localStorage加载${modelId}单手持仓:`, position.hasPosition ? '有持仓' : '无持仓');
        positions[modelId] = position;
      } else {
        positions[modelId] = { hasPosition: false };
      }
    } catch (error) {
      console.error(`[Store] 加载${modelId}单手持仓失败:`, error);
      positions[modelId] = { hasPosition: false };
    }
  });
  
  return positions;
};

// 从localStorage加载单手交易操作记录（按模型ID）
const loadSingleHandOperationsMap = (): Record<string, SingleHandOperation[]> => {
  const operationsMap: Record<string, SingleHandOperation[]> = {};
  const modelIds = ['model1', 'model2', 'model3', 'model4', 'model5']; // 5个模型的ID
  
  modelIds.forEach(modelId => {
    try {
      const saved = localStorage.getItem(`singleHandOperations_${modelId}`);
      if (saved) {
        const operations = JSON.parse(saved);
        // 只保留最近的50条
        const recentOperations = operations.slice(0, 50);
        console.log(`[Store] 从localStorage加载${modelId}单手操作记录，共`, operations.length, '条，保留', recentOperations.length, '条');
        
        // 如果数量超过50，更新localStorage
        if (operations.length > 50) {
          try {
            localStorage.setItem(`singleHandOperations_${modelId}`, JSON.stringify(recentOperations));
          } catch (error) {
            console.error(`[Store] 更新${modelId}单手操作记录失败:`, error);
          }
        }
        
        operationsMap[modelId] = recentOperations;
      } else {
        operationsMap[modelId] = [];
      }
    } catch (error) {
      console.error(`[Store] 加载${modelId}单手操作记录失败:`, error);
      operationsMap[modelId] = [];
    }
  });
  
  return operationsMap;
};

// 从localStorage加载自动请求开关状态
const loadSingleHandAutoRequest = (): Record<string, boolean> => {
  const autoRequest: Record<string, boolean> = {};
  const modelIds = ['model1', 'model2', 'model3', 'model4', 'model5'];
  
  modelIds.forEach(modelId => {
    try {
      const saved = localStorage.getItem(`singleHandAutoRequest_${modelId}`);
      if (saved !== null) {
        autoRequest[modelId] = JSON.parse(saved);
      } else {
        // 默认：model1开启，其他关闭
        autoRequest[modelId] = modelId === 'model1';
      }
    } catch (error) {
      console.error(`[Store] 加载${modelId}自动请求开关失败:`, error);
      autoRequest[modelId] = modelId === 'model1';
    }
  });
  
  return autoRequest;
};

// 从localStorage加载每个模型选择的AI模型
const loadSingleHandModels = (): Record<string, ModelType> => {
  const models: Record<string, ModelType> = {};
  const modelIds = ['model1', 'model2', 'model3', 'model4', 'model5'];
  const defaultModels: Record<string, ModelType> = {
    model1: 'deepseek-chat',
    model2: 'kimi-k2-turbo-preview',
    model3: 'MiniMax-M2',
    model4: 'google-ai-studio/gemini-2.5-pro',
    model5: 'claude-sonnet-4-5',
  };
  
  modelIds.forEach(modelId => {
    try {
      const saved = localStorage.getItem(`singleHandModel_${modelId}`);
      if (saved) {
        models[modelId] = saved as ModelType;
      } else {
        models[modelId] = defaultModels[modelId];
      }
    } catch (error) {
      console.error(`[Store] 加载${modelId}模型选择失败:`, error);
      models[modelId] = defaultModels[modelId];
    }
  });
  
  return models;
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
      singleHandPositions: loadSingleHandPositions(),
      singleHandOperationsMap: loadSingleHandOperationsMap(),
      singleHandAutoRequest: loadSingleHandAutoRequest(),
      singleHandModels: loadSingleHandModels(),
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
      
      // 单手交易操作（支持多模型）
      setSingleHandPosition: (modelId, position) => {
        // 保存到localStorage（按模型ID分开）
        try {
          localStorage.setItem(`singleHandPosition_${modelId}`, JSON.stringify(position));
          console.log(`[Store] 保存${modelId}单手持仓到localStorage:`, position.hasPosition ? '有持仓' : '无持仓');
        } catch (error) {
          console.error(`[Store] 保存${modelId}单手持仓失败:`, error);
        }
        set((state) => ({
          singleHandPositions: {
            ...state.singleHandPositions,
            [modelId]: position
          }
        }));
      },
      addSingleHandOperation: (modelId, operation) => set((state) => {
        const currentOps = state.singleHandOperationsMap[modelId] || [];
        // 新操作添加到开头，保留最多50条
        const newOperations = [operation, ...currentOps].slice(0, 50);
        console.log(`[Store] 添加${modelId}单手操作记录，当前保留`, newOperations.length, '条（最多50条）');
        
        // 保存到localStorage（按模型ID分开）
        try {
          localStorage.setItem(`singleHandOperations_${modelId}`, JSON.stringify(newOperations));
        } catch (error) {
          console.error(`[Store] 保存${modelId}单手操作记录失败:`, error);
        }
        return {
          singleHandOperationsMap: {
            ...state.singleHandOperationsMap,
            [modelId]: newOperations
          }
        };
      }),
      deleteSingleHandOperation: (modelId, operationId) => set((state) => {
        const currentOps = state.singleHandOperationsMap[modelId] || [];
        const newOperations = currentOps.filter(op => op.id !== operationId);
        console.log(`[Store] 删除${modelId}单手操作记录，ID:`, operationId, '，剩余:', newOperations.length);
        
        // 保存到localStorage（按模型ID分开）
        try {
          localStorage.setItem(`singleHandOperations_${modelId}`, JSON.stringify(newOperations));
        } catch (error) {
          console.error(`[Store] 保存${modelId}单手操作记录失败:`, error);
        }
        return {
          singleHandOperationsMap: {
            ...state.singleHandOperationsMap,
            [modelId]: newOperations
          }
        };
      }),
      clearSingleHandOperations: (modelId) => {
        try {
          // 清空localStorage中的单手交易数据（按模型ID分开）
          localStorage.removeItem(`singleHandOperations_${modelId}`);
          localStorage.removeItem(`singleHandPosition_${modelId}`);
          console.log(`[Store] ✅ 已清除${modelId}单手交易数据（操作记录和持仓）`);
          
          // 验证是否清空成功
          const opsCheck = localStorage.getItem(`singleHandOperations_${modelId}`);
          const posCheck = localStorage.getItem(`singleHandPosition_${modelId}`);
          if (opsCheck || posCheck) {
            console.warn(`[Store] ⚠️ ${modelId}清空后仍有残留数据:`, { opsCheck, posCheck });
          } else {
            console.log(`[Store] ✅ 验证：${modelId} localStorage已完全清空`);
          }
        } catch (error) {
          console.error(`[Store] ❌ 清除${modelId}单手交易数据失败:`, error);
        }
        return set((state) => ({
          singleHandPositions: {
            ...state.singleHandPositions,
            [modelId]: { hasPosition: false }
          },
          singleHandOperationsMap: {
            ...state.singleHandOperationsMap,
            [modelId]: []
          }
        }));
      },
      setSingleHandAutoRequest: (modelId, enabled) => {
        // 保存到localStorage
        try {
          localStorage.setItem(`singleHandAutoRequest_${modelId}`, JSON.stringify(enabled));
          console.log(`[Store] ${modelId}自动请求开关:`, enabled ? '开启' : '关闭');
        } catch (error) {
          console.error(`[Store] 保存${modelId}自动请求开关失败:`, error);
        }
        set((state) => ({
          singleHandAutoRequest: {
            ...state.singleHandAutoRequest,
            [modelId]: enabled
          }
        }));
      },
      setSingleHandModel: (modelId, model) => {
        // 保存到localStorage
        try {
          localStorage.setItem(`singleHandModel_${modelId}`, model);
          console.log(`[Store] ${modelId}选择模型:`, model);
        } catch (error) {
          console.error(`[Store] 保存${modelId}模型选择失败:`, error);
        }
        set((state) => ({
          singleHandModels: {
            ...state.singleHandModels,
            [modelId]: model
          }
        }));
      },
      
      setLondonConnectionStatus: (status) => set({ londonConnectionStatus: status }),
      setDomesticConnectionStatus: (status) => set({ domesticConnectionStatus: status }),
    }),
    { name: 'AppStore' }
  )
);

