// 主应用组件
import { useEffect, useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './store/appStore';
import { useKlineData, useTradeTick, useDepth } from './hooks/useMarketData';
import { useDomesticWebSocket } from './hooks/useDomesticWebSocket';
import { KlineChart } from './components/Charts/KlineChart';
import { DepthPanel } from './components/Depth/DepthPanel';
import { ArbitragePanel } from './components/Arbitrage/ArbitragePanel';
import { StrategyPanel } from './components/Strategy/StrategyPanel';
import { SYMBOLS, INTERVALS, UPDATE_INTERVALS, ENABLE_WEBSOCKET } from './constants';
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

  // WebSocket 回调
  const handleKlineUpdate = useCallback((kline: KlineData) => {
    setDomesticRealtimeKline(prev => {
      if (prev.length === 0) return [kline];
      const newData = [...prev];
      newData[newData.length - 1] = kline;
      return newData;
    });
  }, []);

  const handleInitialData = useCallback((klines: KlineData[]) => {
    console.log('[WebSocket] 收到初始数据，条数:', klines.length);
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

  // 建立 WebSocket 连接
  useDomesticWebSocket({
    enabled: ENABLE_WEBSOCKET,
    onKlineUpdate: handleKlineUpdate,
    onInitialData: handleInitialData,
    onStatusChange: handleStatusChange,
  });

  // 伦敦白银数据查询（每秒刷新）
  const londonKline1mQuery = useKlineData(
    SYMBOLS.LONDON,
    INTERVALS.ONE_MINUTE,
    100,
    1000 // 1秒刷新一次
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

  // 初始化 WebSocket 数据（仅在 WebSocket 未活跃且有轮询数据时）
  useEffect(() => {
    if (!isWebSocketActive && domesticKline1mQuery.data && domesticRealtimeKline.length === 0) {
      console.log('[初始化] 使用轮询数据初始化K线');
      setDomesticRealtimeKline(domesticKline1mQuery.data);
    }
  }, [isWebSocketActive, domesticKline1mQuery.data, domesticRealtimeKline.length]);

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

  // 自动触发AI策略分析
  useEffect(() => {
    const triggerAnalysis = async () => {
      // 检查所有数据是否已加载
      const hasAllData = 
        londonKline1mQuery.data && londonKline1mQuery.data.length > 0 &&
        londonKline15mQuery.data && londonKline15mQuery.data.length > 0 &&
        londonKlineDailyQuery.data && londonKlineDailyQuery.data.length > 0 &&
        domesticRealtimeKline.length > 0 &&
        domesticKline15mQuery.data && domesticKline15mQuery.data.length > 0 &&
        domesticKlineDailyQuery.data && domesticKlineDailyQuery.data.length > 0;
      
      if (!hasAllData) {
        console.log('[自动分析] 等待数据加载完成...');
        return;
      }
      
      // 如果已经有策略数据，不重复分析
      if (strategy) {
        console.log('[自动分析] 已有策略数据，跳过');
        return;
      }
      
      console.log('[自动分析] 所有数据已就绪，开始分析...');
      
      try {
        setStrategy({ isLoading: true } as any); // 设置加载状态
        
        const { analyzeStrategy } = await import('./services/strategyService');
        
        const result = await analyzeStrategy(
          selectedModel,
          londonKline1mQuery.data || [],
          londonKline15mQuery.data || [],
          londonKlineDailyQuery.data || [],
          domesticRealtimeKline,
          domesticKline15mQuery.data || [],
          domesticKlineDailyQuery.data || [],
          domesticDepthQuery.data || null
        );
        
        setStrategy({
          ...result,
          timestamp: Date.now(),
          model: selectedModel
        } as any);
        
        console.log('[自动分析] 分析完成');
      } catch (error: any) {
        console.error('[自动分析] 分析失败:', error);
        setStrategy(null);
      }
    };
    
    // 延迟5秒后触发分析，确保所有数据都已加载
    const timer = setTimeout(triggerAnalysis, 5000);
    
    return () => clearTimeout(timer);
  }, [
    londonKline1mQuery.data,
    londonKline15mQuery.data,
    londonKlineDailyQuery.data,
    domesticRealtimeKline,
    domesticKline15mQuery.data,
    domesticKlineDailyQuery.data,
    domesticDepthQuery.data,
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
            data={londonKline1mQuery.data || []}
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
