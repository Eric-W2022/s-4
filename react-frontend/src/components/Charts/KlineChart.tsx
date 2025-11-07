// K线图表组件
import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { createKlineChartOption, formatPrice } from '../../utils/chart';
import { isMarketOpen } from '../../utils/time';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import { StatusDot } from '../Common/StatusDot';
import type { KlineData, TradeTickData } from '../../types';
import './KlineChart.css';

interface KlineChartProps {
  title: string;
  data: KlineData[];
  tradeTick?: TradeTickData | null;
  status?: 'connected' | 'connecting' | 'error' | 'closed';
  height?: number;
  isLoading?: boolean;
  strategyPrices?: {
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  };
}

export const KlineChart: React.FC<KlineChartProps> = ({ title, data, tradeTick, status, height = 600, isLoading = false, strategyPrices }) => {
    // 判断是否是伦敦市场
    const isLondonMarket = title.includes('伦敦');
    
    // 判断是否在交易时间
    const isTradingTime = useMemo(() => {
      return isMarketOpen(isLondonMarket ? 'london' : 'domestic');
    }, [isLondonMarket]);
    
    // 计算实际显示的状态
    const displayStatus = useMemo(() => {
      if (!isTradingTime && !isLondonMarket) {
        return 'closed'; // 非交易时间显示黄色
      }
      return status || 'connecting';
    }, [isTradingTime, isLondonMarket, status]);
    
    // 图表实例引用
    const chartRef = useRef<ReactECharts>(null);
    // 保存上一次的数据，用于比较
    const prevDataRef = useRef<KlineData[]>([]);
    // 是否已初始化
    const isInitializedRef = useRef(false);
    
    // 使用 useMemo 缓存图表配置，避免不必要的重新计算
    const chartOption: EChartsOption = useMemo(() => {
      if (!data || data.length === 0) {
        return {};
      }
      return createKlineChartOption(data, title, strategyPrices);
    }, [data, title, strategyPrices]);

    // 智能更新图表：只在必要时更新，保持 dataZoom 状态
    useEffect(() => {
      if (!chartRef.current || !data || data.length === 0) return;
      
      const chartInstance = chartRef.current.getEchartsInstance();
      if (!chartInstance) return;
      
      const prevData = prevDataRef.current;
      
      // 首次加载 - 完全初始化
      if (!isInitializedRef.current) {
        chartInstance.setOption(chartOption, {
          notMerge: true, // 首次完全替换
          lazyUpdate: false,
        });
        prevDataRef.current = data;
        isInitializedRef.current = true;
        return;
      }
      
      // 后续更新 - 使用合并模式，保持 dataZoom 状态
      chartInstance.setOption(chartOption, {
        notMerge: false, // 合并模式，保持用户交互状态（dataZoom等）
        lazyUpdate: true, // 延迟更新，提高性能
      });
      
      prevDataRef.current = data;
    }, [chartOption, data, title]);

    // 计算涨跌信息
    const priceInfo = useMemo(() => {
      if (!data || data.length < 2) return null;
      const latest = data[data.length - 1];
      const previous = data[data.length - 2];
      const change = latest.c - previous.c;
      const changePercent = (change / previous.c) * 100;
      return {
        price: latest.c,
        change,
        changePercent,
        isPositive: change >= 0,
      };
    }, [data]);

    if (isLoading) {
      return (
        <div className="chart-wrapper">
          <div className="chart-header">
            <h2>{title}</h2>
          </div>
          <LoadingSpinner text="加载图表数据..." />
        </div>
      );
    }

    return (
      <div className="chart-wrapper">
        <div className="chart-header">
          <h2>
            {title}
            {tradeTick && (() => {
              let displayPrice = '';
              if (isLondonMarket) {
                const price = typeof tradeTick.price === 'string' ? parseFloat(tradeTick.price) : tradeTick.price;
                displayPrice = !isNaN(price) ? price.toFixed(3) : '-';
              } else {
                displayPrice = formatPrice(tradeTick.price);
              }
              return (
                <span className={`title-price ${priceInfo ? (priceInfo.isPositive ? 'positive' : 'negative') : ''}`}>
                  {displayPrice}
                </span>
              );
            })()}
          </h2>
        </div>
        {data && data.length > 0 ? (
          <ReactECharts
            ref={chartRef}
            option={chartOption}
            style={{ height: `${height}px`, width: '100%' }}
            notMerge={false}
            lazyUpdate={true}
            shouldSetOption={(prevProps, nextProps) => {
              // 首次加载时允许设置，之后由 useEffect 控制
              return !isInitializedRef.current;
            }}
            opts={{ renderer: 'canvas' }}
          />
        ) : (
          <div className="no-data">暂无数据</div>
        )}
      </div>
    );
};

