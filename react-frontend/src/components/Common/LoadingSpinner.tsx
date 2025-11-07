// 加载动画组件
import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  text?: string;
  size?: 'small' | 'medium' | 'large';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = React.memo(
  ({ text = '加载中...', size = 'medium' }) => {
    return (
      <div className={`loading-container ${size}`}>
        <div className="loading-spinner" />
        <div className="loading-text">{text}</div>
      </div>
    );
  }
);

LoadingSpinner.displayName = 'LoadingSpinner';

