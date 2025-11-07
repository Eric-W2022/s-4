// 主应用组件
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './store/appStore';
import { useKlineData, useTradeTick, useDepth } from './hooks/useMarketData';
import { KlineChart } from './components/Charts/KlineChart';
import { DepthPanel } from './components/Depth/DepthPanel';
import { ArbitragePanel } from './components/Arbitrage/ArbitragePanel';
import { StrategyPanel } from './components/Strategy/StrategyPanel';
import { SYMBOLS, INTERVALS, UPDATE_INTERVALS } from './constants';
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
  } = useAppStore();

  // 伦敦白银数据查询
  const londonKline1mQuery = useKlineData(
    SYMBOLS.LONDON,
    INTERVALS.ONE_MINUTE,
    100,
    UPDATE_INTERVALS.KLINE_1M
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

  // 国内白银数据查询
  const domesticKline1mQuery = useKlineData(
    SYMBOLS.DOMESTIC,
    INTERVALS.ONE_MINUTE,
    100,
    UPDATE_INTERVALS.KLINE_1M
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

  return (
    <div className="container">
      <div className="main-content">
        {/* 左侧：伦敦现货白银K线图 */}
        <div className="left-panel">
          <KlineChart
            key={`london-1m-${londonKline1mQuery.dataUpdatedAt}`}
            title="伦敦现货白银"
            data={londonKline1mQuery.data || []}
            tradeTick={londonTradeTickQuery.data}
            status={londonConnectionStatus}
            height={600}
            isLoading={londonKline1mQuery.isLoading}
          />
          <KlineChart
            key={`london-15m-${londonKline15mQuery.dataUpdatedAt}`}
            title="伦敦现货白银（15分钟K线）"
            data={londonKline15mQuery.data || []}
            height={400}
            isLoading={londonKline15mQuery.isLoading}
          />
          <KlineChart
            key={`london-daily-${londonKlineDailyQuery.dataUpdatedAt}`}
            title="伦敦现货白银（90日K线）"
            data={londonKlineDailyQuery.data || []}
            height={400}
            isLoading={londonKlineDailyQuery.isLoading}
          />
        </div>

        {/* 中间：国内白银K线图 */}
        <div className="middle-panel">
          <KlineChart
            key={`domestic-1m-${domesticKline1mQuery.dataUpdatedAt}`}
            title="国内白银主力"
            data={domesticKline1mQuery.data || []}
            tradeTick={domesticTradeTickQuery.data}
            status={domesticConnectionStatus}
            height={600}
            isLoading={domesticKline1mQuery.isLoading}
          />
          <KlineChart
            key={`domestic-15m-${domesticKline15mQuery.dataUpdatedAt}`}
            title="国内白银主力（15分钟K线）"
            data={domesticKline15mQuery.data || []}
            height={400}
            isLoading={domesticKline15mQuery.isLoading}
          />
          <KlineChart
            key={`domestic-daily-${domesticKlineDailyQuery.dataUpdatedAt}`}
            title="国内白银主力（90日K线）"
            data={domesticKlineDailyQuery.data || []}
            height={400}
            isLoading={domesticKlineDailyQuery.isLoading}
          />
        </div>

        {/* 右侧：市场数据区域 */}
        <div className="right-panel">
          <DepthPanel 
            key={`depth-${domesticDepthQuery.dataUpdatedAt}`}
            data={domesticDepthQuery.data || null} 
            isLoading={domesticDepthQuery.isLoading} 
          />
          <ArbitragePanel
            key={`arbitrage-${londonKline1mQuery.dataUpdatedAt}-${domesticKline1mQuery.dataUpdatedAt}`}
            londonData={londonKline1mQuery.data || []}
            domesticData={domesticKline1mQuery.data || []}
            isLoading={londonKline1mQuery.isLoading || domesticKline1mQuery.isLoading}
          />
        </div>

        {/* 最右侧：交易策略区域 */}
        <div className="strategy-panel-container">
          <StrategyPanel
            strategy={strategy}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            isLoading={false}
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
