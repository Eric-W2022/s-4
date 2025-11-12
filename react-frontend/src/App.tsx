// 主应用组件
import { useEffect, useState, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './store/appStore';
import { useKlineData, useTradeTick, useDepth } from './hooks/useMarketData';
import { useDomesticWebSocket } from './hooks/useDomesticWebSocket';
import { useLondonWebSocket } from './hooks/useLondonWebSocket';
import { KlineChart } from './components/Charts/KlineChart';
import { DepthPanel } from './components/Depth/DepthPanel';
import { StrategyPanel } from './components/Strategy/StrategyPanel';
import { SingleHandTrader } from './components/SingleHand/SingleHandTrader';
import { SYMBOLS, INTERVALS, UPDATE_INTERVALS, ENABLE_WEBSOCKET, ENABLE_LONDON_WEBSOCKET, ALLTICK_CONFIG } from './constants';
import type { KlineData, SingleHandPosition, SingleHandOperation, SingleHandDecision } from './types';
import './App.css';

// 创建 React Query 客户端
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 3,
      staleTime: 5000,
    },
  },
});

function AppContent() {
  const {
    selectedModel,
    setSelectedModel,
    setLondonKline1m,
    setLondonKline15m,
    setLondonKlineDaily,
    setLondonTradeTick,
    setDomesticKline1m,
    setDomesticKline15m,
    setDomesticKlineDaily,
    setDomesticTradeTick,
    setDomesticDepth,
    setLondonConnectionStatus,
    setDomesticConnectionStatus,
    londonConnectionStatus,
    domesticConnectionStatus,
    strategies,
    addStrategy,
    updateStrategyProfitLoss,
    clearStrategies,
    deleteStrategy,
    singleHandPositions,
    singleHandOperationsMap,
    setSingleHandPosition,
    addSingleHandOperation,
    deleteSingleHandOperation,
    singleHandAutoRequest,
    setSingleHandAutoRequest,
    singleHandModels,
    setSingleHandModel,
  } = useAppStore();

  // 国内白银实时K线数据（WebSocket）
  const [domesticRealtimeKline, setDomesticRealtimeKline] = useState<KlineData[]>([]);
  const [isWebSocketActive, setIsWebSocketActive] = useState(false);

  // 伦敦白银实时K线数据（AllTick WebSocket）
  const [londonRealtimeKline, setLondonRealtimeKline] = useState<KlineData[]>([]);
  const [isLondonWebSocketActive, setIsLondonWebSocketActive] = useState(false);

  // 记录上次使用的模型
  const lastAnalyzedModelRef = useRef<ModelType | null>(null);
  
  // 记录上次分析时间
  const lastAnalysisTimeRef = useRef<number>(0);

  // 当前是否正在加载策略
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false);

  // 单手交易加载状态和分析时间（每个模型独立）
  const [isLoadingSingleHand, setIsLoadingSingleHand] = useState<Record<string, boolean>>({
    model1: false,
    model2: false,
    model3: false,
    model4: false,
    model5: false,
  });
  const lastSingleHandAnalysisRef = useRef<Record<string, number>>({
    model1: 0,
    model2: 0,
    model3: 0,
    model4: 0,
    model5: 0,
  });
  
  // 5个模型的配置（从store获取每个模型选择的模型）
  const modelConfigs = [
    { id: 'model1', model: singleHandModels['model1'] || 'deepseek-chat' as ModelType },
    { id: 'model2', model: singleHandModels['model2'] || 'kimi-k2-turbo-preview' as ModelType },
    { id: 'model3', model: singleHandModels['model3'] || 'MiniMax-M2' as ModelType },
    { id: 'model4', model: singleHandModels['model4'] || 'google-ai-studio/gemini-2.5-pro' as ModelType },
    { id: 'model5', model: singleHandModels['model5'] || 'claude-sonnet-4-5' as ModelType },
  ];

  // Wake Lock 引用
  const wakeLockRef = useRef<any>(null);

  // 检查是否为白银期货交易时间
  const isSilverTradingHours = useCallback(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    // 白银期货交易时间
    // 日盘：9:00-10:15, 10:30-11:30 和 13:30-15:00
    const morningStart1 = 9 * 60;         // 9:00
    const morningEnd1 = 10 * 60 + 15;     // 10:15
    const morningStart2 = 10 * 60 + 30;   // 10:30
    const morningEnd2 = 11 * 60 + 30;     // 11:30
    const afternoonStart = 13 * 60 + 30;  // 13:30
    const afternoonEnd = 15 * 60;         // 15:00

    // 夜盘：21:00-次日2:30（周一到周五）
    const nightStart = 21 * 60;           // 21:00
    const nightEnd = 26 * 60 + 30;        // 次日2:30（26:30表示次日2:30）

    const isDayTrading = (currentMinutes >= morningStart1 && currentMinutes <= morningEnd1) ||
                        (currentMinutes >= morningStart2 && currentMinutes <= morningEnd2) ||
                        (currentMinutes >= afternoonStart && currentMinutes <= afternoonEnd);

    const isNightTrading = (dayOfWeek >= 1 && dayOfWeek <= 5) && // 周一到周五
                          ((currentMinutes >= nightStart) || (currentMinutes <= (nightEnd - 24 * 60))); // 21:00到次日2:30

    return isDayTrading || isNightTrading;
  }, []);
  
  // 选中的策略索引（用于在K线图上显示对应策略的价格线）
  const [selectedStrategyIndex, setSelectedStrategyIndex] = useState(0);

  // 交易时间防熄屏，非交易时间自动熄屏
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isSilverTradingHours()) {
          const wakeLock = await (navigator as any).wakeLock.request('screen');
          wakeLockRef.current = wakeLock;
          console.log('[屏幕保持] Wake Lock 已激活，交易时间屏幕不会熄灭');
          
          // 监听 wake lock 释放
          wakeLock.addEventListener('release', () => {
            console.log('[屏幕保持] Wake Lock 已释放');
          });
        }
      } catch (err: any) {
        console.error('[屏幕保持] Wake Lock 请求失败:', err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('[屏幕保持] Wake Lock 已手动释放，非交易时间允许自动熄屏');
        } catch (err) {
          console.error('[屏幕保持] Wake Lock 释放失败:', err);
        }
      }
    };

    // 在交易时间请求 wake lock，非交易时间释放
    if (isSilverTradingHours()) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // 每分钟检查一次交易时间状态
    const checkInterval = setInterval(() => {
      if (isSilverTradingHours() && !wakeLockRef.current) {
        requestWakeLock();
      } else if (!isSilverTradingHours() && wakeLockRef.current) {
        releaseWakeLock();
      }
    }, 60000); // 每分钟检查

    // 监听页面可见性变化，重新请求 wake lock
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isSilverTradingHours() && !wakeLockRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 清理
    return () => {
      clearInterval(checkInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isSilverTradingHours]);

  // 定期清理超过300条的策略
  useEffect(() => {
    const cleanupOldStrategies = () => {
      const currentStrategies = useAppStore.getState().strategies;
      
      // 只保留最近的300条
      const recentStrategies = currentStrategies.slice(0, 300);
      
      // 如果有策略被清理，更新状态
      if (recentStrategies.length < currentStrategies.length) {
        const removedCount = currentStrategies.length - recentStrategies.length;
        console.log(`[策略清理] 清理了${removedCount}条超出限制的策略，保留最新的300条`);
        
        // 直接更新localStorage和状态
        try {
          localStorage.setItem('strategies', JSON.stringify(recentStrategies));
        } catch (error) {
          console.error('[策略清理] 保存策略失败:', error);
        }
        
        // 更新状态
        useAppStore.setState({ strategies: recentStrategies });
        
        // 如果当前选中的策略被清理，重置选中索引
        if (selectedStrategyIndex >= recentStrategies.length) {
          setSelectedStrategyIndex(0);
        }
      }
    };
    
    // 每分钟检查一次
    const timer = setInterval(cleanupOldStrategies, 60000);
    
    // 立即执行一次清理
    cleanupOldStrategies();
    
    return () => clearInterval(timer);
  }, [selectedStrategyIndex]);

  // 国内白银 WebSocket 回调
  const handleKlineUpdate = useCallback((kline: KlineData) => {
    setDomesticRealtimeKline(prev => {
      if (prev.length === 0) return [kline];
      const newData = [...prev];
      newData[newData.length - 1] = kline;
      return newData;
    });
  }, []);

  const handleInitialData = useCallback((klines: KlineData[]) => {
    console.log('[国内WebSocket] 收到初始数据，条数:', klines.length);
    setDomesticRealtimeKline(klines);
    setIsWebSocketActive(true);
  }, []);

  const handleStatusChange = useCallback((status: 'connected' | 'connecting' | 'error' | 'closed') => {
    setDomesticConnectionStatus(status);
    // WebSocket断开时清除标记，重新使用轮询数据
    if (status === 'error' || status === 'closed') {
      setIsWebSocketActive(false);
    }
  }, [setDomesticConnectionStatus]);

  // 伦敦白银 WebSocket 回调
  const handleLondonKlineUpdate = useCallback((kline: KlineData) => {
    setLondonRealtimeKline(prev => {
      if (prev.length === 0) return [kline];
      const newData = [...prev];
      newData[newData.length - 1] = kline;
      return newData;
    });
  }, []);

  const handleLondonInitialData = useCallback((klines: KlineData[]) => {
    console.log('[伦敦WebSocket] 收到初始数据，条数:', klines.length);
    setLondonRealtimeKline(klines);
    setIsLondonWebSocketActive(true);
  }, []);

  const handleLondonTradeTickUpdate = useCallback((price: number, timestamp: number) => {
    // 更新实时价格
    setLondonTradeTick({
      price,
      change: 0, // AllTick不提供涨跌额
      changePercent: 0, // AllTick不提供涨跌幅
      timestamp,
    });
  }, [setLondonTradeTick]);

  const handleLondonStatusChange = useCallback((status: 'connected' | 'connecting' | 'error' | 'closed') => {
    setLondonConnectionStatus(status);
    // WebSocket断开时清除标记，重新使用轮询数据
    if (status === 'error' || status === 'closed') {
      setIsLondonWebSocketActive(false);
    }
  }, [setLondonConnectionStatus]);

  // 建立国内白银 WebSocket 连接
  useDomesticWebSocket({
    enabled: ENABLE_WEBSOCKET,
    onKlineUpdate: handleKlineUpdate,
    onInitialData: handleInitialData,
    onStatusChange: handleStatusChange,
  });

  // 建立伦敦白银 WebSocket 连接（AllTick）
  useLondonWebSocket({
    symbol: SYMBOLS.LONDON,
    wsUrl: ALLTICK_CONFIG.wsUrl,
    token: ALLTICK_CONFIG.token,
    enabled: ENABLE_LONDON_WEBSOCKET,
    onKlineUpdate: handleLondonKlineUpdate,
    onInitialData: handleLondonInitialData,
    onTradeTickUpdate: handleLondonTradeTickUpdate,
    onStatusChange: handleLondonStatusChange,
  });

  // 伦敦白银数据查询（WebSocket活跃时禁用轮询）
  const londonKline1mQuery = useKlineData(
    SYMBOLS.LONDON,
    INTERVALS.ONE_MINUTE,
    100,
    isLondonWebSocketActive ? false : UPDATE_INTERVALS.KLINE_1M // WebSocket活跃时禁用轮询，否则500ms轮询
  );
  const londonKline15mQuery = useKlineData(
    SYMBOLS.LONDON,
    INTERVALS.FIFTEEN_MINUTES,
    100,
    UPDATE_INTERVALS.KLINE_15M
  );
  const londonKlineDailyQuery = useKlineData(
    SYMBOLS.LONDON,
    INTERVALS.ONE_DAY,
    90,
    UPDATE_INTERVALS.KLINE_1D
  );
  const londonTradeTickQuery = useTradeTick(SYMBOLS.LONDON);

  // 国内白银数据查询（1分钟K线用作fallback）
  const domesticKline1mQuery = useKlineData(
    SYMBOLS.DOMESTIC,
    INTERVALS.ONE_MINUTE,
    100,
    isWebSocketActive ? false : 10000 // WebSocket活跃时禁用轮询，否则10秒轮询
  );
  const domesticKline15mQuery = useKlineData(
    SYMBOLS.DOMESTIC,
    INTERVALS.FIFTEEN_MINUTES,
    100,
    UPDATE_INTERVALS.KLINE_15M
  );
  const domesticKlineDailyQuery = useKlineData(
    SYMBOLS.DOMESTIC,
    INTERVALS.ONE_DAY,
    90,
    UPDATE_INTERVALS.KLINE_1D
  );
  const domesticTradeTickQuery = useTradeTick(SYMBOLS.DOMESTIC);
  const domesticDepthQuery = useDepth(SYMBOLS.DOMESTIC);

  // 实时更新策略盈亏（15分钟内的策略）
  useEffect(() => {
    if (!domesticTradeTickQuery.data?.price || strategies.length === 0) return;
    
    const currentPrice = Number(domesticTradeTickQuery.data.price);
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;

    // 使用当前的strategies快照，避免依赖问题
    const currentStrategies = useAppStore.getState().strategies;
    
    currentStrategies.forEach((strategy, index) => {
      // 跳过错误的策略
      if ((strategy as any).error) return;

      // 只更新15分钟内的策略
      const strategyAge = now - (strategy.timestamp || 0);
      if (strategyAge > fifteenMinutes) {
        // 超过15分钟，标记为已完成
        if (strategy.profitLoss?.status === 'pending') {
          updateStrategyProfitLoss(index, {
            ...strategy.profitLoss,
            status: 'completed'
          });
        }
        return;
      }

      // 对于观望策略，盈亏为0
      if (strategy.tradingAdvice?.action === '观望') {
        if (!strategy.profitLoss || strategy.profitLoss.profitLossPoints !== 0) {
          updateStrategyProfitLoss(index, {
            actualPrice15min: currentPrice,
            profitLossPoints: 0,
            profitLossPercent: 0,
            isWin: undefined,
            status: strategyAge >= fifteenMinutes ? 'completed' : 'pending'
          });
        }
        return;
      }

      // 计算交易策略的盈亏
      const entryPrice = strategy.tradingAdvice.entryPrice;
      const takeProfit = strategy.tradingAdvice.takeProfit;
      const stopLoss = strategy.tradingAdvice.stopLoss;
      const action = strategy.tradingAdvice.action;

      // 如果已经触达止盈或止损，不再更新价格，保持锁定状态
      if (strategy.profitLoss?.takeProfitReached || strategy.profitLoss?.stopLossReached) {
        // 仅在超过15分钟时更新状态
        if (strategyAge >= fifteenMinutes && strategy.profitLoss.status === 'pending') {
          updateStrategyProfitLoss(index, {
            ...strategy.profitLoss,
            status: 'completed'
          });
        }
        return;
      }

      // 检查是否触达止损价（优先检查止损）
      let stopLossReached = false;
      if (action === '买多') {
        // 买多：当前价格 <= 止损价
        stopLossReached = currentPrice <= stopLoss;
      } else if (action === '卖空') {
        // 卖空：当前价格 >= 止损价
        stopLossReached = currentPrice >= stopLoss;
      }

      // 如果触达止损，锁定价格并记录时间
      if (stopLossReached) {
        const stopLossMinutes = Math.round(strategyAge / 60000); // 转换为分钟
        const stopLossPoints = action === '买多' 
          ? stopLoss - entryPrice 
          : entryPrice - stopLoss;
        
        updateStrategyProfitLoss(index, {
          actualPrice15min: stopLoss,  // 锁定在止损价
          profitLossPoints: stopLossPoints,
          profitLossPercent: (stopLossPoints / entryPrice) * 100,
          isWin: false,  // 触达止损必然亏损
          status: 'completed',  // 立即标记为完成
          stopLossReached: true,
          stopLossPrice: currentPrice,  // 触达止损时的实际价格
          stopLossTime: now,
          stopLossMinutes
        });
        console.log(`[盈亏跟踪] 策略 #${index} 在${stopLossMinutes}分钟后触达止损价 ${stopLoss}`);
        return;
      }

      // 检查是否触达止盈价
      let takeProfitReached = false;
      if (action === '买多') {
        // 买多：当前价格 >= 止盈价
        takeProfitReached = currentPrice >= takeProfit;
      } else if (action === '卖空') {
        // 卖空：当前价格 <= 止盈价
        takeProfitReached = currentPrice <= takeProfit;
      }

      // 如果触达止盈，锁定价格并记录时间
      if (takeProfitReached) {
        const takeProfitMinutes = Math.round(strategyAge / 60000); // 转换为分钟
        const takeProfitPoints = action === '买多' 
          ? takeProfit - entryPrice 
          : entryPrice - takeProfit;
        
        updateStrategyProfitLoss(index, {
          actualPrice15min: takeProfit,  // 锁定在止盈价
          profitLossPoints: takeProfitPoints,
          profitLossPercent: (takeProfitPoints / entryPrice) * 100,
          isWin: true,  // 触达止盈必然盈利
          status: 'completed',  // 立即标记为完成
          takeProfitReached: true,
          takeProfitPrice: currentPrice,  // 触达止盈时的实际价格
          takeProfitTime: now,
          takeProfitMinutes
        });
        console.log(`[盈亏跟踪] 策略 #${index} 在${takeProfitMinutes}分钟后触达止盈价 ${takeProfit}`);
        return;
      }

      // 未触达止盈，正常计算盈亏
      let profitLossPoints = 0;
      if (action === '买多') {
        profitLossPoints = currentPrice - entryPrice;
      } else if (action === '卖空') {
        profitLossPoints = entryPrice - currentPrice;
      }

      const profitLossPercent = (profitLossPoints / entryPrice) * 100;
      const isWin = profitLossPoints > 0;

      // 检查是否有变化，避免无意义的更新
      const hasChanged =
        !strategy.profitLoss ||
        strategy.profitLoss.actualPrice15min !== currentPrice ||
        strategy.profitLoss.isWin !== isWin ||
        (strategyAge >= fifteenMinutes && strategy.profitLoss.status === 'pending');

      if (hasChanged) {
        updateStrategyProfitLoss(index, {
          actualPrice15min: currentPrice,
          profitLossPoints,
          profitLossPercent,
          isWin,
          status: strategyAge >= fifteenMinutes ? 'completed' : 'pending'
        });
      }
    });
  }, [domesticTradeTickQuery.data?.price, updateStrategyProfitLoss]);

  // 初始化国内 WebSocket 数据（仅在 WebSocket 未活跃且有轮询数据时）
  useEffect(() => {
    if (!isWebSocketActive && domesticKline1mQuery.data && domesticRealtimeKline.length === 0) {
      console.log('[初始化] 使用轮询数据初始化国内K线');
      setDomesticRealtimeKline(domesticKline1mQuery.data);
    }
  }, [isWebSocketActive, domesticKline1mQuery.data, domesticRealtimeKline.length]);

  // 初始化伦敦 WebSocket 数据（仅在 WebSocket 未活跃且有轮询数据时）
  useEffect(() => {
    if (!isLondonWebSocketActive && londonKline1mQuery.data && londonRealtimeKline.length === 0) {
      console.log('[初始化] 使用轮询数据初始化伦敦K线');
      setLondonRealtimeKline(londonKline1mQuery.data);
    }
  }, [isLondonWebSocketActive, londonKline1mQuery.data, londonRealtimeKline.length]);

  // 更新状态
  useEffect(() => {
    if (londonKline1mQuery.data) {
      setLondonKline1m(londonKline1mQuery.data);
      setLondonConnectionStatus('connected');
    } else if (londonKline1mQuery.isLoading) {
      setLondonConnectionStatus('connecting');
    } else if (londonKline1mQuery.isError) {
      setLondonConnectionStatus('error');
    }
  }, [londonKline1mQuery.data, londonKline1mQuery.isLoading, londonKline1mQuery.isError]);

  useEffect(() => {
    if (londonKline15mQuery.data) setLondonKline15m(londonKline15mQuery.data);
  }, [londonKline15mQuery.data]);

  useEffect(() => {
    if (londonKlineDailyQuery.data) setLondonKlineDaily(londonKlineDailyQuery.data);
  }, [londonKlineDailyQuery.data]);

  useEffect(() => {
    if (londonTradeTickQuery.data) setLondonTradeTick(londonTradeTickQuery.data);
  }, [londonTradeTickQuery.data]);

  useEffect(() => {
    if (domesticKline1mQuery.data) {
      setDomesticKline1m(domesticKline1mQuery.data);
      setDomesticConnectionStatus('connected');
    } else if (domesticKline1mQuery.isLoading) {
      setDomesticConnectionStatus('connecting');
    } else if (domesticKline1mQuery.isError) {
      setDomesticConnectionStatus('error');
    }
  }, [domesticKline1mQuery.data, domesticKline1mQuery.isLoading, domesticKline1mQuery.isError]);

  useEffect(() => {
    if (domesticKline15mQuery.data) setDomesticKline15m(domesticKline15mQuery.data);
  }, [domesticKline15mQuery.data]);

  useEffect(() => {
    if (domesticKlineDailyQuery.data) setDomesticKlineDaily(domesticKlineDailyQuery.data);
  }, [domesticKlineDailyQuery.data]);

  useEffect(() => {
    if (domesticTradeTickQuery.data) setDomesticTradeTick(domesticTradeTickQuery.data);
  }, [domesticTradeTickQuery.data]);

  useEffect(() => {
    if (domesticDepthQuery.data) setDomesticDepth(domesticDepthQuery.data);
  }, [domesticDepthQuery.data]);


  // 更新所有模型的实时盈亏
  useEffect(() => {
    if (!domesticTradeTickQuery.data?.price) return;
    
    const currentPrice = Number(domesticTradeTickQuery.data.price);
    const modelIds = ['model1', 'model2', 'model3', 'model4', 'model5'];
    
    modelIds.forEach(modelId => {
      const position = singleHandPositions[modelId] || { hasPosition: false };
      
      if (position.hasPosition) {
        const entryPrice = position.entryPrice || 0;
        const direction = position.direction;
        const maxPrice = Math.max(position.maxPrice || currentPrice, currentPrice);
        const minPrice = Math.min(position.minPrice || currentPrice, currentPrice);
        
        let profitLossPoints = 0;
        if (direction === '多') {
          profitLossPoints = currentPrice - entryPrice;
        } else if (direction === '空') {
          profitLossPoints = entryPrice - currentPrice;
        }
        const profitLossMoney = profitLossPoints * 15;
        
        let maxProfitPoints = 0;
        if (direction === '多') {
          maxProfitPoints = maxPrice - entryPrice;
        } else if (direction === '空') {
          maxProfitPoints = entryPrice - minPrice;
        }
        const maxProfitMoney = maxProfitPoints * 15;
        
        let drawdownPercent = 0;
        if (maxProfitPoints > 0) {
          drawdownPercent = ((maxProfitPoints - profitLossPoints) / maxProfitPoints) * 100;
        }
        
        if (position.currentPrice !== currentPrice ||
            position.profitLossPoints !== profitLossPoints ||
            position.maxPrice !== maxPrice ||
            position.minPrice !== minPrice) {
          setSingleHandPosition(modelId, {
            ...position,
            currentPrice,
            profitLossPoints,
            profitLossMoney,
            maxPrice,
            minPrice,
            maxProfitPoints,
            maxProfitMoney,
            drawdownPercent,
          });
        }
      } else {
        if (position.currentPrice !== currentPrice || position.profitLossPoints !== 0) {
          setSingleHandPosition(modelId, {
            hasPosition: false,
            currentPrice,
            profitLossPoints: 0,
            profitLossMoney: 0,
            maxPrice: 0,
            minPrice: 0,
            maxProfitPoints: 0,
            maxProfitMoney: 0,
            drawdownPercent: 0,
          });
        }
      }
    });
  }, [domesticTradeTickQuery.data?.price, singleHandPositions, setSingleHandPosition]);

  // 单手交易：执行AI决策（支持多模型）
  const executeSingleHandDecision = useCallback(async (modelId: string, model: ModelType, decision: SingleHandDecision, currentPrice: number) => {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const singleHandPosition = singleHandPositions[modelId] || { hasPosition: false };
    const singleHandOperations = singleHandOperationsMap[modelId] || [];
    
    if (decision.action === '开多' || decision.action === '开空') {
      // 开仓
      const direction = decision.action === '开多' ? '多' : '空';
      setSingleHandPosition(modelId, {
        hasPosition: true,
        direction,
        entryPrice: currentPrice,
        entryTime: Date.now(),
        currentPrice,
        profitLossPoints: 0,
        profitLossMoney: 0,
        maxPrice: currentPrice,
        minPrice: currentPrice,
        maxProfitPoints: 0,
        maxProfitMoney: 0,
        drawdownPercent: 0,
      });
      
      const newOperation: SingleHandOperation = {
        id: operationId,
        timestamp: Date.now(),
        action: decision.action,
        price: currentPrice,
        reason: decision.reason,
        reflection: decision.reflection,
        commission: 8,
        profitLossPoints: 0,
        profitLossMoney: 0,
        model: model,
        processingTime: decision.processingTime,
      };
      addSingleHandOperation(modelId, newOperation);
      
      const { marketDataApi } = await import('./api/marketData');
      marketDataApi.saveSingleHandOperation(modelId, newOperation).catch(err => {
        console.error(`[单手交易-${modelId}] 保存操作失败:`, err);
      });
      
      console.log(`[单手交易-${modelId}] ${decision.action} @ ${currentPrice}`);
    } else if (decision.action === '平仓' && singleHandPosition.hasPosition) {
      const profitLossPoints = singleHandPosition.profitLossPoints || 0;
      const profitLossMoney = singleHandPosition.profitLossMoney || 0;
      const commission = 8;
      const totalCommission = 16;
      const netProfit = profitLossMoney - totalCommission;
      
      const newOperation: SingleHandOperation = {
        id: operationId,
        timestamp: Date.now(),
        action: '平仓',
        price: currentPrice,
        reason: decision.reason,
        reflection: decision.reflection,
        profitLossPoints,
        profitLossMoney,
        commission,
        netProfit,
        model: model,
        processingTime: decision.processingTime,
      };
      addSingleHandOperation(modelId, newOperation);
      
      setSingleHandPosition(modelId, { hasPosition: false });
      
      const { marketDataApi } = await import('./api/marketData');
      marketDataApi.saveSingleHandOperation(modelId, newOperation).catch(err => {
        console.error(`[单手交易-${modelId}] 保存操作失败:`, err);
      });
      
      console.log(`[单手交易-${modelId}] 平仓 @ ${currentPrice}, 盈亏: ${profitLossPoints.toFixed(0)}点`);
    } else if (decision.action === '持有') {
      if (singleHandOperations.length >= 1 && singleHandOperations[0]?.action === '持有') {
        deleteSingleHandOperation(modelId, singleHandOperations[0].id);
      }
      
      const duration = singleHandPosition.entryTime 
        ? Math.round((Date.now() - singleHandPosition.entryTime) / 60000) 
        : 0;
      
      const newOperation: SingleHandOperation = {
        id: operationId,
        timestamp: Date.now(),
        action: '持有',
        price: currentPrice,
        reason: decision.reason,
        reflection: decision.reflection,
        profitLossPoints: singleHandPosition.profitLossPoints,
        profitLossMoney: singleHandPosition.profitLossMoney,
        duration,
        model: model,
        processingTime: decision.processingTime,
      };
      addSingleHandOperation(modelId, newOperation);
      
      const { marketDataApi } = await import('./api/marketData');
      marketDataApi.saveSingleHandOperation(modelId, newOperation).catch(err => {
        console.error(`[单手交易-${modelId}] 保存操作失败:`, err);
      });
    } else if (decision.action === '观望') {
      if (singleHandOperations.length >= 1 && singleHandOperations[0]?.action === '观望') {
        deleteSingleHandOperation(modelId, singleHandOperations[0].id);
      }
      
      const newOperation: SingleHandOperation = {
        id: operationId,
        timestamp: Date.now(),
        action: '观望',
        price: currentPrice,
        reason: decision.reason,
        reflection: decision.reflection,
        model: model,
        processingTime: decision.processingTime,
      };
      addSingleHandOperation(modelId, newOperation);
      
      const { marketDataApi } = await import('./api/marketData');
      marketDataApi.saveSingleHandOperation(modelId, newOperation).catch(err => {
        console.error(`[单手交易-${modelId}] 保存操作失败:`, err);
      });
    }
  }, [singleHandPositions, singleHandOperationsMap, setSingleHandPosition, addSingleHandOperation, deleteSingleHandOperation]);

  // 单手交易：自动触发AI决策（每个模型独立控制）
  useEffect(() => {
    const triggerSingleHandAnalysis = async (modelId: string, model: ModelType) => {
      // 检查该模型是否启用自动请求
      if (!singleHandAutoRequest[modelId]) {
        return;
      }
      
      // 检查是否在交易时间
      if (!isSilverTradingHours()) {
        return;
      }
      
      if (!domesticTradeTickQuery.data?.price) {
        return;
      }
      
      // 检查所有必需的数据是否就绪
      const londonData = isLondonWebSocketActive && londonRealtimeKline.length > 0 
        ? londonRealtimeKline 
        : londonKline1mQuery.data;
      
      const domesticData = domesticRealtimeKline.length > 0 
        ? domesticRealtimeKline 
        : domesticKline1mQuery.data;
      
      if (!londonData || !londonKline15mQuery.data || !londonKlineDailyQuery.data || 
          !domesticData || !domesticKline15mQuery.data || !domesticKlineDailyQuery.data) {
        return;
      }
      
      const now = Date.now();
      const timeSinceLastAnalysis = now - (lastSingleHandAnalysisRef.current[modelId] || 0);
      const oneMinute = 60 * 1000;
      
      // 首次或间隔1分钟
      if (lastSingleHandAnalysisRef.current[modelId] === 0 || timeSinceLastAnalysis >= oneMinute) {
        if (isLoadingSingleHand[modelId]) {
          return;
        }
        
        try {
          setIsLoadingSingleHand(prev => ({ ...prev, [modelId]: true }));
          lastSingleHandAnalysisRef.current[modelId] = now;
          
          const currentPrice = Number(domesticTradeTickQuery.data.price);
          const position = singleHandPositions[modelId] || { hasPosition: false };
          const operations = singleHandOperationsMap[modelId] || [];
          
          // 更新当前持仓价格
          const updatedPosition: SingleHandPosition = position.hasPosition
            ? { ...position, currentPrice }
            : position;
          
          const { analyzeSingleHandStrategy } = await import('./services/singleHandService');
          
          const decision = await analyzeSingleHandStrategy(
            model,
            londonData,
            londonKline15mQuery.data,
            londonKlineDailyQuery.data,
            domesticData,
            domesticKline15mQuery.data,
            domesticKlineDailyQuery.data,
            domesticDepthQuery.data || null,
            updatedPosition,
            operations,
            currentPrice
          );
          
          console.log(`[单手交易-${modelId}] AI决策: ${decision.action}, 信心度: ${decision.confidence}%`);
          
          // 执行决策
          executeSingleHandDecision(modelId, model, decision, currentPrice);
        } catch (error: any) {
          console.error(`[单手交易-${modelId}] 分析失败:`, error);
        } finally {
          setIsLoadingSingleHand(prev => ({ ...prev, [modelId]: false }));
        }
      }
    };
    
    // 为每个模型创建独立的定时器
    const timers: NodeJS.Timeout[] = [];
    
    // 使用store中的模型配置
    const modelIds = ['model1', 'model2', 'model3', 'model4', 'model5'];
    
    // 默认模型映射
    const defaultModels: Record<string, ModelType> = {
      model1: 'deepseek-chat',
      model2: 'kimi-k2-turbo-preview',
      model3: 'MiniMax-M2',
      model4: 'google-ai-studio/gemini-2.5-pro',
      model5: 'claude-sonnet-4-5',
    };
    
    modelIds.forEach((id) => {
      const currentModel = singleHandModels[id] || defaultModels[id];
      
      // 立即触发首次分析
      triggerSingleHandAnalysis(id, currentModel);
      
      // 每30秒检查一次
      const timer = setInterval(() => {
        const model = singleHandModels[id] || defaultModels[id];
        triggerSingleHandAnalysis(id, model);
      }, 30000);
      
      timers.push(timer);
    });
    
    return () => {
      timers.forEach(timer => clearInterval(timer));
    };
  }, [
    domesticTradeTickQuery.data?.price,
    singleHandPositions,
    singleHandOperationsMap,
    singleHandAutoRequest,
    singleHandModels,
    isLoadingSingleHand,
    executeSingleHandDecision,
    londonRealtimeKline,
    londonKline1mQuery.data,
    londonKline15mQuery.data,
    domesticRealtimeKline,
    domesticKline1mQuery.data,
    domesticKline15mQuery.data,
    domesticKlineDailyQuery.data,
    domesticDepthQuery.data,
    isSilverTradingHours,
    isLondonWebSocketActive,
  ]);

  // 【已禁用】自动触发AI策略分析
  // useEffect(() => {
  //   const triggerAnalysis = async () => {
  //     // 使用WebSocket数据优先，否则使用轮询数据
  //     const londonData = isLondonWebSocketActive && londonRealtimeKline.length > 0 
  //       ? londonRealtimeKline 
  //       : londonKline1mQuery.data;
      
  //     const domesticData = domesticRealtimeKline.length > 0 
  //       ? domesticRealtimeKline 
  //       : domesticKline1mQuery.data;
      
  //     // 检查所有数据是否已加载
  //     const hasAllData = 
  //       londonData && londonData.length > 0 &&
  //       londonKline15mQuery.data && londonKline15mQuery.data.length > 0 &&
  //       londonKlineDailyQuery.data && londonKlineDailyQuery.data.length > 0 &&
  //       domesticData && domesticData.length > 0 &&
  //       domesticKline15mQuery.data && domesticKline15mQuery.data.length > 0 &&
  //       domesticKlineDailyQuery.data && domesticKlineDailyQuery.data.length > 0;
      
  //     if (!hasAllData) {
  //       console.log('[自动分析] 等待数据加载完成...');
  //       return;
  //     }
      
  //     // 检查模型是否变化
  //     const modelChanged = lastAnalyzedModelRef.current !== null && 
  //                         lastAnalyzedModelRef.current !== selectedModel;
      
  //     // 检查是否已经分析过（避免首次重复）
  //     const hasAnalyzed = lastAnalysisTimeRef.current > 0;
      
  //     // 检查距离上次分析的时间间隔
  //     const now = Date.now();
  //     const timeSinceLastAnalysis = now - lastAnalysisTimeRef.current;
  //     const isTradingHours = isSilverTradingHours();
  //     const intervalMinutes = isTradingHours ? 1 : 10; // 交易时间1分钟，非交易时间10分钟
  //     const intervalMs = intervalMinutes * 60 * 1000;

  //     // 决定是否需要分析
  //     let shouldAnalyze = false;
  //     let reason = '';

  //     if (modelChanged) {
  //       // 模型变化，立即分析
  //       shouldAnalyze = true;
  //       reason = '模型切换';
  //       console.log('[自动分析] 🔄 模型已切换:', lastAnalyzedModelRef.current, '->', selectedModel);
  //     } else if (!hasAnalyzed) {
  //       // 首次分析
  //       shouldAnalyze = true;
  //       reason = '首次加载';
  //       console.log('[自动分析] ✅ 所有数据已就绪，首次分析...');
  //     } else if (timeSinceLastAnalysis >= intervalMs) {
  //       // 根据交易时间调整间隔
  //       shouldAnalyze = true;
  //       reason = isTradingHours ? '交易时间更新' : '非交易时间更新';
  //       console.log(`[自动分析] 🔄 距离上次分析已过${intervalMinutes}分钟，${reason}...`);
  //     }
      
  //     if (!shouldAnalyze) {
  //       return;
  //     }
      
  //     // 如果正在加载中，不重复触发
  //     if (isLoadingStrategy) {
  //       console.log('[自动分析] 正在分析中，跳过');
  //       return;
  //     }
      
  //     console.log(`[自动分析] 开始分析，原因: ${reason}`);
      
  //     // 更新记录
  //     lastAnalyzedModelRef.current = selectedModel;
  //     lastAnalysisTimeRef.current = now;
      
  //     try {
  //       setIsLoadingStrategy(true);
        
  //       const { analyzeStrategy } = await import('./services/strategyService');
        
  //       // 获取当前的历史策略用于分析参考
  //       const currentStrategies = useAppStore.getState().strategies;
        
  //       const result = await analyzeStrategy(
  //         selectedModel,
  //         londonData,
  //         londonKline15mQuery.data,
  //         londonKlineDailyQuery.data,
  //         domesticData,
  //         domesticKline15mQuery.data,
  //         domesticKlineDailyQuery.data,
  //         domesticDepthQuery.data || null,
  //         currentStrategies
  //       );
        
  //       // 添加新策略到历史记录（立即计算盈亏）
  //       const currentPrice = domesticTradeTickQuery.data?.price
  //         ? Number(domesticTradeTickQuery.data.price)
  //         : result.tradingAdvice.entryPrice;

  //       // 立即计算盈亏
  //       let initialProfitLossPoints = 0;
  //       let initialProfitLossPercent = 0;
  //       let initialIsWin: boolean | undefined = undefined;

  //       if (result.tradingAdvice.action !== '观望') {
  //         if (result.tradingAdvice.action === '买多') {
  //           initialProfitLossPoints = currentPrice - result.tradingAdvice.entryPrice;
  //         } else if (result.tradingAdvice.action === '卖空') {
  //           initialProfitLossPoints = result.tradingAdvice.entryPrice - currentPrice;
  //         }
  //         initialProfitLossPercent = (initialProfitLossPoints / result.tradingAdvice.entryPrice) * 100;
  //         initialIsWin = initialProfitLossPoints > 0;
  //       }

  //       const newStrategy = {
  //         ...result,
  //         timestamp: Date.now(),
  //         model: selectedModel,
  //         profitLoss: {
  //           actualPrice15min: currentPrice,
  //           profitLossPoints: initialProfitLossPoints,
  //           profitLossPercent: initialProfitLossPercent,
  //           isWin: initialIsWin,
  //           status: 'pending'
  //         }
  //       };
        
  //       // 如果新策略是观望，并且前1条也是观望，删除前面的一条
  //       if (result.tradingAdvice.action === '观望') {
  //         const currentStrategies = useAppStore.getState().strategies;
  //         if (currentStrategies.length >= 1 &&
  //             currentStrategies[0]?.tradingAdvice?.action === '观望') {
  //           console.log('[策略优化] 连续观望策略，删除旧的观望记录');
  //           deleteStrategy(0); // 删除前面的一条（索引0）
  //         }
  //       }
        
  //       addStrategy(newStrategy);
        
  //       // 保存预测数据到后端（包含新预测和15分钟内的历史数据）
  //       const { marketDataApi } = await import('./api/marketData');
  //       const allStrategies = useAppStore.getState().strategies;
  //       marketDataApi.savePrediction(newStrategy, allStrategies).catch(err => {
  //         console.error('[保存预测] 保存到后端失败:', err);
  //       });
        
  //       // 自动选中最新策略
  //       setSelectedStrategyIndex(0);
        
  //       console.log('[自动分析] ✅ 分析完成，已添加到策略历史，将实时跟踪15分钟盈亏');
  //     } catch (error: any) {
  //       console.error('[自动分析] ❌ 分析失败:', error);
  //       // 分析失败时不保存到历史记录
  //     } finally {
  //       setIsLoadingStrategy(false);
  //     }
  //   };
    
  //   // 数据就绪后立即触发，无延迟
  //   triggerAnalysis();
    
  //   // 设置定时器，每分钟检查一次是否需要更新
  //   const timer = setInterval(() => {
  //     triggerAnalysis();
  //   }, 30000); // 每30秒检查一次（函数内部会判断是否满足时间间隔）
    
  //   return () => clearInterval(timer);
  // }, [
  //   londonRealtimeKline,
  //   londonKline1mQuery.data,
  //   londonKline15mQuery.data,
  //   londonKlineDailyQuery.data,
  //   domesticRealtimeKline,
  //   domesticKline1mQuery.data,
  //   domesticKline15mQuery.data,
  //   domesticKlineDailyQuery.data,
  //   domesticDepthQuery.data,
  //   isLondonWebSocketActive,
  //   isLoadingStrategy,
  //   selectedModel,
  //   addStrategy,
  //   isSilverTradingHours
  // ]);

  return (
    <div className="container">
      <div className="main-content">
        {/* 左上：1分钟K线图 */}
        <div className="kline-row">
        <div className="left-panel">
          <KlineChart
            title="伦敦现货白银"
            data={isLondonWebSocketActive && londonRealtimeKline.length > 0 ? londonRealtimeKline : (londonKline1mQuery.data || [])}
            tradeTick={londonTradeTickQuery.data}
            status={londonConnectionStatus}
            height={600}
            isLoading={londonKline1mQuery.isLoading && !londonKline1mQuery.data}
          />
        </div>

        <div className="middle-panel">
          <KlineChart
            title="国内白银主力"
            data={domesticRealtimeKline}
            tradeTick={domesticTradeTickQuery.data}
            status={domesticConnectionStatus}
            height={600}
            isLoading={domesticRealtimeKline.length === 0}
            strategyPrices={strategies.length > 0 && strategies[selectedStrategyIndex]?.tradingAdvice ? {
              entryPrice: strategies[selectedStrategyIndex].tradingAdvice.entryPrice,
              stopLoss: strategies[selectedStrategyIndex].tradingAdvice.stopLoss,
              takeProfit: strategies[selectedStrategyIndex].tradingAdvice.takeProfit,
            } : undefined}
          />
        </div>

          {/* 单手交易策略 - 5列 */}
        <div className="single-hand-panels">
          {modelConfigs.map(({ id, model }) => (
            <div key={id} className="single-hand-panel">
              <SingleHandTrader
                position={singleHandPositions[id] || { hasPosition: false }}
                operations={singleHandOperationsMap[id] || []}
                isLoading={isLoadingSingleHand[id] || false}
                selectedModel={singleHandModels[id] || model}
                onModelChange={(newModel) => {
                  setSingleHandModel(id, newModel);
                }}
                autoRequestEnabled={singleHandAutoRequest[id] ?? (id === 'model1')}
                onAutoRequestToggle={(enabled) => {
                  setSingleHandAutoRequest(id, enabled);
                }}
                onClearOperations={() => {
                  console.log(`[App] 用户点击清空${id}单手交易数据`);
                  useAppStore.getState().clearSingleHandOperations(id);
                  lastSingleHandAnalysisRef.current[id] = 0;
                  console.log(`[App] ✅ ${id}单手交易数据已清空`);
                }}
                onDeleteOperation={(operationId) => {
                  deleteSingleHandOperation(id, operationId);
                }}
                onManualTrigger={async () => {
                  if (!domesticTradeTickQuery.data?.price) {
                    console.log(`[单手交易-${id}] 手动触发：等待价格数据...`);
                    return;
                  }
                  
                  const londonData = isLondonWebSocketActive && londonRealtimeKline.length > 0 
                    ? londonRealtimeKline 
                    : londonKline1mQuery.data;
                  
                  const domesticData = domesticRealtimeKline.length > 0 
                    ? domesticRealtimeKline 
                    : domesticKline1mQuery.data;
                  
                  if (!londonData || !londonKline15mQuery.data || !londonKlineDailyQuery.data || 
                      !domesticData || !domesticKline15mQuery.data || !domesticKlineDailyQuery.data) {
                    console.log(`[单手交易-${id}] 手动触发：等待所有数据加载...`);
                    return;
                  }
                  
                  if (isLoadingSingleHand[id]) {
                    console.log(`[单手交易-${id}] 手动触发：正在分析中，跳过`);
                    return;
                  }
                  
                  try {
                    setIsLoadingSingleHand(prev => ({ ...prev, [id]: true }));
                    
                    const currentPrice = Number(domesticTradeTickQuery.data.price);
                    const position = singleHandPositions[id] || { hasPosition: false };
                    const operations = singleHandOperationsMap[id] || [];
                    const currentModel = singleHandModels[id] || model;
                    
                    const updatedPosition: SingleHandPosition = position.hasPosition
                      ? { ...position, currentPrice }
                      : position;
                    
                    const { analyzeSingleHandStrategy } = await import('./services/singleHandService');
                    
                    const decision = await analyzeSingleHandStrategy(
                      currentModel,
                      londonData,
                      londonKline15mQuery.data,
                      londonKlineDailyQuery.data,
                      domesticData,
                      domesticKline15mQuery.data,
                      domesticKlineDailyQuery.data,
                      domesticDepthQuery.data || null,
                      updatedPosition,
                      operations,
                      currentPrice
                    );
                    
                    console.log(`[单手交易-${id}] 手动触发AI决策: ${decision.action}, 信心度: ${decision.confidence}%`);
                    
                    executeSingleHandDecision(id, currentModel, decision, currentPrice);
                    lastSingleHandAnalysisRef.current[id] = Date.now();
                  } catch (error: any) {
                    console.error(`[单手交易-${id}] 手动触发分析失败:`, error);
                  } finally {
                    setIsLoadingSingleHand(prev => ({ ...prev, [id]: false }));
                  }
                }}
              />
            </div>
          ))}
        </div>

          {/* 【已隐藏】交易策略区域 */}
        {/* <div className="strategy-panel-container">
          <StrategyPanel
            strategies={strategies}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            isLoading={isLoadingStrategy}
            londonCurrentPrice={londonTradeTickQuery.data?.price ? Number(londonTradeTickQuery.data.price) : undefined}
            domesticCurrentPrice={domesticTradeTickQuery.data?.price ? Number(domesticTradeTickQuery.data.price) : undefined}
            selectedStrategyIndex={selectedStrategyIndex}
            onStrategySelect={setSelectedStrategyIndex}
            onClearStrategies={() => {
              clearStrategies();
              setSelectedStrategyIndex(0);
            }}
            onDeleteStrategy={(index) => {
              deleteStrategy(index);
              // 如果删除的是当前选中的策略，重置选中索引
              if (selectedStrategyIndex === index) {
                setSelectedStrategyIndex(0);
              } else if (selectedStrategyIndex > index) {
                // 如果删除的策略在当前选中之前，索引需要减1
                setSelectedStrategyIndex(selectedStrategyIndex - 1);
              }
            }}
          />
          </div> */}
        </div>

        {/* 盘口数据横排 */}
        <div className="depth-row">
          <DepthPanel 
            data={domesticDepthQuery.data || null}
            londonData={londonKline1mQuery.data || []}
            domesticData={domesticRealtimeKline}
            isLoading={domesticDepthQuery.isLoading && !domesticDepthQuery.data} 
          />
        </div>

        {/* 其他K线图 */}
        <div className="other-klines-row">
          <div className="left-panel">
            <KlineChart
              title="伦敦现货白银（15分钟K线）"
              data={londonKline15mQuery.data || []}
              height={400}
              isLoading={londonKline15mQuery.isLoading && !londonKline15mQuery.data}
            />
            <KlineChart
              title="伦敦现货白银（90日K线）"
              data={londonKlineDailyQuery.data || []}
              height={400}
              isLoading={londonKlineDailyQuery.isLoading && !londonKlineDailyQuery.data}
            />
          </div>

          <div className="middle-panel">
            <KlineChart
              title="国内白银主力（15分钟K线）"
              data={domesticKline15mQuery.data || []}
              height={400}
              isLoading={domesticKline15mQuery.isLoading && !domesticKline15mQuery.data}
            />
            <KlineChart
              title="国内白银主力（90日K线）"
              data={domesticKlineDailyQuery.data || []}
              height={400}
              isLoading={domesticKlineDailyQuery.isLoading && !domesticKlineDailyQuery.data}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
