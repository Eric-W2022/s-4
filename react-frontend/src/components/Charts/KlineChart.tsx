// K线图表组件
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { createKlineChartOption, formatPrice } from '../../utils/chart';
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
}

export const KlineChart: React.FC<KlineChartProps> = ({ title, data, tradeTick, status, height = 600, isLoading = false }) => {
    // 判断是否是伦敦市场
    const isLondonMarket = title.includes('伦敦');
    
    // 使用 useMemo 缓存图表配置，避免不必要的重新计算
    const chartOption: EChartsOption = useMemo(() => {
      if (!data || data.length === 0) {
        return {};
      }
      return createKlineChartOption(data, title);
    }, [data, title]);

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
            {status && <StatusDot status={status} />}
            {tradeTick && (
              <span className="title-price">
                {isLondonMarket 
                  ? (typeof tradeTick.price === 'string' ? parseFloat(tradeTick.price).toFixed(3) : tradeTick.price.toFixed(3))
                  : formatPrice(tradeTick.price)}
              </span>
            )}
          </h2>
          <div className="chart-info">
            {priceInfo && (
              <>
                <span className="price">
                  {isLondonMarket ? priceInfo.price.toFixed(3) : formatPrice(priceInfo.price)}
                </span>
                <span className={`change ${priceInfo.isPositive ? 'positive' : 'negative'}`}>
                  {priceInfo.isPositive ? '+' : ''}
                  {isLondonMarket ? priceInfo.change.toFixed(3) : formatPrice(priceInfo.change)} ({priceInfo.isPositive ? '+' : ''}
                  {priceInfo.changePercent.toFixed(2)}%)
                </span>
              </>
            )}
          </div>
        </div>
        {data && data.length > 0 ? (
          <ReactECharts
            option={chartOption}
            style={{ height: `${height}px`, width: '100%' }}
            notMerge={false}
            lazyUpdate={true}
            opts={{ renderer: 'canvas' }}
          />
        ) : (
          <div className="no-data">暂无数据</div>
        )}
      </div>
    );
};

