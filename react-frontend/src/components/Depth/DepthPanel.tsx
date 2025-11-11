// 盘口深度面板组件
import React, { useMemo } from 'react';
import { formatPrice, formatVolume } from '../../utils/chart';
import { formatTime, formatTimestamp } from '../../utils/time';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import type { DepthData, KlineData } from '../../types';
import './DepthPanel.css';

interface DepthPanelProps {
  data: DepthData | null;
  londonData: KlineData[];
  domesticData: KlineData[];
  isLoading?: boolean;
}

export const DepthPanel: React.FC<DepthPanelProps> = React.memo(({ data, londonData, domesticData, isLoading }) => {
  // 计算买卖盘情绪
  const emotion = useMemo(() => {
    if (!data) return null;
    
    const totalAsk = data.ask_volume.reduce((sum, vol) => sum + parseFloat(vol || '0'), 0);
    const totalBid = data.bid_volume.reduce((sum, vol) => sum + parseFloat(vol || '0'), 0);
    const total = totalAsk + totalBid;
    
    if (total === 0) return null;
    
    const askPercent = (totalAsk / total) * 100;
    const bidPercent = (totalBid / total) * 100;
    
    // 确保百分比是有效数字
    if (isNaN(askPercent) || isNaN(bidPercent)) return null;
    
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (bidPercent > askPercent + 10) {
      trend = 'bullish'; // 多方优势
    } else if (askPercent > bidPercent + 10) {
      trend = 'bearish'; // 空方优势
    }
    
    return {
      totalAsk,
      totalBid,
      askPercent,
      bidPercent,
      trend,
    };
  }, [data]);

  // 计算套利指标（只追踪最后一根K线）
  const arbitrageMetrics = useMemo(() => {
    if (!londonData || londonData.length < 2 || !domesticData || domesticData.length < 2) {
      return null;
    }

    // 只取最后一根K线和前一根K线（用于计算变化率）
    const londonLatest = londonData[londonData.length - 1];
    const londonPrevious = londonData[londonData.length - 2];
    const domesticLatest = domesticData[domesticData.length - 1];
    const domesticPrevious = domesticData[domesticData.length - 2];

    // 计算相关性（基于最后一根K线的变化方向）
    const londonChange = ((londonLatest.c - londonPrevious.c) / londonPrevious.c) * 100;
    const domesticChange = ((domesticLatest.c - domesticPrevious.c) / domesticPrevious.c) * 100;
    
    // 简化的相关性：同向为正，反向为负
    const correlation = londonChange * domesticChange > 0 
      ? Math.min(Math.abs(londonChange), Math.abs(domesticChange)) / Math.max(Math.abs(londonChange), Math.abs(domesticChange))
      : -Math.min(Math.abs(londonChange), Math.abs(domesticChange)) / Math.max(Math.abs(londonChange), Math.abs(domesticChange));

    // 计算最后一根K线的振幅
    const londonAmplitude = ((londonLatest.h - londonLatest.l) / londonLatest.l) * 100;
    const domesticAmplitude = ((domesticLatest.h - domesticLatest.l) / domesticLatest.l) * 100;
    const amplitudeDiff = Math.abs(domesticAmplitude - londonAmplitude);

    // 计算套利得分 (0-100)
    const correlationScore = Math.abs(correlation) * 50; // 相关性贡献50分
    const amplitudeScore = Math.min(amplitudeDiff * 10, 50); // 振幅差贡献50分
    const score = Math.min(correlationScore + amplitudeScore, 100);

    // 判断套利方向
    const domesticStrength = domesticChange - londonChange;
    let direction: 'long' | 'short' | 'neutral';
    if (Math.abs(domesticStrength) < 0.01) {
      direction = 'neutral';
    } else if (domesticStrength > 0) {
      direction = 'short';
    } else {
      direction = 'long';
    }

    return {
      score: isNaN(score) ? 0 : Math.round(score),
      correlation: isNaN(correlation) ? 0 : Number(correlation.toFixed(3)),
      londonAmplitude: isNaN(londonAmplitude) ? 0 : Number(londonAmplitude.toFixed(3)),
      domesticAmplitude: isNaN(domesticAmplitude) ? 0 : Number(domesticAmplitude.toFixed(3)),
      amplitudeDiff: isNaN(amplitudeDiff) ? 0 : Number(amplitudeDiff.toFixed(3)),
      direction,
      domesticStrength: isNaN(domesticStrength) ? 0 : Number(domesticStrength.toFixed(3)),
    };
  }, [londonData, domesticData]);

  if (isLoading) {
    return (
      <div className="depth-panel">
        <LoadingSpinner text="加载盘口数据..." size="small" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="depth-panel">
        <div className="no-data">暂无盘口数据</div>
      </div>
    );
  }

  return (
    <div className="depth-panel">
      <div className="depth-content">
        {/* 第一列：买卖盘列表 */}
        <div className="depth-section-left">
        <div className="depth-columns">
          {/* 卖盘 */}
          <div className="depth-column depth-column-ask">
            <div className="depth-column-header">卖盘 (空方)</div>
            <table className="depth-side-table">
              <tbody>
                {data.ask_price.slice().reverse().map((price, idx) => {
                  const actualIdx = data.ask_price.length - 1 - idx;
                  return (
                    <tr key={`ask-${actualIdx}`}>
                      <td className="depth-label">卖{actualIdx + 1}</td>
                      <td className="depth-price-ask">{formatPrice(price)}</td>
                      <td className="depth-vol">{formatVolume(data.ask_volume[actualIdx])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 买盘 */}
          <div className="depth-column depth-column-bid">
            <div className="depth-column-header">买盘 (多方)</div>
            <table className="depth-side-table">
              <tbody>
                {data.bid_price.map((price, idx) => (
                  <tr key={`bid-${idx}`}>
                    <td className="depth-label">买{idx + 1}</td>
                    <td className="depth-price-bid">{formatPrice(price)}</td>
                    <td className="depth-vol">{formatVolume(data.bid_volume[idx])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>

        {/* 第二列：多空优势 */}
        <div className="depth-section-emotion">
          {emotion && (
          <div className="depth-emotion-bar">
            <div className="emotion-trend-indicator">
              <span className={`trend-badge trend-${emotion.trend}`}>
                {emotion.trend === 'bullish' ? '多方优势' : 
                 emotion.trend === 'bearish' ? '空方优势' : '多空平衡'}
              </span>
              <span className="trend-time">{formatTimestamp(Date.now(), 'HH:mm:ss')}</span>
            </div>
            <div className="emotion-bar-labels">
              <span className="emotion-label-ask">
                空方 {emotion.askPercent.toFixed(1)}%
                <small> ({formatVolume(emotion.totalAsk)})</small>
              </span>
              <span className="emotion-label-bid">
                多方 {emotion.bidPercent.toFixed(1)}%
                <small> ({formatVolume(emotion.totalBid)})</small>
              </span>
            </div>
            <div className="emotion-bar-container">
              <div 
                className="emotion-bar-ask" 
                style={{ width: `${emotion.askPercent}%` }}
              >
                {emotion.askPercent > 15 && (
                  <span className="emotion-bar-text">{emotion.askPercent.toFixed(0)}%</span>
                )}
              </div>
              <div 
                className="emotion-bar-bid" 
                style={{ width: `${emotion.bidPercent}%` }}
              >
                {emotion.bidPercent > 15 && (
                  <span className="emotion-bar-text">{emotion.bidPercent.toFixed(0)}%</span>
                )}
              </div>
            </div>
          </div>
          )}
        </div>

        {/* 第三列：扩展数据 */}
        <div className="depth-section-middle">
          {/* 扩展数据 */}
        {data.last_price && (
          <div className="depth-extended-data">
            <div className="extended-data-grid">
              <div className="extended-data-row">
                <div className="extended-data-item">
                  <div className="extended-label">最新价</div>
                  <div className="extended-value">{formatPrice(data.last_price)}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">昨结算</div>
                  <div className="extended-value">{data.pre_settlement ? formatPrice(data.pre_settlement) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">涨跌</div>
                  <div className={`extended-value ${
                    data.pre_settlement && data.last_price
                      ? (parseFloat(data.last_price) - parseFloat(data.pre_settlement) >= 0 ? 'price-up' : 'price-down')
                      : ''
                  }`}>
                    {data.pre_settlement && data.last_price
                      ? ((parseFloat(data.last_price) - parseFloat(data.pre_settlement)) >= 0 ? '+' : '') + 
                        formatPrice((parseFloat(data.last_price) - parseFloat(data.pre_settlement)).toString())
                      : (data.change ? (parseFloat(data.change) >= 0 ? '+' : '') + formatPrice(data.change) : '--')}
                  </div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">涨跌幅</div>
                  <div className={`extended-value ${
                    data.pre_settlement && data.last_price
                      ? (parseFloat(data.last_price) - parseFloat(data.pre_settlement) >= 0 ? 'price-up' : 'price-down')
                      : (parseFloat(data.change_percent || '0') >= 0 ? 'price-up' : 'price-down')
                  }`}>
                    {data.pre_settlement && data.last_price
                      ? ((parseFloat(data.last_price) - parseFloat(data.pre_settlement)) >= 0 ? '+' : '') + 
                        (((parseFloat(data.last_price) - parseFloat(data.pre_settlement)) / parseFloat(data.pre_settlement) * 100).toFixed(2)) + '%'
                      : (data.change_percent ? (parseFloat(data.change_percent) >= 0 ? '+' : '') + data.change_percent + '%' : '--')}
                  </div>
                </div>
              </div>
              <div className="extended-data-row">
                <div className="extended-data-item">
                  <div className="extended-label">开盘</div>
                  <div className="extended-value">{data.open ? formatPrice(data.open) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">最高</div>
                  <div className="extended-value high-price">{data.highest ? formatPrice(data.highest) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">最低</div>
                  <div className="extended-value low-price">{data.lowest ? formatPrice(data.lowest) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">成交量</div>
                  <div className="extended-value">{data.volume ? formatVolume(data.volume) : '--'}</div>
                </div>
              </div>
              <div className="extended-data-row">
                <div className="extended-data-item">
                  <div className="extended-label">持仓量</div>
                  <div className="extended-value">{data.open_interest ? formatVolume(data.open_interest) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">昨持仓</div>
                  <div className="extended-value">{data.pre_open_interest ? formatVolume(data.pre_open_interest) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">持仓差</div>
                  <div className={`extended-value ${
                    data.open_interest && data.pre_open_interest 
                      ? (parseFloat(data.open_interest) - parseFloat(data.pre_open_interest) >= 0 ? 'price-up' : 'price-down')
                      : ''
                  }`}>
                    {data.open_interest && data.pre_open_interest 
                      ? ((parseFloat(data.open_interest) - parseFloat(data.pre_open_interest)) >= 0 ? '+' : '') + 
                        formatVolume((parseFloat(data.open_interest) - parseFloat(data.pre_open_interest)).toString())
                      : '--'}
                  </div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">结算价</div>
                  <div className="extended-value">{data.settlement ? formatPrice(data.settlement) : '--'}</div>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* 第四列：套利机会指标 */}
        {arbitrageMetrics && (
          <div className="depth-section-right">
            {/* 套利得分 */}
            <div className="arbitrage-score-section">
              <div className="arbitrage-score-main">
                <span className="arbitrage-score-label">最后1根K线套利机会</span>
                <span 
                  className="arbitrage-score-value"
                  style={{ color: arbitrageMetrics.score >= 70 ? '#ef4444' : '#4ade80' }}
                >
                  {arbitrageMetrics.score}
                </span>
              </div>
              <div className="arbitrage-score-bar">
                <div
                  className="arbitrage-score-fill"
                  style={{
                    width: `${arbitrageMetrics.score}%`,
                    backgroundColor: arbitrageMetrics.score >= 70 ? '#ef4444' : '#4ade80',
                  }}
                />
              </div>
            </div>

            {/* 关键指标 */}
            <div className="arbitrage-metrics-row">
              <div className="arbitrage-metric-item">
                <div className="arbitrage-metric-label">相关性</div>
                <div 
                  className="arbitrage-metric-value"
                  style={{ color: Math.abs(arbitrageMetrics.correlation) > 0.7 ? '#4ade80' : '#fbbf24' }}
                >
                  {arbitrageMetrics.correlation.toFixed(2)}
                </div>
              </div>
              <div className="arbitrage-metric-item">
                <div className="arbitrage-metric-label">振幅差</div>
                <div className="arbitrage-metric-value">
                  {arbitrageMetrics.amplitudeDiff.toFixed(2)}%
                </div>
              </div>
              <div 
                className="arbitrage-metric-item"
                style={{
                  backgroundColor: arbitrageMetrics.score >= 40 && arbitrageMetrics.direction !== 'neutral' 
                    ? (arbitrageMetrics.direction === 'long' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(74, 222, 128, 0.2)')
                    : '#1a1f3a',
                  border: arbitrageMetrics.score >= 40 && arbitrageMetrics.direction !== 'neutral'
                    ? (arbitrageMetrics.direction === 'long' ? '2px solid #ef4444' : '2px solid #4ade80')
                    : 'none',
                  transition: 'all 0.3s ease'
                }}
              >
                <div className="arbitrage-metric-label">套利方向</div>
                <div 
                  className="arbitrage-metric-value"
                  style={{ 
                    color: arbitrageMetrics.direction === 'long' ? '#ef4444' : 
                           arbitrageMetrics.direction === 'short' ? '#4ade80' : '#9ca3af',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {arbitrageMetrics.direction === 'long' ? '多单' :
                   arbitrageMetrics.direction === 'short' ? '空单' : '观望'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

DepthPanel.displayName = 'DepthPanel';

