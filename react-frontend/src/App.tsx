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
    strategy,
    setStrategy,
  } = useAppStore();

  // 国内白银实时K线数据（WebSocket）
  const [domesticRealtimeKline, setDomesticRealtimeKline] = useState<KlineData[]>([]);
  const [isWebSocketActive, setIsWebSocketActive] = useState(false);

  // 伦敦白银实时K线数据（AllTick WebSocket）
  const [londonRealtimeKline, setLondonRealtimeKline] = useState<KlineData[]>([]);
  const [isLondonWebSocketActive, setIsLondonWebSocketActive] = useState(false);

  // 防止自动分析无限循环的标记
  const hasAttemptedAnalysisRef = useRef(false);
  
  // 记录上次使用的模型
  const lastAnalyzedModelRef = useRef<ModelType | null>(null);
  
  // 记录上次分析时间
  const lastAnalysisTimeRef = useRef<number>(0);

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
      const oneMinute = 60000; // 60秒
      
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
      } else if (timeSinceLastAnalysis >= oneMinute) {
        // 距离上次分析超过1分钟
        shouldAnalyze = true;
        reason = '定时更新';
        console.log('[自动分析] 🔄 距离上次分析已过1分钟，自动更新...');
      }
      
      if (!shouldAnalyze) {
        return;
      }
      
      // 如果正在加载中，不重复触发
      if (strategy && (strategy as any).isLoading) {
        console.log('[自动分析] 正在分析中，跳过');
        return;
      }
      
      console.log(`[自动分析] 开始分析，原因: ${reason}`);
      
      // 更新记录
      lastAnalyzedModelRef.current = selectedModel;
      lastAnalysisTimeRef.current = now;
      
      try {
        setStrategy({ isLoading: true } as any); // 设置加载状态
        
        const { analyzeStrategy } = await import('./services/strategyService');
        
        const result = await analyzeStrategy(
          selectedModel,
          londonData,
          londonKline15mQuery.data,
          londonKlineDailyQuery.data,
          domesticData,
          domesticKline15mQuery.data,
          domesticKlineDailyQuery.data,
          domesticDepthQuery.data || null
        );
        
        setStrategy({
          ...result,
          timestamp: Date.now(),
          model: selectedModel
        } as any);
        
        console.log('[自动分析] ✅ 分析完成，已更新策略面板');
      } catch (error: any) {
        console.error('[自动分析] ❌ 分析失败:', error);
        // 失败时设置一个错误状态，而不是 null，避免触发重新分析
        setStrategy({ 
          isLoading: false, 
          error: error.message || '分析失败',
          timestamp: Date.now() 
        } as any);
      }
    };
    
    // 数据就绪后立即触发，无延迟
    triggerAnalysis();
    
    // 设置定时器，每分钟检查一次是否需要更新
    const timer = setInterval(() => {
      triggerAnalysis();
    }, 10000); // 每10秒检查一次（函数内部会判断是否满足1分钟）
    
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
    strategy,
    selectedModel,
    setStrategy
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
            strategyPrices={strategy && strategy.tradingAdvice ? {
              entryPrice: strategy.tradingAdvice.entryPrice,
              stopLoss: strategy.tradingAdvice.stopLoss,
              takeProfit: strategy.tradingAdvice.takeProfit,
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
            strategy={strategy}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            isLoading={!!(strategy && (strategy as any).isLoading === true)}
            londonCurrentPrice={londonTradeTickQuery.data?.price ? Number(londonTradeTickQuery.data.price) : undefined}
            domesticCurrentPrice={domesticTradeTickQuery.data?.price ? Number(domesticTradeTickQuery.data.price) : undefined}
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
