# 白银K线监控系统 - React前端

这是一个使用 React + Vite + TypeScript 构建的白银K线实时监控系统，用于监控伦敦现货白银和国内白银主力的行情数据，并提供AI驱动的交易策略分析。

## 技术栈

### 核心框架
- **React 18** - 前端UI框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具（快速热更新）

### 状态管理
- **Zustand** - 轻量级全局状态管理
- **@tanstack/react-query** - 服务端状态管理和数据缓存

### UI 组件
- **ECharts** - K线图表可视化
- **echarts-for-react** - React ECharts 封装

### 工具库
- **Axios** - HTTP 客户端
- **dayjs** - 日期时间处理

## 性能优化

本项目采用了多项性能优化策略：

### 1. React 性能优化
- ✅ 所有组件使用 `React.memo` 避免不必要的重新渲染
- ✅ 使用 `useMemo` 缓存复杂计算结果
- ✅ 使用 `useCallback` 优化事件处理函数
- ✅ 合理的组件拆分，减少渲染范围

### 2. 数据获取优化
- ✅ React Query 自动缓存和去重
- ✅ 智能轮询策略（不同数据不同刷新频率）
- ✅ 错误自动重试机制
- ✅ 数据 stale time 设置，减少不必要请求

### 3. 构建优化
- ✅ 代码分割（Code Splitting）
  - React 核心库独立打包
  - ECharts 独立打包
  - 第三方库按功能分组
- ✅ Tree Shaking - 自动删除未使用代码
- ✅ 资源压缩 - esbuild 快速压缩
- ✅ 依赖预优化 - Vite 自动处理

### 4. 图表性能
- ✅ ECharts 使用 Canvas 渲染器
- ✅ `notMerge` 和 `lazyUpdate` 优化更新
- ✅ 图表配置缓存，避免重复计算

### 5. 网络优化
- ✅ API 请求去重
- ✅ 请求超时控制
- ✅ 错误处理和重试策略

## 项目结构

```
react-frontend/
├── src/
│   ├── api/                  # API 接口层
│   │   ├── client.ts        # Axios 客户端配置
│   │   └── marketData.ts    # 市场数据 API
│   ├── components/          # 组件目录
│   │   ├── Charts/         # K线图表组件
│   │   ├── Depth/          # 盘口深度组件
│   │   ├── Arbitrage/      # 套利追踪组件
│   │   ├── Strategy/       # 交易策略组件
│   │   └── common/         # 通用组件
│   ├── hooks/              # 自定义 Hooks
│   │   └── useMarketData.ts # 市场数据 Hooks
│   ├── store/              # Zustand 状态管理
│   │   └── appStore.ts     # 全局状态
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数
│   │   ├── chart.ts        # 图表工具
│   │   └── time.ts         # 时间工具
│   ├── constants/          # 常量定义
│   ├── styles/             # 全局样式
│   ├── App.tsx             # 主应用组件
│   └── main.tsx            # 入口文件
├── index.html
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # TypeScript 配置
└── package.json
```

## 安装和运行

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 浏览器自动打开 http://localhost:3000
```

### 生产构建

```bash
# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 环境变量

创建 `.env` 文件（开发环境）：
```env
VITE_API_BASE_URL=http://localhost:8000
```

创建 `.env.production` 文件（生产环境）：
```env
VITE_API_BASE_URL=http://your-production-api-url.com
```
## 核心功能

### 1. K线图表监控
- 伦敦现货白银（1分钟、15分钟、90日K线）
- 国内白银主力（1分钟、15分钟、90日K线）
- 实时价格显示
- 涨跌幅统计
- 成交量展示

### 2. 盘口深度
- 实时买卖五档
- 多空力量对比
- 市场情绪分析
- 扩展市场数据

### 3. 套利追踪
- 两市场相关性分析
- 价差监控
- 振幅对比
- 套利机会指数

### 4. 交易策略
- AI模型选择（支持多种大模型）
- 实时策略分析
- 买卖建议
- 风险评估
- 价格预测

## API 端点

后端 API 需要提供以下端点：

- `GET /api/data/kline` - 获取K线数据
- `GET /api/data/trade-tick` - 获取实时价格
- `GET /api/data/depth-tick` - 获取盘口深度

详见后端 API 文档。

## 浏览器兼容性

- Chrome (推荐)
- Firefox
- Safari
- Edge

建议使用最新版本的现代浏览器以获得最佳性能。

## 性能监控

建议在开发时开启 React DevTools Profiler 监控组件性能。

## 未来优化方向

1. 实现 Service Worker 离线缓存
2. 使用 Web Worker 处理大量数据计算
3. 实现虚拟滚动优化长列表
4. 添加懒加载和预加载策略
5. 优化首屏加载时间

## License

MIT

