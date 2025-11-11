// 交易策略面板组件
import React, { useState } from 'react';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import { MODEL_OPTIONS } from '../../constants';
import type { StrategyAnalysis, ModelType } from '../../types';
import './StrategyPanel.css';

interface StrategyPanelProps {
  strategies: StrategyAnalysis[];
  selectedModel: ModelType;
  onModelChange: (model: ModelType) => void;
  isLoading?: boolean;
  londonCurrentPrice?: number;
  domesticCurrentPrice?: number;
  selectedStrategyIndex?: number;
  onStrategySelect?: (index: number) => void;
  onClearStrategies?: () => void;
  onDeleteStrategy?: (index: number) => void;
}

export const StrategyPanel: React.FC<StrategyPanelProps> = React.memo(
  ({ strategies, selectedModel, onModelChange, isLoading, londonCurrentPrice, domesticCurrentPrice, selectedStrategyIndex = 0, onStrategySelect, onClearStrategies, onDeleteStrategy }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const selectedModelLabel = MODEL_OPTIONS.find(
      (m) => m.value === selectedModel
    )?.label || 'DeepSeek';

    const handleModelSelect = (model: ModelType) => {
      onModelChange(model);
      setIsDropdownOpen(false);
    };

    // 格式化时间戳
    const formatTime = (timestamp?: number) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    };

    // 获取模型简称
    const getModelLabel = (modelValue?: string) => {
      if (!modelValue) return '';
      const model = MODEL_OPTIONS.find(m => m.value === modelValue);
      return model?.label || modelValue;
    };

    // 计算总体胜率和盈亏
    const calculateWinRate = () => {
      const now = Date.now();
      const thirtyMinutes = 30 * 60 * 1000;
      
      // 只统计最近30分钟内、有盈亏数据且不是观望的策略
      const tradingStrategies = strategies.filter(
        s => {
          const strategyAge = now - (s.timestamp || 0);
          return strategyAge <= thirtyMinutes &&
                 s.tradingAdvice?.action !== '观望' && 
                 s.profitLoss?.profitLossPoints !== undefined && 
                 s.profitLoss?.isWin !== undefined;
        }
      );
      if (tradingStrategies.length === 0) return null;
      
      const winCount = tradingStrategies.filter(s => s.profitLoss?.isWin).length;
      const winRate = (winCount / tradingStrategies.length) * 100;
      
      // 计算总盈亏点数（30分钟内的已统计在tradingStrategies中）
      const totalProfitLoss = tradingStrategies.reduce((sum, s) => {
        return sum + (s.profitLoss?.profitLossPoints || 0);
      }, 0);
      
      // 计算30分钟内的总手数（排除观望，使用同样的tradingStrategies）
      const totalLots = tradingStrategies.reduce((sum, s) => {
        return sum + (s.tradingAdvice?.lots || 0);
      }, 0);
      
      // 计算每手盈亏（基于30分钟内的数据）
      const profitLossPerLot = totalLots > 0 ? totalProfitLoss / totalLots : 0;
      
      return {
        total: tradingStrategies.length,
        winCount,
        loseCount: tradingStrategies.length - winCount,
        winRate,
        totalProfitLoss,
        totalLots,
        profitLossPerLot
      };
    };

    const winRateStats = calculateWinRate();

    return (
      <div className="strategy-panel">
        <div className="strategy-header">
          <div className="strategy-title-section">
            <h2>实时交易策略</h2>
            {strategies.length > 0 && (
              <button
                className="clear-strategies-btn"
                onClick={() => {
                  if (confirm('确定要清空所有策略历史吗？')) {
                    onClearStrategies?.();
                  }
                }}
                title="清空策略历史"
              >
                ✕
              </button>
            )}
          </div>
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

        {/* 胜率统计区域 */}
        {strategies.length > 0 && (
          <div className="win-rate-section">
            <div className="win-rate-cards">
              {winRateStats ? (
                <>
                  {/* 胜率卡片 */}
                  <div className="stats-card win-rate-card">
                    <div className="stats-card-label">胜率</div>
                    <div className={`stats-card-value ${winRateStats.winRate >= 60 ? 'high' : winRateStats.winRate >= 40 ? 'medium' : 'low'}`}>
                      {winRateStats.winRate.toFixed(1)}%
                    </div>
                    <div className="stats-card-detail">
                      {winRateStats.winCount}胜/{winRateStats.loseCount}负
                    </div>
                  </div>
                  
                  {/* 总盈亏卡片 */}
                  <div className="stats-card profit-loss-card">
                    <div className="stats-card-label">总盈亏</div>
                    <div className={`stats-card-value ${winRateStats.totalProfitLoss > 0 ? 'profit' : winRateStats.totalProfitLoss < 0 ? 'loss' : 'neutral'}`}>
                      {winRateStats.totalProfitLoss > 0 ? '+' : ''}{winRateStats.totalProfitLoss.toFixed(0)}
                    </div>
                    <div className="stats-card-detail">点</div>
                  </div>
                  
                  {/* 手数卡片 */}
                  <div className="stats-card lots-card">
                    <div className="stats-card-label">手数</div>
                    <div className="stats-card-value lots-value">
                      {winRateStats.totalLots}
                    </div>
                    <div className="stats-card-detail">30分钟内</div>
                  </div>
                  
                  {/* 每手盈亏卡片 */}
                  <div className="stats-card per-lot-card">
                    <div className="stats-card-label">每手盈亏</div>
                    <div className={`stats-card-value ${winRateStats.profitLossPerLot > 0 ? 'profit' : winRateStats.profitLossPerLot < 0 ? 'loss' : 'neutral'}`}>
                      {winRateStats.profitLossPerLot > 0 ? '+' : ''}{winRateStats.profitLossPerLot.toFixed(1)}
                    </div>
                    <div className="stats-card-detail">点/手</div>
                  </div>
                </>
              ) : (
                <div className="stats-card no-data-card">
                  <div className="stats-card-label">暂无数据</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="strategy-content">
          {isLoading && strategies.length === 0 && (
            <div className="strategy-content-loading-overlay">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          {!isLoading && strategies.length === 0 && (
            <div className="no-data">
              <div>等待市场数据...</div>
            </div>
          )}

          {strategies.length > 0 && strategies.map((strategy, index) => (
            <div 
              key={strategy.timestamp || index} 
              className={`strategy-item ${selectedStrategyIndex === index ? 'selected' : ''}`}
              onClick={() => onStrategySelect?.(index)}
              style={{ cursor: 'pointer' }}
            >
              {/* 策略头部信息 */}
              <div className="strategy-item-header">
                <span className="strategy-timestamp">{formatTime(strategy.timestamp)}</span>
                <button
                  className="delete-strategy-btn"
                  onClick={(e) => {
                    e.stopPropagation(); // 阻止事件冒泡，避免触发策略选择
                    onDeleteStrategy?.(index);
                  }}
                  title="删除此策略"
                >
                  ✕
                </button>
                <span className="strategy-model">{getModelLabel(strategy.model)}</span>
              </div>

              {/* 错误信息 */}
              {(strategy as any).error && (
                <div className="no-data">
                  <div style={{ color: '#ef4444' }}>分析失败: {(strategy as any).error}</div>
                </div>
              )}

              {/* 策略内容 */}
              {strategy.tradingAdvice && (
                <div className="analysis-result">
                      {/* 第一行：交易信号（左）+ 盈亏（右）*/}
                  <div className="signal-profit-row">
                    {/* 左侧：操作信号 */}
                    <div className="signal-section">
                      <span
                        className={`signal-action ${
                          strategy.tradingAdvice.action === '买多' ? 'buy' :
                          strategy.tradingAdvice.action === '卖空' ? 'sell' : 'hold'
                        }`}
                      >
                        {strategy.tradingAdvice.action}
                      </span>
                    </div>

                      {/* 右侧：盈亏情况 */}
                    <div className="profit-section">
                      {strategy.profitLoss && strategy.profitLoss.profitLossPoints !== undefined && (
                        <span className={`profit-loss-value ${
                          strategy.profitLoss.profitLossPoints > 0 ? 'profit' :
                          strategy.profitLoss.profitLossPoints < 0 ? 'loss' : 'neutral'
                        }`}>
                          {strategy.profitLoss.profitLossPoints > 0 ? '+' : ''}{strategy.profitLoss.profitLossPoints.toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 止盈信息显示 */}
                  {strategy.profitLoss?.takeProfitReached && (
                    <div className="take-profit-info">
                      <div className="take-profit-badge">✓ 已触达止盈</div>
                      <div className="take-profit-details">
                        <span className="take-profit-label">止盈价:</span>
                        <span className="take-profit-price">{strategy.tradingAdvice.takeProfit.toFixed(0)}</span>
                        <span className="take-profit-separator">|</span>
                        <span className="take-profit-label">盈利:</span>
                        <span className="take-profit-points profit">
                          +{strategy.profitLoss.profitLossPoints?.toFixed(0)}点
                        </span>
                        <span className="take-profit-separator">|</span>
                        <span className="take-profit-label">耗时:</span>
                        <span className="take-profit-time">{strategy.profitLoss.takeProfitMinutes}分钟</span>
                        <span className="take-profit-separator">|</span>
                        <span className="take-profit-label">时间:</span>
                        <span className="take-profit-timestamp">
                          {strategy.profitLoss.takeProfitTime ? formatTime(strategy.profitLoss.takeProfitTime) : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 止损信息显示 */}
                  {strategy.profitLoss?.stopLossReached && (
                    <div className="stop-loss-info">
                      <div className="stop-loss-badge">✗ 已触达止损</div>
                      <div className="stop-loss-details">
                        <span className="stop-loss-label">止损价:</span>
                        <span className="stop-loss-price">{strategy.tradingAdvice.stopLoss.toFixed(0)}</span>
                        <span className="stop-loss-separator">|</span>
                        <span className="stop-loss-label">亏损:</span>
                        <span className="stop-loss-points loss">
                          {strategy.profitLoss.profitLossPoints?.toFixed(0)}点
                        </span>
                        <span className="stop-loss-separator">|</span>
                        <span className="stop-loss-label">耗时:</span>
                        <span className="stop-loss-time">{strategy.profitLoss.stopLossMinutes}分钟</span>
                        <span className="stop-loss-separator">|</span>
                        <span className="stop-loss-label">时间:</span>
                        <span className="stop-loss-timestamp">
                          {strategy.profitLoss.stopLossTime ? formatTime(strategy.profitLoss.stopLossTime) : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 信心度、风险、伦敦预测、国内预测 */}
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

                  {/* 价格建议 */}
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

                  {/* 图形分析（默认折叠，hover展开）*/}
                  {strategy.chartAnalysis && (
                    <div className="analysis-section chart-analysis collapsible">
                      <div className="chart-analysis-header">
                        <span className="chart-analysis-title">📊 图形分析</span>
                        <span className="chart-analysis-hint">（移动鼠标展开）</span>
                      </div>
                      <div className="chart-analysis-grid">
                        <div className="chart-analysis-item">
                          <div className="chart-analysis-label">
                            <span>过去图形</span>
                          </div>
                          <p className="chart-analysis-text">{strategy.chartAnalysis.pastChart}</p>
                        </div>
                        <div className="chart-analysis-item">
                          <div className="chart-analysis-label">
                            <span>当前图形</span>
                          </div>
                          <p className="chart-analysis-text">{strategy.chartAnalysis.currentChart}</p>
                        </div>
                        <div className="chart-analysis-item">
                          <div className="chart-analysis-label">
                            <span>未来预测</span>
                          </div>
                          <p className="chart-analysis-text">{strategy.chartAnalysis.futureChart}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
);

StrategyPanel.displayName = 'StrategyPanel';

