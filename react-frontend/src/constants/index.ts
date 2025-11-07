// 常量定义

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export const SYMBOLS = {
  LONDON: 'Silver',  // 伦敦现货白银 - 方向指引参考
  DOMESTIC: 'AG',    // 国内白银主力 - 主要交易标的
} as const;

export const INTERVALS = {
  ONE_MINUTE: '1m',
  FIFTEEN_MINUTES: '15m',
  ONE_DAY: '1d',
} as const;

export const MODEL_OPTIONS = [
  { label: '豆包', value: 'doubao-seed-1-6-thinking-250715' },
  { label: 'DeepSeek', value: 'deepseek-chat' },
  { label: 'Qwen', value: 'qwen3-max' },
  { label: 'GLM', value: 'glm-4.6' },
  { label: 'MiniMax', value: 'MiniMax-M2' },
  { label: 'Kimi', value: 'kimi-k2-turbo-preview' },
  { label: 'GPT', value: 'gpt-5' },
  { label: 'Claude', value: 'claude-sonnet-4-5' },
  { label: 'Gemini', value: 'google-ai-studio/gemini-2.5-pro' },
  { label: 'Grok', value: 'grok/grok-4' },
] as const;

export const CHART_THEMES = {
  BACKGROUND: '#0a0e27',
  PANEL_BG: '#13172b',
  BORDER: '#1e2548',
  TEXT: '#e0e0e0',
  TEXT_SECONDARY: '#9ca3af',
  GREEN: '#4ade80',
  RED: '#ef4444',
  BLUE: '#3b82f6',
  YELLOW: '#fbbf24',
  PURPLE: '#667eea',
} as const;

export const UPDATE_INTERVALS = {
  KLINE_1M: 500, // 每秒更新2次1分钟K线（500ms，高频实时刷新）
  KLINE_15M: 60000, // 60秒更新一次15分钟K线
  KLINE_1D: 300000, // 5分钟更新一次日K线
  TRADE_TICK: 500, // 每秒更新2次实时价格
  DEPTH: 500, // 每秒更新2次盘口
  STRATEGY: 60000, // 60秒更新一次策略
} as const;

// WebSocket 配置
export const ENABLE_WEBSOCKET = true; // 是否启用 WebSocket 实时更新（国内白银）
export const ENABLE_LONDON_WEBSOCKET = true; // 是否启用 WebSocket 实时更新（伦敦白银）

// AllTick WebSocket 配置（伦敦白银）
export const ALLTICK_CONFIG = {
  wsUrl: 'wss://quote.alltick.co/quote-b-ws-api',
  token: '9d7f12b4c30826987a501d532ef75707-c-app',
} as const;

