// 主应用组件
import { useEffect, useState, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './store/appStore';
import { useKlineData, useTradeTick, useDepth } from './hooks/useMarketData';
import { useDomesticWebSocket } from './hooks/useDomesticWebSocket';
import { useLondonWebSocket } from './hooks/useLondonWebSocket';
import { KlineChart } from './components/Charts/KlineChart';
import { DepthPanel } from './components/Depth/DepthPanel';
import { ArbitragePanel } from './components/Arbitrage/ArbitragePanel';
import { StrategyPanel } from './components/Strategy/StrategyPanel';
import { SYMBOLS, INTERVALS, UPDATE_INTERVALS, ENABLE_WEBSOCKET, ENABLE_LONDON_WEBSOCKET, ALLTICK_CONFIG } from './constants';
import type { KlineData } from './types';
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

  // 检查是否为白银期货交易时间
  const isSilverTradingHours = useCallback(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    // 白银期货交易时间
    // 日盘：9:00-11:30 和 13:30-15:00
    const morningStart = 9 * 60;         // 9:00
    const morningEnd = 11 * 60 + 30;     // 11:30
    const afternoonStart = 13 * 60 + 30; // 13:30
    const afternoonEnd = 15 * 60;        // 15:00

    // 夜盘：21:00-次日1:00（周一到周五）
    const nightStart = 21 * 60;          // 21:00
    const nightEnd = 25 * 60;            // 次日1:00（25:00表示次日1:00）

    const isDayTrading = (currentMinutes >= morningStart && currentMinutes <= morningEnd) ||
                        (currentMinutes >= afternoonStart && currentMinutes <= afternoonEnd);

    const isNightTrading = (dayOfWeek >= 1 && dayOfWeek <= 5) && // 周一到周五
                          ((currentMinutes >= nightStart) || (currentMinutes <= (nightEnd - 24 * 60))); // 21:00到次日1:00

    return isDayTrading || isNightTrading;
  }, []);
  
  // 选中的策略索引（用于在K线图上显示对应策略的价格线）
  const [selectedStrategyIndex, setSelectedStrategyIndex] = useState(0);

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
      const action = strategy.tradingAdvice.action;

      // 如果已经触达止盈，不再更新价格，保持锁定状态
      if (strategy.profitLoss?.takeProfitReached) {
        // 仅在超过15分钟时更新状态
        if (strategyAge >= fifteenMinutes && strategy.profitLoss.status === 'pending') {
          updateStrategyProfitLoss(index, {
            ...strategy.profitLoss,
            status: 'completed'
          });
        }
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

  // 自动触发AI策略分析（数据就绪后立即触发，无延迟）
  useEffect(() => {
    const triggerAnalysis = async () => {
      // 使用WebSocket数据优先，否则使用轮询数据
      const londonData = isLondonWebSocketActive && londonRealtimeKline.length > 0 
        ? londonRealtimeKline 
        : londonKline1mQuery.data;
      
      const domesticData = domesticRealtimeKline.length > 0 
        ? domesticRealtimeKline 
        : domesticKline1mQuery.data;
      
      // 检查所有数据是否已加载
      const hasAllData = 
        londonData && londonData.length > 0 &&
        londonKline15mQuery.data && londonKline15mQuery.data.length > 0 &&
        londonKlineDailyQuery.data && londonKlineDailyQuery.data.length > 0 &&
        domesticData && domesticData.length > 0 &&
        domesticKline15mQuery.data && domesticKline15mQuery.data.length > 0 &&
        domesticKlineDailyQuery.data && domesticKlineDailyQuery.data.length > 0;
      
      if (!hasAllData) {
        console.log('[自动分析] 等待数据加载完成...');
        return;
      }
      
      // 检查模型是否变化
      const modelChanged = lastAnalyzedModelRef.current !== null && 
                          lastAnalyzedModelRef.current !== selectedModel;
      
      // 检查是否已经分析过（避免首次重复）
      const hasAnalyzed = lastAnalysisTimeRef.current > 0;
      
      // 检查距离上次分析的时间间隔
      const now = Date.now();
      const timeSinceLastAnalysis = now - lastAnalysisTimeRef.current;
      const isTradingHours = isSilverTradingHours();
      const intervalMinutes = isTradingHours ? 1 : 10; // 交易时间1分钟，非交易时间10分钟
      const intervalMs = intervalMinutes * 60 * 1000;

      // 决定是否需要分析
      let shouldAnalyze = false;
      let reason = '';

      if (modelChanged) {
        // 模型变化，立即分析
        shouldAnalyze = true;
        reason = '模型切换';
        console.log('[自动分析] 🔄 模型已切换:', lastAnalyzedModelRef.current, '->', selectedModel);
      } else if (!hasAnalyzed) {
        // 首次分析
        shouldAnalyze = true;
        reason = '首次加载';
        console.log('[自动分析] ✅ 所有数据已就绪，首次分析...');
      } else if (timeSinceLastAnalysis >= intervalMs) {
        // 根据交易时间调整间隔
        shouldAnalyze = true;
        reason = isTradingHours ? '交易时间更新' : '非交易时间更新';
        console.log(`[自动分析] 🔄 距离上次分析已过${intervalMinutes}分钟，${reason}...`);
      }
      
      if (!shouldAnalyze) {
        return;
      }
      
      // 如果正在加载中，不重复触发
      if (isLoadingStrategy) {
        console.log('[自动分析] 正在分析中，跳过');
        return;
      }
      
      console.log(`[自动分析] 开始分析，原因: ${reason}`);
      
      // 更新记录
      lastAnalyzedModelRef.current = selectedModel;
      lastAnalysisTimeRef.current = now;
      
      try {
        setIsLoadingStrategy(true);
        
        const { analyzeStrategy } = await import('./services/strategyService');
        
        // 获取当前的历史策略用于分析参考
        const currentStrategies = useAppStore.getState().strategies;
        
        const result = await analyzeStrategy(
          selectedModel,
          londonData,
          londonKline15mQuery.data,
          londonKlineDailyQuery.data,
          domesticData,
          domesticKline15mQuery.data,
          domesticKlineDailyQuery.data,
          domesticDepthQuery.data || null,
          currentStrategies
        );
        
        // 添加新策略到历史记录（立即计算盈亏）
        const currentPrice = domesticTradeTickQuery.data?.price
          ? Number(domesticTradeTickQuery.data.price)
          : result.tradingAdvice.entryPrice;

        // 立即计算盈亏
        let initialProfitLossPoints = 0;
        let initialProfitLossPercent = 0;
        let initialIsWin: boolean | undefined = undefined;

        if (result.tradingAdvice.action !== '观望') {
          if (result.tradingAdvice.action === '买多') {
            initialProfitLossPoints = currentPrice - result.tradingAdvice.entryPrice;
          } else if (result.tradingAdvice.action === '卖空') {
            initialProfitLossPoints = result.tradingAdvice.entryPrice - currentPrice;
          }
          initialProfitLossPercent = (initialProfitLossPoints / result.tradingAdvice.entryPrice) * 100;
          initialIsWin = initialProfitLossPoints > 0;
        }

        const newStrategy = {
          ...result,
          timestamp: Date.now(),
          model: selectedModel,
          profitLoss: {
            actualPrice15min: currentPrice,
            profitLossPoints: initialProfitLossPoints,
            profitLossPercent: initialProfitLossPercent,
            isWin: initialIsWin,
            status: 'pending'
          }
        };
        
        addStrategy(newStrategy);
        
        // 保存预测数据到后端
        const { marketDataApi } = await import('./api/marketData');
        marketDataApi.savePrediction(newStrategy).catch(err => {
          console.error('[保存预测] 保存到后端失败:', err);
        });
        
        // 自动选中最新策略
        setSelectedStrategyIndex(0);
        
        console.log('[自动分析] ✅ 分析完成，已添加到策略历史，将实时跟踪15分钟盈亏');
      } catch (error: any) {
        console.error('[自动分析] ❌ 分析失败:', error);
        // 失败时也添加到历史，标记为错误
        addStrategy({ 
          error: error.message || '分析失败',
          timestamp: Date.now(),
          model: selectedModel
        } as any);
      } finally {
        setIsLoadingStrategy(false);
      }
    };
    
    // 数据就绪后立即触发，无延迟
    triggerAnalysis();
    
    // 设置定时器，每分钟检查一次是否需要更新
    const timer = setInterval(() => {
      triggerAnalysis();
    }, 30000); // 每30秒检查一次（函数内部会判断是否满足时间间隔）
    
    return () => clearInterval(timer);
  }, [
    londonRealtimeKline,
    londonKline1mQuery.data,
    londonKline15mQuery.data,
    londonKlineDailyQuery.data,
    domesticRealtimeKline,
    domesticKline1mQuery.data,
    domesticKline15mQuery.data,
    domesticKlineDailyQuery.data,
    domesticDepthQuery.data,
    isLondonWebSocketActive,
    isLoadingStrategy,
    selectedModel,
    addStrategy,
    isSilverTradingHours
  ]);

  return (
    <div className="container">
      <div className="main-content">
        {/* 左侧：伦敦现货白银K线图 */}
        <div className="left-panel">
          <KlineChart
            title="伦敦现货白银"
            data={isLondonWebSocketActive && londonRealtimeKline.length > 0 ? londonRealtimeKline : (londonKline1mQuery.data || [])}
            tradeTick={londonTradeTickQuery.data}
            status={londonConnectionStatus}
            height={600}
            isLoading={londonKline1mQuery.isLoading && !londonKline1mQuery.data}
          />
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

        {/* 中间：国内白银K线图 */}
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

        {/* 右侧：市场数据区域 */}
        <div className="right-panel">
          <DepthPanel 
            data={domesticDepthQuery.data || null} 
            isLoading={domesticDepthQuery.isLoading && !domesticDepthQuery.data} 
          />
          <ArbitragePanel
            londonData={londonKline1mQuery.data || []}
            domesticData={domesticRealtimeKline}
            isLoading={(londonKline1mQuery.isLoading && !londonKline1mQuery.data) || domesticRealtimeKline.length === 0}
          />
        </div>

        {/* 最右侧：交易策略区域 */}
        <div className="strategy-panel-container">
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
