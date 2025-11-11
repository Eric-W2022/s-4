// 单手交易组件
import React, { useState } from 'react';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import { MODEL_OPTIONS } from '../../constants';
import type { SingleHandPosition, SingleHandOperation, ModelType } from '../../types';
import './SingleHandTrader.css';

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
              </div>
            </div>
          )}
        </div>

        {/* 今日统计 */}
        <div className="daily-stats-section">
          <div className="daily-stats-cards">
            <div className="daily-stat-card">
              <div className="daily-stat-label">总点数</div>
              <div className={`daily-stat-value ${
                operations.filter(op => op.profitLossPoints !== undefined)
                  .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0) > 0 ? 'profit' : 
                operations.filter(op => op.profitLossPoints !== undefined)
                  .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0) < 0 ? 'loss' : 'neutral'
              }`}>
                {(() => {
                  const total = operations.filter(op => op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
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
                operations.filter(op => op.netProfit !== undefined)
                  .reduce((sum, op) => sum + (op.netProfit || 0), 0) > 0 ? 'profit' : 
                operations.filter(op => op.netProfit !== undefined)
                  .reduce((sum, op) => sum + (op.netProfit || 0), 0) < 0 ? 'loss' : 'neutral'
              }`}>
                {(() => {
                  const total = operations.filter(op => op.netProfit !== undefined)
                    .reduce((sum, op) => sum + (op.netProfit || 0), 0);
                  return (total > 0 ? '+' : '') + total.toFixed(0) + '元';
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
                        <span className="operation-pl-points neutral">0点</span>
                        <span className="operation-pl-money neutral">0元</span>
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
                    
                    {/* 持有操作：显示当时的盈亏（如果有） */}
                    {op.action === '持有' && position.hasPosition && (
                      <>
                        <span className={`operation-pl-points ${
                          (position.profitLossPoints || 0) > 0 ? 'profit' : 
                          (position.profitLossPoints || 0) < 0 ? 'loss' : 'neutral'
                        }`}>
                          {(position.profitLossPoints || 0) > 0 ? '+' : ''}{(position.profitLossPoints || 0).toFixed(0)}点
                        </span>
                        <span className={`operation-pl-money ${
                          (position.profitLossMoney || 0) > 0 ? 'profit' : 
                          (position.profitLossMoney || 0) < 0 ? 'loss' : 'neutral'
                        }`}>
                          {(position.profitLossMoney || 0) > 0 ? '+' : ''}{(position.profitLossMoney || 0).toFixed(0)}元
                        </span>
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

