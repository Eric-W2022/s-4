// 交易策略面板组件
import React, { useState } from 'react';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import { MODEL_OPTIONS } from '../../constants';
import type { StrategyAnalysis, ModelType } from '../../types';
import './StrategyPanel.css';

interface StrategyPanelProps {
  strategy: StrategyAnalysis | null;
  selectedModel: ModelType;
  onModelChange: (model: ModelType) => void;
  isLoading?: boolean;
  londonCurrentPrice?: number;
  domesticCurrentPrice?: number;
}

export const StrategyPanel: React.FC<StrategyPanelProps> = React.memo(
  ({ strategy, selectedModel, onModelChange, isLoading, londonCurrentPrice, domesticCurrentPrice }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const selectedModelLabel = MODEL_OPTIONS.find(
      (m) => m.value === selectedModel
    )?.label || 'DeepSeek';

    const handleModelSelect = (model: ModelType) => {
      onModelChange(model);
      setIsDropdownOpen(false);
    };

    return (
      <div className="strategy-panel">
        <div className="strategy-header">
          <h2>实时交易策略</h2>
          <div 
            className="model-selector-container"
            onMouseEnter={() => setIsDropdownOpen(true)}
            onMouseLeave={() => setIsDropdownOpen(false)}
          >
            <div className="model-selector-display">{selectedModelLabel}</div>
            <div className={`model-selector-dropdown ${isDropdownOpen ? 'open' : ''}`}>
              {MODEL_OPTIONS.slice(0, 6).map((option) => (
                <div
                  key={option.value}
                  className={`model-selector-option ${
                    selectedModel === option.value ? 'active' : ''
                  }`}
                  onClick={() => handleModelSelect(option.value as ModelType)}
                >
                  {option.label}
                </div>
              ))}
              <div className="model-gap" />
              {MODEL_OPTIONS.slice(6).map((option) => (
                <div
                  key={option.value}
                  className={`model-selector-option ${
                    selectedModel === option.value ? 'active' : ''
                  }`}
                  onClick={() => handleModelSelect(option.value as ModelType)}
                >
                  {option.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="strategy-content">
          {isLoading && (
            <div className="strategy-content-loading-overlay">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          {!isLoading && !strategy && (
            <div className="no-data">
              <div>等待市场数据...</div>
            </div>
          )}

          {!isLoading && strategy && (strategy as any).error && (
            <div className="no-data">
              <div style={{ color: '#ef4444' }}>分析失败: {(strategy as any).error}</div>
            </div>
          )}

          {!isLoading && strategy && strategy.tradingAdvice && (
            <div className="analysis-result">
              {/* 交易建议卡片 */}
              <div className="analysis-section trading-advice-card">
                {/* 操作建议 - 居中显示 */}
                <div className="advice-action-center">
                  <span 
                    className={`advice-action ${
                      strategy.tradingAdvice.action === '买多' ? 'buy' :
                      strategy.tradingAdvice.action === '卖空' ? 'sell' : 'hold'
                    }`}
                  >
                    {strategy.tradingAdvice.action}
                  </span>
                </div>
                
                {/* 信心度、风险、15分钟价格预测 - 4个等宽卡片一行显示 */}
                <div className="info-cards-row">
                  {/* 信心度 */}
                  <div className="info-card">
                    <div className="info-label">信心度</div>
                    <div 
                      className="info-value"
                      style={{
                        color: strategy.tradingAdvice.confidence >= 70
                          ? '#4ade80'
                          : strategy.tradingAdvice.confidence >= 40
                          ? '#fbbf24'
                          : '#ef4444'
                      }}
                    >
                      {strategy.tradingAdvice.confidence}%
                    </div>
                  </div>
                  
                  {/* 风险 */}
                  <div className="info-card">
                    <div className="info-label">风险</div>
                    <div
                      className="info-value"
                      style={{
                        color: strategy.tradingAdvice.riskLevel === '低'
                            ? '#4ade80'
                          : strategy.tradingAdvice.riskLevel === '中'
                            ? '#fbbf24'
                          : '#ef4444'
                      }}
                    >
                      {strategy.tradingAdvice.riskLevel}
                    </div>
                  </div>
                  
                  {/* 伦敦预测 */}
                  <div className="info-card">
                    <div className="info-label">伦敦</div>
                    <div 
                      className="info-value info-value-price"
                      style={{
                        color: londonCurrentPrice 
                          ? (strategy.tradingAdvice.londonPricePrediction15min > londonCurrentPrice ? '#ef4444' : '#22c55e')
                          : '#e0e0e0'
                      }}
                    >
                      {strategy.tradingAdvice.londonPricePrediction15min.toFixed(2)}
                    </div>
                  </div>
                  
                  {/* 国内预测 */}
                  <div className="info-card">
                    <div className="info-label">国内</div>
                    <div 
                      className="info-value info-value-price"
                      style={{
                        color: domesticCurrentPrice 
                          ? (strategy.tradingAdvice.pricePrediction15min > domesticCurrentPrice ? '#ef4444' : '#22c55e')
                          : '#e0e0e0'
                      }}
                    >
                      {strategy.tradingAdvice.pricePrediction15min.toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 价格建议 */}
              <div className="analysis-section price-suggestions">
                <h3>价格建议</h3>
                <div className="price-grid">
                  <div className="price-item">
                    <div className="price-label">入场价</div>
                    <div className="price-value entry">
                      {strategy.tradingAdvice.entryPrice.toFixed(0)}
                    </div>
                  </div>
                  <div className="price-item">
                    <div className="price-label">止损价</div>
                    <div className="price-value stop-loss">
                      {strategy.tradingAdvice.stopLoss.toFixed(0)}
                    </div>
                  </div>
                  <div className="price-item">
                    <div className="price-label">止盈价</div>
                    <div className="price-value take-profit">
                      {strategy.tradingAdvice.takeProfit.toFixed(0)}
                    </div>
                  </div>
                  <div className="price-item">
                    <div className="price-label">建议手数</div>
                    <div className="price-value lots">
                      {strategy.tradingAdvice.lots} 手
                    </div>
                  </div>
                </div>
              </div>

              {/* 分析理由 */}
              <div className="analysis-section analysis-reason">
                <h3>分析理由</h3>
                <p className="analysis-text">{strategy.analysisReason}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

StrategyPanel.displayName = 'StrategyPanel';

