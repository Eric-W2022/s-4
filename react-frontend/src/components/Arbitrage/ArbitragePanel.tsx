// 套利追踪面板组件
import React, { useMemo } from 'react';
import { formatTime, formatTimestamp } from '../../utils/time';
import { formatVolume } from '../../utils/chart';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import type { KlineData, DepthData } from '../../types';
import './ArbitragePanel.css';

interface ArbitragePanelProps {
  londonData: KlineData[];
  domesticData: KlineData[];
  depthData: DepthData | null;
  isLoading?: boolean;
}

export const ArbitragePanel: React.FC<ArbitragePanelProps> = React.memo(
  ({ londonData, domesticData, depthData, isLoading }) => {
    // 计算买卖盘情绪
    const emotion = useMemo(() => {
      if (!depthData) return null;
      
      const totalAsk = depthData.ask_volume.reduce((sum, vol) => sum + parseFloat(vol || '0'), 0);
      const totalBid = depthData.bid_volume.reduce((sum, vol) => sum + parseFloat(vol || '0'), 0);
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
    }, [depthData]);

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

      // 计算价差
      const exchangeRate = 235; // 汇率
      const priceDiff = domesticLatest.c - londonLatest.c * exchangeRate;

      // 计算最后一根K线的振幅
      const londonAmplitude = ((londonLatest.h - londonLatest.l) / londonLatest.l) * 100;
      const domesticAmplitude = ((domesticLatest.h - domesticLatest.l) / domesticLatest.l) * 100;
      const amplitudeDiff = Math.abs(domesticAmplitude - londonAmplitude);

      // 计算套利得分 (0-100)
      const correlationScore = Math.abs(correlation) * 50; // 相关性贡献50分
      const amplitudeScore = Math.min(amplitudeDiff * 10, 50); // 振幅差贡献50分
      const score = Math.min(correlationScore + amplitudeScore, 100);

      // 判断套利方向（多单或空单）
      // 逻辑：
      // 1. 如果国内相对伦敦涨得更快/跌得更慢 -> 做空国内（空单）
      // 2. 如果国内相对伦敦涨得更慢/跌得更快 -> 做多国内（多单）
      const domesticStrength = domesticChange - londonChange; // 正值表示国内更强
      let direction: 'long' | 'short' | 'neutral';
      // 降低阈值到0.01%，使其更敏感
      if (Math.abs(domesticStrength) < 0.01) {
        direction = 'neutral'; // 差异太小，不建议套利
      } else if (domesticStrength > 0) {
        direction = 'short'; // 国内相对更强，做空国内
      } else {
        direction = 'long'; // 国内相对更弱，做多国内
      }

      return {
        score: isNaN(score) ? 0 : Math.round(score),
        correlation: isNaN(correlation) ? 0 : Number(correlation.toFixed(3)),
        priceDiff: isNaN(priceDiff) ? 0 : Number(priceDiff.toFixed(2)),
        londonAmplitude: isNaN(londonAmplitude) ? 0 : Number(londonAmplitude.toFixed(3)),
        domesticAmplitude: isNaN(domesticAmplitude) ? 0 : Number(domesticAmplitude.toFixed(3)),
        amplitudeDiff: isNaN(amplitudeDiff) ? 0 : Number(amplitudeDiff.toFixed(3)),
        direction,
        domesticStrength: isNaN(domesticStrength) ? 0 : Number(domesticStrength.toFixed(3)),
      };
    }, [londonData, domesticData]);

    if (isLoading) {
      return (
        <div className="arbitrage-panel">
          <LoadingSpinner text="分析中..." size="small" />
        </div>
      );
    }

    if (!arbitrageMetrics) {
      return (
        <div className="arbitrage-panel">
          <div className="no-data">数据不足，需要至少2根K线</div>
        </div>
      );
    }

    // 确定得分颜色
    const getScoreColor = (score: number) => {
      if (score >= 70) return '#ef4444'; // 高机会 - 红色
      return '#4ade80'; // 低机会 - 绿色
    };

    return (
      <div className="arbitrage-panel">
        <div className="arbitrage-content">
          {/* 买卖方优势 */}
          {emotion && (
            <div className="depth-emotion-bar">
              <div className="emotion-trend-indicator">
                <span className={`trend-badge trend-${emotion.trend}`}>
                  {emotion.trend === 'bullish' ? '多方优势' : 
                   emotion.trend === 'bearish' ? '空方优势' : '多空平衡'}
                </span>
                <span className="trend-time">{depthData?.datetime ? formatTimestamp(depthData.datetime, 'HH:mm:ss') : formatTimestamp(Date.now(), 'HH:mm:ss')}</span>
              </div>
              <div className="emotion-bar-labels">
                <span className="emotion-label-ask">
                  空方 {emotion.askPercent.toFixed(1)}%
                  <small> ({formatVolume(emotion.totalAsk.toString())})</small>
                </span>
                <span className="emotion-label-bid">
                  多方 {emotion.bidPercent.toFixed(1)}%
                  <small> ({formatVolume(emotion.totalBid.toString())})</small>
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

          {/* 套利得分 */}
          <div className="arbitrage-score-section">
            <div className="arbitrage-score-main">
              <span className="arbitrage-score-label">最后1根K线套利机会</span>
              <span 
                className="arbitrage-score-value"
                style={{ color: getScoreColor(arbitrageMetrics.score) }}
              >
                {arbitrageMetrics.score}
              </span>
            </div>
            <div className="arbitrage-score-bar">
              <div
                className="arbitrage-score-fill"
                style={{
                  width: `${arbitrageMetrics.score}%`,
                  backgroundColor: getScoreColor(arbitrageMetrics.score),
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
                  fontSize: arbitrageMetrics.score >= 40 && arbitrageMetrics.direction !== 'neutral' ? '18px' : '15px',
                  transition: 'all 0.3s ease'
                }}
              >
                {arbitrageMetrics.direction === 'long' ? '多单' :
                 arbitrageMetrics.direction === 'short' ? '空单' : '观望'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ArbitragePanel.displayName = 'ArbitragePanel';

