// 套利追踪面板组件
import React, { useMemo } from 'react';
import { formatPrice } from '../../utils/chart';
import { formatTime } from '../../utils/time';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import type { KlineData } from '../../types';
import './ArbitragePanel.css';

interface ArbitragePanelProps {
  londonData: KlineData[];
  domesticData: KlineData[];
  isLoading?: boolean;
}

export const ArbitragePanel: React.FC<ArbitragePanelProps> = React.memo(
  ({ londonData, domesticData, isLoading }) => {
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

      return {
        score: Math.round(score),
        correlation: Number(correlation.toFixed(3)),
        priceDiff: Number(priceDiff.toFixed(2)),
        londonAmplitude: Number(londonAmplitude.toFixed(3)),
        domesticAmplitude: Number(domesticAmplitude.toFixed(3)),
        amplitudeDiff: Number(amplitudeDiff.toFixed(3)),
      };
    }, [londonData, domesticData]);

    if (isLoading) {
      return (
        <div className="arbitrage-panel">
          <div className="arbitrage-header">
            <h3>套利追踪</h3>
          </div>
          <LoadingSpinner text="分析中..." size="small" />
        </div>
      );
    }

    if (!arbitrageMetrics) {
      return (
        <div className="arbitrage-panel">
          <div className="arbitrage-header">
            <h3>套利追踪（最后一根K线）</h3>
          </div>
          <div className="no-data">数据不足，需要至少2根K线</div>
        </div>
      );
    }

    // 判断是否有套利机会（振幅差 > 0.5%）
    const hasOpportunity = arbitrageMetrics.amplitudeDiff > 0.5;
    
    // 确定振幅差颜色
    const getAmplitudeDiffColor = (diff: number) => {
      if (diff > 0.5) return '#ef4444'; // 大于0.5% - 红色（有机会）
      if (diff > 0.3) return '#fbbf24'; // 0.3%-0.5% - 黄色（关注）
      return '#4ade80'; // 小于0.3% - 绿色（正常）
    };

    return (
      <div className="arbitrage-panel">
        <div className="arbitrage-header">
          <h3>套利机会监测</h3>
          <span className="arbitrage-update-time">{formatTime(Date.now())}</span>
        </div>

        <div className="arbitrage-content">
          {/* 振幅差异 - 核心指标 */}
          <div className="arbitrage-score-section">
            <div className="arbitrage-score-main">
              <span className="arbitrage-score-label">振幅差异</span>
              <span 
                className="arbitrage-score-value"
                style={{ 
                  color: getAmplitudeDiffColor(arbitrageMetrics.amplitudeDiff),
                  fontSize: '2.5rem',
                  fontWeight: 'bold'
                }}
              >
                {arbitrageMetrics.amplitudeDiff.toFixed(3)}%
              </span>
            </div>
            <div className="arbitrage-score-bar">
              <div
                className="arbitrage-score-fill"
                style={{
                  width: `${Math.min(arbitrageMetrics.amplitudeDiff * 100, 100)}%`,
                  backgroundColor: getAmplitudeDiffColor(arbitrageMetrics.amplitudeDiff),
                }}
              />
            </div>
          </div>

          {/* 两市场振幅对比 */}
          <div className="arbitrage-metrics-row">
            <div className="arbitrage-metric-item">
              <div className="arbitrage-metric-label">伦敦振幅</div>
              <div className="arbitrage-metric-value">
                {arbitrageMetrics.londonAmplitude.toFixed(3)}%
              </div>
            </div>
            <div className="arbitrage-metric-item">
              <div className="arbitrage-metric-label">国内振幅</div>
              <div className="arbitrage-metric-value">
                {arbitrageMetrics.domesticAmplitude.toFixed(3)}%
              </div>
            </div>
            <div className="arbitrage-metric-item">
              <div className="arbitrage-metric-label">相关性</div>
              <div 
                className="arbitrage-metric-value"
                style={{ color: Math.abs(arbitrageMetrics.correlation) > 0.7 ? '#4ade80' : '#fbbf24' }}
              >
                {arbitrageMetrics.correlation.toFixed(2)}
              </div>
            </div>
          </div>

          {/* 套利机会提示 */}
          {hasOpportunity && (
            <div className="arbitrage-opportunity" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444' }}>
              <div className="arbitrage-opportunity-title" style={{ color: '#ef4444' }}>
                🚨 套利机会出现！
              </div>
              <div className="arbitrage-opportunity-text">
                振幅差异超过 0.5%，两市场波动显著不同，建议关注交易机会
              </div>
            </div>
          )}
          
          {/* 正常状态提示 */}
          {!hasOpportunity && arbitrageMetrics.amplitudeDiff > 0.3 && (
            <div className="arbitrage-opportunity" style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)', borderColor: '#fbbf24' }}>
              <div className="arbitrage-opportunity-title" style={{ color: '#f59e0b' }}>
                ⚠️ 关注中
              </div>
              <div className="arbitrage-opportunity-text">
                振幅差异适中，继续观察
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ArbitragePanel.displayName = 'ArbitragePanel';

