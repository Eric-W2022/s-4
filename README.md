# 白银K线监控网站

这是一个暗色主题的网站，用于实时监控伦敦现货白银和国内白银主力的K线数据。

## 项目结构

```
s-4/
├── backend/           # 后端服务
│   └── app.py        # FastAPI代理服务器
├── frontend/         # 前端文件
│   ├── index.html    # 主页面
│   ├── script.js     # JavaScript逻辑
│   └── style.css     # 样式文件
├── scripts/          # 脚本文件
│   └── start_proxy.sh # 启动脚本
├── requirements.txt   # Python依赖
└── README.md         # 项目说明
```

## 功能特点

- 🌙 暗色主题界面
- 📊 分钟级K线图表显示
- ⏱️ 每分钟自动刷新数据
- 📈 实时价格和涨跌显示
- 📱 响应式设计，支持移动端

## 使用方法

### 启动服务

1. **安装依赖**（如果还没安装）：
   ```bash
   pip install -r requirements.txt
   ```

2. **启动FastAPI服务器**：
   ```bash
   python3 backend/app.py
   ```
   或者使用启动脚本：
   ```bash
   ./scripts/start_proxy.sh
   ```
   
   服务器将在 `http://localhost:8080` 运行
   - 前端页面：http://localhost:8080/
   - API文档：http://localhost:8080/docs
   - 健康检查：http://localhost:8080/health

3. **在浏览器中打开网站**：
   - 访问：http://localhost:8080
   - 前端自动请求后端接口获取数据并显示K线图

## 配置说明

如果API返回的数据不正确，可能需要调整 `frontend/script.js` 中的配置：

### 伦敦现货白银配置
```javascript
london: {
    symbol: 'Silver', // 伦敦现货白银代码（AllTick产品代码）
    interval: '1m', // 1分钟K线
    limit: 100
}
```

### 国内白银主力配置
```javascript
domestic: {
    symbol: 'AG', // 国内白银主力代码，可能需要调整
    interval: '1m', // 1分钟K线
    limit: 100
}
```

**注意**: 
- 如果API返回错误，可能需要检查产品代码是否正确
- AllTick支持贵金属、外汇、股票等多种产品类型
- 如果数据获取失败，会自动使用测试数据模式

## 新功能：AI策略分析

系统现已集成大模型AI进行实时交易策略分析！

### 功能特点

- **多维度数据分析**：综合分析伦敦白银和国内白银的1分钟、15分钟、90日K线数据
- **实时盘口数据**：结合国内白银的五档买卖盘口进行分析
- **智能交易建议**：提供买多/卖空/观望建议，包含入场价、止损价、止盈价
- **价格预测**：预测未来15分钟的价格走势
- **风险评估**：评估每次交易的风险等级和信心度
- **自动更新**：每60秒自动分析一次，实时更新策略建议

### 配置步骤

1. **配置大模型API**

创建 `.env` 文件（可参考 `.env.example`）：

```bash
# 大模型API配置
LLM_API_BASE_URL=https://api.openai.com/v1  # 或其他兼容OpenAI接口的API
LLM_API_KEY=your_api_key_here
```

支持的API服务商：
- OpenAI
- DeepSeek
- 豆包（字节跳动）
- 通义千问（阿里云）
- 其他OpenAI兼容接口

2. **启动服务**

```bash
# 后端
cd backend
python -m backend.app

# 前端（React版）
cd react-frontend
npm run dev
```

3. **选择模型**

在右侧策略面板顶部，点击模型名称可切换不同的AI模型进行分析。

### 策略输出格式

- **交易建议**：买多/卖空/观望
- **信心度**：0-100%的信心指数
- **风险等级**：高/中/低
- **价格建议**：入场价、止损价、止盈价、建议手数
- **价格预测**：15分钟后的价格预测
- **分析理由**：详细的技术分析说明
- **后续思路**：下一步操作建议

### 提示词自定义

提示词位于 `react-frontend/src/prompts/strategyPrompts.ts`，可根据需要自定义：
- 系统提示词：定义AI的角色和分析方法
- 数据格式化：调整K线和盘口数据的展示方式
- 输出格式：修改JSON输出结构

详见 `react-frontend/src/prompts/README.md`

## 技术栈

### 前端
- HTML5
- CSS3
- JavaScript (ES6+)
- ECharts 5.4.3 (图表库)

### 后端
- Python 3.8+
- FastAPI
- httpx (异步HTTP客户端)
- uvicorn (ASGI服务器)

## API说明

### 架构说明
- **前端**：直接请求后端接口 `/api/kline`，无需传递token
- **后端**：直接请求 AllTick API，token配置在后端代码中
- **优势**：避免CORS问题，token更安全，架构更简单

### AllTick API
- 端点: `https://quote.alltick.co/quote-b-api/kline`
- 支持的品种: 外汇、贵金属、加密货币、原油、CFD指数、商品
- 文档: https://apis.alltick.co/

### 后端API接口
- 接口: `GET /api/kline`
- 参数: `symbol`（产品代码）、`interval`（周期）、`limit`（数量）
- Token: 配置在 `backend/app.py` 中的 `ALLTICK_TOKEN`

## 开发说明

### 本地开发

1. 启动后端服务器：
   ```bash
   python3 backend/app.py
   ```

2. 访问前端：
   - 打开浏览器访问 http://localhost:8080

### 生产部署

1. 使用Gunicorn或类似工具部署FastAPI应用
2. 配置反向代理（如Nginx）
3. 设置环境变量管理敏感信息（如API token）
