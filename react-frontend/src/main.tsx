import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'

// 暂时移除 StrictMode 以避免 echarts-for-react 与 React 19 的兼容性问题
// 这只影响开发模式，不影响生产构建
createRoot(document.getElementById('root')!).render(
  <App />
)
