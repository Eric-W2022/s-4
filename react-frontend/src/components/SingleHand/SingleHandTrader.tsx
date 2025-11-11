// 单手交易组件
import React, { useState } from 'react';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import { MODEL_OPTIONS } from '../../constants';
import type { SingleHandPosition, SingleHandOperation, ModelType } from '../../types';
import './SingleHandTrader.css';

// 获取模型简称
const getModelLabel = (modelValue?: string) => {
  if (!modelValue) return '';
  const model = MODEL_OPTIONS.find(m => m.value === modelValue);
  return model?.label || modelValue;
};

interface SingleHandTraderProps {
  position: SingleHandPosition;
  operations: SingleHandOperation[];
  isLoading?: boolean;
  selectedModel: ModelType;
  onModelChange: (model: ModelType) => void;
  onRefresh?: () => void;
  onClearOperations?: () => void;
  onDeleteOperation?: (operationId: string) => void;
  onManualTrigger?: () => void;
}

export const SingleHandTrader: React.FC<SingleHandTraderProps> = React.memo(
  ({ position, operations, isLoading, selectedModel, onModelChange, onRefresh, onClearOperations, onDeleteOperation, onManualTrigger }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const selectedModelLabel = MODEL_OPTIONS.find(
      (m) => m.value === selectedModel
    )?.label || 'DeepSeek';

    const handleModelSelect = (model: ModelType) => {
      onModelChange(model);
      setIsDropdownOpen(false);
    };
    
    // 格式化时间
    const formatTime = (timestamp: number) => {
      const date = new Date(timestamp);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    };

    // 格式化持仓时长
    const formatDuration = (entryTime?: number) => {
      if (!entryTime) return '0分钟';
      const duration = Math.floor((Date.now() - entryTime) / 60000);
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
      }
      return `${minutes}分钟`;
    };

    return (
      <div className="single-hand-trader">
        <div className="single-hand-header">
          <div className="single-hand-title-section">
            <h2>单手交易策略</h2>
            {(operations.length > 0 || position.hasPosition) ? (
              <button
                className="clear-operations-btn"
                onClick={() => {
                  if (confirm('确定要清空单手交易数据吗？这将清除持仓和所有操作记录！')) {
                    onClearOperations?.();
                  }
                }}
                title="清空单手交易数据"
              >
                ✕
              </button>
            ) : (
              <button
                className="play-strategy-btn"
                onClick={() => {
                  onManualTrigger?.();
                }}
                disabled={isLoading}
                title="生成交易策略"
              >
                ▶
              </button>
            )}
          </div>
          <div className="single-hand-header-right">
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
            {onRefresh && (
              <button
                className="refresh-btn"
                onClick={onRefresh}
                disabled={isLoading}
                title="手动刷新"
              >
                {isLoading ? '⟳' : '↻'}
              </button>
            )}
          </div>
        </div>

        {/* 持仓盈亏 */}
        <div className="position-section">
          {position.hasPosition ? (
            <div className="position-info">
              <div className="position-cards">
                {/* 第一行：持仓方向、入场价、当前价 */}
                <div className="position-card">
                  <div className="position-card-label">持仓方向</div>
                  <div className={`position-card-value direction ${position.direction === '多' ? 'long' : 'short'}`}>
                    {position.direction}单
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">入场价</div>
                  <div className="position-card-value">
                    {position.entryPrice?.toFixed(0) || '-'}
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">当前价</div>
                  <div className="position-card-value">
                    {position.currentPrice?.toFixed(0) || '-'}
                  </div>
                </div>

                {/* 第二行：盈亏点数、盈亏金额、持仓时长 */}
                <div className="position-card">
                  <div className="position-card-label">盈亏点数</div>
                  <div className={`position-card-value ${
                    (position.profitLossPoints || 0) > 0 ? 'profit' : 
                    (position.profitLossPoints || 0) < 0 ? 'loss' : 'neutral'
                  }`}>
                    {position.profitLossPoints !== undefined && position.profitLossPoints > 0 ? '+' : ''}
                    {position.profitLossPoints?.toFixed(0) || 0}点
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">盈亏金额</div>
                  <div className={`position-card-value ${
                    (position.profitLossMoney || 0) > 0 ? 'profit' : 
                    (position.profitLossMoney || 0) < 0 ? 'loss' : 'neutral'
                  }`}>
                    {position.profitLossMoney !== undefined && position.profitLossMoney > 0 ? '+' : ''}
                    {position.profitLossMoney?.toFixed(0) || 0}元
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">持仓时长</div>
                  <div className="position-card-value duration">
                    {formatDuration(position.entryTime)}
                  </div>
                </div>

                {/* 第三行：最高盈利、回撤百分比 */}
                <div className="position-card">
                  <div className="position-card-label">最高盈利</div>
                  <div className="position-card-value profit">
                    {position.maxProfitPoints !== undefined && position.maxProfitPoints > 0 ? '+' : ''}
                    {position.maxProfitPoints?.toFixed(0) || 0}点
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">回撤</div>
                  <div className={`position-card-value ${
                    (position.drawdownPercent || 0) > 30 ? 'loss' : 
                    (position.drawdownPercent || 0) > 10 ? 'neutral' : 'profit'
                  }`}>
                    {position.drawdownPercent?.toFixed(1) || 0}%
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">-</div>
                  <div className="position-card-value neutral">
                    -
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="position-info">
              <div className="position-cards">
                {/* 第一行：持仓方向、入场价、当前价 */}
                <div className="position-card">
                  <div className="position-card-label">持仓方向</div>
                  <div className="position-card-value direction idle">
                    空闲
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">入场价</div>
                  <div className="position-card-value">
                    -
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">当前价</div>
                  <div className="position-card-value">
                    {position.currentPrice?.toFixed(0) || '-'}
                  </div>
                </div>

                {/* 第二行：盈亏点数、盈亏金额、持仓时长 */}
                <div className="position-card">
                  <div className="position-card-label">盈亏点数</div>
                  <div className="position-card-value neutral">
                    0点
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">盈亏金额</div>
                  <div className="position-card-value neutral">
                    0元
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">持仓时长</div>
                  <div className="position-card-value duration">
                    0分钟
                  </div>
                </div>

                {/* 第三行：最高盈利、回撤百分比 */}
                <div className="position-card">
                  <div className="position-card-label">最高盈利</div>
                  <div className="position-card-value neutral">
                    0点
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">回撤</div>
                  <div className="position-card-value neutral">
                    0%
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">-</div>
                  <div className="position-card-value neutral">
                    -
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 今日统计 */}
        <div className="daily-stats-section">
          {/* 第一行：总点数、操作数、胜率 */}
          <div className="daily-stats-cards">
            <div className="daily-stat-card">
              <div className="daily-stat-label">总点数</div>
              <div className={`daily-stat-value ${
                (() => {
                  // 已平仓的点数
                  const closedPoints = operations.filter(op => op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
                  // 当前持仓的浮动盈亏点数
                  const currentPoints = position.hasPosition ? (position.profitLossPoints || 0) : 0;
                  const total = closedPoints + currentPoints;
                  return total > 0 ? 'profit' : total < 0 ? 'loss' : 'neutral';
                })()
              }`}>
                {(() => {
                  // 已平仓的点数
                  const closedPoints = operations.filter(op => op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
                  // 当前持仓的浮动盈亏点数
                  const currentPoints = position.hasPosition ? (position.profitLossPoints || 0) : 0;
                  const total = closedPoints + currentPoints;
                  return (total > 0 ? '+' : '') + total.toFixed(0);
                })()}
              </div>
            </div>
            <div className="daily-stat-card">
              <div className="daily-stat-label">操作数</div>
              <div className="daily-stat-value neutral">
                {operations.filter(op => 
                  op.action === '开多' || op.action === '开空' || op.action === '平仓'
                ).length}
              </div>
            </div>
            <div className="daily-stat-card">
              <div className="daily-stat-label">胜率</div>
              <div className={`daily-stat-value ${
                (() => {
                  // 统计所有平仓操作
                  const closedOps = operations.filter(op => op.action === '平仓' && op.netProfit !== undefined);
                  if (closedOps.length === 0) return 'neutral';
                  // 统计盈利的平仓操作
                  const winOps = closedOps.filter(op => (op.netProfit || 0) > 0);
                  const winRate = (winOps.length / closedOps.length) * 100;
                  return winRate >= 50 ? 'profit' : winRate >= 30 ? 'neutral' : 'loss';
                })()
              }`}>
                {(() => {
                  // 统计所有平仓操作
                  const closedOps = operations.filter(op => op.action === '平仓' && op.netProfit !== undefined);
                  if (closedOps.length === 0) return '0%';
                  // 统计盈利的平仓操作
                  const winOps = closedOps.filter(op => (op.netProfit || 0) > 0);
                  const winRate = (winOps.length / closedOps.length) * 100;
                  return winRate.toFixed(0) + '%';
                })()}
              </div>
            </div>
          </div>
          
          {/* 第二行：总营收、手续费、净利润 */}
          <div className="daily-stats-cards">
            <div className="daily-stat-card">
              <div className="daily-stat-label">总营收</div>
              <div className={`daily-stat-value ${
                (() => {
                  // 只统计平仓操作的盈亏金额（不包括手续费的纯盈亏）
                  const closedRevenue = operations
                    .filter(op => op.action === '平仓' && op.profitLossMoney !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossMoney || 0), 0);
                  // 当前持仓的浮动盈亏金额
                  const currentRevenue = position.hasPosition ? (position.profitLossMoney || 0) : 0;
                  const total = closedRevenue + currentRevenue;
                  return total > 0 ? 'profit' : total < 0 ? 'loss' : 'neutral';
                })()
              }`}>
                {(() => {
                  // 只统计平仓操作的盈亏金额（不包括手续费的纯盈亏）
                  const closedRevenue = operations
                    .filter(op => op.action === '平仓' && op.profitLossMoney !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossMoney || 0), 0);
                  // 当前持仓的浮动盈亏金额
                  const currentRevenue = position.hasPosition ? (position.profitLossMoney || 0) : 0;
                  const total = closedRevenue + currentRevenue;
                  return (total > 0 ? '+' : '') + total.toFixed(0) + '元';
                })()}
              </div>
            </div>
            <div className="daily-stat-card">
              <div className="daily-stat-label">手续费</div>
              <div className="daily-stat-value loss">
                {(() => {
                  const totalCommission = operations.filter(op => op.commission !== undefined)
                    .reduce((sum, op) => sum + (op.commission || 0), 0);
                  return '-' + totalCommission.toFixed(0) + '元';
                })()}
              </div>
            </div>
            <div className="daily-stat-card">
              <div className="daily-stat-label">净利润</div>
              <div className={`daily-stat-value ${
                (() => {
                  // 净利润 = 总营收 - 手续费
                  // 总营收：只统计平仓操作的盈亏金额
                  const closedRevenue = operations
                    .filter(op => op.action === '平仓' && op.profitLossMoney !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossMoney || 0), 0);
                  // 当前持仓的浮动盈亏金额
                  const currentRevenue = position.hasPosition ? (position.profitLossMoney || 0) : 0;
                  const totalRevenue = closedRevenue + currentRevenue;
                  
                  // 手续费：所有操作的手续费
                  const totalCommission = operations.filter(op => op.commission !== undefined)
                    .reduce((sum, op) => sum + (op.commission || 0), 0);
                  
                  // 净利润 = 总营收 - 手续费
                  const netProfit = totalRevenue - totalCommission;
                  return netProfit > 0 ? 'profit' : netProfit < 0 ? 'loss' : 'neutral';
                })()
              }`}>
                {(() => {
                  // 净利润 = 总营收 - 手续费
                  // 总营收：只统计平仓操作的盈亏金额
                  const closedRevenue = operations
                    .filter(op => op.action === '平仓' && op.profitLossMoney !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossMoney || 0), 0);
                  // 当前持仓的浮动盈亏金额
                  const currentRevenue = position.hasPosition ? (position.profitLossMoney || 0) : 0;
                  const totalRevenue = closedRevenue + currentRevenue;
                  
                  // 手续费：所有操作的手续费
                  const totalCommission = operations.filter(op => op.commission !== undefined)
                    .reduce((sum, op) => sum + (op.commission || 0), 0);
                  
                  // 净利润 = 总营收 - 手续费
                  const netProfit = totalRevenue - totalCommission;
                  return (netProfit > 0 ? '+' : '') + netProfit.toFixed(0) + '元';
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* 操作记录 */}
        <div className="operations-section">
          <h3>操作记录</h3>
          {isLoading && operations.length === 0 ? (
            <div className="operations-loading">
              <LoadingSpinner />
            </div>
          ) : operations.length === 0 ? (
            <div className="no-operations">
              <div>暂无操作记录</div>
            </div>
          ) : (
            <div className="operations-list">
              {operations.map((op) => (
                <div key={op.id} className="operation-item">
                  <div className="operation-header">
                    <div className="operation-header-left">
                    <span className="operation-time">{formatTime(op.timestamp)}</span>
                    <span className={`operation-action ${
                      op.action === '开多' ? 'open-long' :
                      op.action === '开空' ? 'open-short' :
                        op.action === '平仓' ? 'close' :
                        op.action === '观望' ? 'watch' : 'hold'
                    }`}>
                      {op.action}
                    </span>
                    <span className="operation-price">@ {op.price.toFixed(0)}</span>
                    {op.model && (
                      <span className="operation-model">{getModelLabel(op.model)}</span>
                    )}
                    </div>
                    {onDeleteOperation && (
                      <button
                        className="delete-operation-btn"
                        onClick={() => {
                          onDeleteOperation(op.id);
                        }}
                        title="删除此记录"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  
                  {/* 财务信息：盈亏和手续费 */}
                  <div className="operation-financial-info">
                    {/* 开仓操作 */}
                    {(op.action === '开多' || op.action === '开空') && (
                      <>
                        {(() => {
                          // 判断是否是当前持仓期间的开仓
                          const isCurrentPosition = position.hasPosition && position.entryTime && op.timestamp >= position.entryTime;
                          // 使用实时盈亏（当前持仓）或记录的盈亏（历史持仓）
                          const points = isCurrentPosition ? (position.profitLossPoints || 0) : (op.profitLossPoints || 0);
                          const money = isCurrentPosition ? (position.profitLossMoney || 0) : (op.profitLossMoney || 0);
                          
                          return (
                            <>
                              <span className={`operation-pl-points ${
                                points > 0 ? 'profit' : points < 0 ? 'loss' : 'neutral'
                              }`}>
                                {points > 0 ? '+' : ''}{points.toFixed(0)}点
                              </span>
                              <span className={`operation-pl-money ${
                                money > 0 ? 'profit' : money < 0 ? 'loss' : 'neutral'
                              }`}>
                                {money > 0 ? '+' : ''}{money.toFixed(0)}元
                              </span>
                            </>
                          );
                        })()}
                        <span className="operation-commission-value">手续费-8元</span>
                      </>
                    )}
                  
                    {/* 平仓操作 */}
                  {op.action === '平仓' && op.profitLossPoints !== undefined && (
                      <>
                      <span className={`operation-pl-points ${
                        op.profitLossPoints > 0 ? 'profit' : 
                        op.profitLossPoints < 0 ? 'loss' : 'neutral'
                      }`}>
                        {op.profitLossPoints > 0 ? '+' : ''}{op.profitLossPoints.toFixed(0)}点
                      </span>
                      <span className={`operation-pl-money ${
                        (op.profitLossMoney || 0) > 0 ? 'profit' : 
                        (op.profitLossMoney || 0) < 0 ? 'loss' : 'neutral'
                      }`}>
                        {(op.profitLossMoney || 0) > 0 ? '+' : ''}{op.profitLossMoney?.toFixed(0)}元
                      </span>
                      <span className="operation-commission-value">手续费-8元</span>
                      <span className={`operation-net-profit ${
                        (op.netProfit || 0) > 0 ? 'profit' : 
                        (op.netProfit || 0) < 0 ? 'loss' : 'neutral'
                      }`}>
                        净利润{(op.netProfit || 0) > 0 ? '+' : ''}{op.netProfit?.toFixed(0)}元
                      </span>
                      </>
                    )}
                    
                    {/* 持有操作 */}
                    {op.action === '持有' && (
                      <>
                        {(() => {
                          // 判断是否是当前持仓期间的持有
                          const isCurrentPosition = position.hasPosition && position.entryTime && op.timestamp >= position.entryTime;
                          // 使用实时盈亏（当前持仓）或记录的盈亏（历史持仓）
                          const points = isCurrentPosition ? (position.profitLossPoints || 0) : (op.profitLossPoints || 0);
                          const money = isCurrentPosition ? (position.profitLossMoney || 0) : (op.profitLossMoney || 0);
                          const duration = isCurrentPosition 
                            ? (position.entryTime ? Math.round((Date.now() - position.entryTime) / 60000) : 0)
                            : (op.duration || 0);
                          
                          return (
                            <>
                              <span className={`operation-pl-points ${
                                points > 0 ? 'profit' : points < 0 ? 'loss' : 'neutral'
                              }`}>
                                {points > 0 ? '+' : ''}{points.toFixed(0)}点
                              </span>
                              <span className={`operation-pl-money ${
                                money > 0 ? 'profit' : money < 0 ? 'loss' : 'neutral'
                              }`}>
                                {money > 0 ? '+' : ''}{money.toFixed(0)}元
                              </span>
                              <span className="operation-duration">
                                持仓{duration}分钟
                              </span>
                            </>
                          );
                        })()}
                      </>
                    )}
                    
                    {/* 观望操作：无持仓 */}
                    {op.action === '观望' && (
                      <>
                        <span className="operation-pl-points neutral">无持仓</span>
                      </>
                    )}
                    </div>
                  
                  {/* 原因说明（默认折叠，hover展开）*/}
                  <div className="operation-reason-container">
                    <div className="operation-reason-header">
                      <span className="operation-reason-title">💡 决策理由</span>
                      <span className="operation-reason-hint">（移动鼠标展开）</span>
                    </div>
                  <div className="operation-reason">{op.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

SingleHandTrader.displayName = 'SingleHandTrader';

