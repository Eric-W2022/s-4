"""
FastAPI 后端服务
提供前端页面和AllTick API数据接口
同时支持TqSdk获取国内期货数据
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from contextlib import asynccontextmanager
import uvicorn
import logging
from datetime import datetime
import asyncio
import time

# 导入共享配置和工具函数
from .config.settings import (
    TQSDK_AVAILABLE,
    TQ_API,
    TQSDK_KLINE_CACHE,
    TQSDK_QUOTE_CACHE,
    TQSDK_SUBSCRIPTION_RUNNING,
    executor,
    get_tqsdk_api,
    convert_tqsdk_kline_to_standard_format
)

# 导入路由模块
from .routes import data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    if TQSDK_AVAILABLE:
        logger.info("正在启动TqSdk订阅任务...")
        # 延迟启动，确保TqApi实例已创建
        await asyncio.sleep(2)
        # 在后台线程中启动订阅任务
        start_tqsdk_subscription()
    else:
        logger.warning("TqSdk未安装，跳过订阅任务启动")
    
    yield  # 应用运行中
    
    # 关闭时执行
    from .config import settings
    settings.TQSDK_SUBSCRIPTION_RUNNING = False
    logger.info("TqSdk订阅任务已停止")


app = FastAPI(title="白银K线监控", version="1.0.0", lifespan=lifespan)

# 注册路由
app.include_router(data.router)

# 获取项目根目录和前端目录
BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
LOGS_DIR = BASE_DIR / "logs"

# 创建logs目录
LOGS_DIR.mkdir(exist_ok=True)

# 清空之前的日志文件
for log_file in LOGS_DIR.glob("*.log"):
    try:
        log_file.unlink()
        print(f"已删除旧日志: {log_file.name}")
    except Exception as e:
        print(f"删除日志文件失败 {log_file.name}: {e}")

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOGS_DIR / f"app_{datetime.now().strftime('%Y%m%d')}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 禁用httpx的INFO级别日志（避免打印HTTP请求详情）
logging.getLogger("httpx").setLevel(logging.WARNING)


def start_tqsdk_subscription():
    """启动TqSdk订阅任务（在后台线程中运行）"""
    from .config.settings import TQSDK_SUBSCRIPTION_RUNNING as TQSDK_SUBSCRIPTION_RUNNING_GLOBAL, TQSDK_KLINE_CACHE, TQSDK_QUOTE_CACHE
    
    if not TQSDK_AVAILABLE:
        logger.warning("TqSdk未安装，无法启动订阅任务")
        return
    
    if TQSDK_SUBSCRIPTION_RUNNING_GLOBAL:
        logger.info("TqSdk订阅任务已在运行")
        return
    
    def subscription_loop():
        """订阅循环"""
        from backend.config import settings
        from backend.config.settings import TQ_USERNAME, TQ_PASSWORD
        
        # 使用导入的模块变量
        settings.TQSDK_SUBSCRIPTION_RUNNING = True
        logger.info("TqSdk订阅任务启动")
        
        try:
            # 创建新的TqApi实例（在子线程中）
            from tqsdk import TqApi, TqAuth
            auth = TqAuth(TQ_USERNAME, TQ_PASSWORD)
            api = TqApi(auth=auth)
            contract = "KQ.m@SHFE.ag"
            
            logger.info(f"TqSdk已连接，订阅合约: {contract}")
            
            # 订阅不同周期的K线
            interval_map = {
                "1m": 60,
                "5m": 300,
                "15m": 900,
                "30m": 1800,
                "1h": 3600,
                "1d": 86400
            }
            
            klines = {}
            for interval, duration_seconds in interval_map.items():
                klines[interval] = api.get_kline_serial(
                    contract, 
                    duration_seconds=duration_seconds, 
                    data_length=200  # 订阅最近200根K线
                )
                logger.info(f"已订阅 {interval} K线数据")
            
            # 订阅实时行情
            quote = api.get_quote(contract)
            logger.info("已订阅实时行情数据")
            
            # 主循环：等待数据更新
            update_count = 0
            while settings.TQSDK_SUBSCRIPTION_RUNNING:
                try:
                    # 等待数据更新（最多等待1秒）
                    deadline = time.time() + 1
                    api.wait_update(deadline=deadline)
                    
                    # 更新K线数据
                    for interval, kline_df in klines.items():
                        if kline_df is not None and not kline_df.empty:
                            standard_data = convert_tqsdk_kline_to_standard_format(kline_df)
                            settings.TQSDK_KLINE_CACHE['AG'][interval] = standard_data
                            if update_count % 60 == 0:  # 每60次更新记录一次日志
                                logger.info(f"K线数据已更新: {interval}, 数据条数: {len(standard_data)}")
                    
                    # 更新实时行情 - 确保quote对象已更新
                    if quote is not None:
                        # 检查quote是否真的有更新（通过检查last_price是否变化）
                        old_price = None
                        if 'AG' in settings.TQSDK_QUOTE_CACHE:
                            old_quote = settings.TQSDK_QUOTE_CACHE['AG']
                            if hasattr(old_quote, 'last_price'):
                                old_price = old_quote.last_price
                            elif isinstance(old_quote, dict):
                                old_price = old_quote.get('last_price')
                        
                        # 获取新价格
                        new_price = None
                        if hasattr(quote, 'last_price'):
                            new_price = quote.last_price
                        elif isinstance(quote, dict):
                            new_price = quote.get('last_price')
                        
                        # 始终更新缓存（quote对象本身会更新，我们需要保持引用）
                        settings.TQSDK_QUOTE_CACHE['AG'] = quote
                        
                        # 记录价格变化（每10次更新记录一次）
                        if update_count % 10 == 0:
                            logger.info(f"TqSdk行情更新: Price={new_price}, OldPrice={old_price}, QuoteType={type(quote)}")
                    
                    update_count += 1
                    if update_count % 60 == 0:  # 每60次更新记录一次日志
                        logger.info(f"TqSdk订阅任务运行中，已更新 {update_count} 次")
                        
                except Exception as e:
                    logger.error(f"TqSdk订阅循环错误: {e}", exc_info=True)
                    # 等待一段时间后重试
                    time.sleep(5)
            
            # 关闭API连接
            api.close()
            
        except Exception as e:
            logger.error(f"TqSdk订阅任务失败: {e}", exc_info=True)
            settings.TQSDK_SUBSCRIPTION_RUNNING = False
        finally:
            logger.info("TqSdk订阅任务已停止")
            settings.TQSDK_SUBSCRIPTION_RUNNING = False
    
    # 在后台线程中启动订阅任务
    import threading
    thread = threading.Thread(target=subscription_loop, daemon=True)
    thread.start()
    logger.info("TqSdk订阅任务线程已启动")


@app.get("/health")
async def health_check():
    """健康检查接口"""
    logger.info("[健康检查] 服务正常")
    return {"status": "ok", "service": "白银K线监控"}


@app.get("/api/debug/quote-fields")
async def debug_quote_fields():
    """调试接口：返回quote对象的所有字段"""
    from .config.settings import TQSDK_QUOTE_CACHE
    
    quote = TQSDK_QUOTE_CACHE.get('AG')
    
    if quote is None:
        return {
            "error": "Quote数据尚未就绪",
            "available": False
        }
    
    # 获取所有字段
    all_attrs = dir(quote)
    
    # 分类字段
    result = {
        "available": True,
        "quote_type": str(type(quote)),
        "all_fields": {},
        "price_fields": {},
        "volume_fields": {},
        "amount_fields": {},
        "position_fields": {},
        "time_fields": {},
        "other_important_fields": {}
    }
    
    # 获取所有非私有字段
    for attr in all_attrs:
        if not attr.startswith('_'):
            try:
                value = getattr(quote, attr)
                if not callable(value):
                    result["all_fields"][attr] = str(value)
                    
                    # 分类显示
                    if 'price' in attr.lower():
                        result["price_fields"][attr] = str(value)
                    elif 'volume' in attr.lower():
                        result["volume_fields"][attr] = str(value)
                    elif 'amount' in attr.lower():
                        result["amount_fields"][attr] = str(value)
                    elif any(x in attr.lower() for x in ['open_interest', 'position']):
                        result["position_fields"][attr] = str(value)
                    elif any(x in attr.lower() for x in ['time', 'date']):
                        result["time_fields"][attr] = str(value)
            except Exception as e:
                result["all_fields"][attr] = f"Error: {str(e)}"
    
    # 重点字段
    key_fields = ['last_price', 'volume', 'amount', 'open_interest', 
                  'bid_price1', 'bid_volume1', 'ask_price1', 'ask_volume1',
                  'highest', 'lowest', 'open', 'close', 'pre_close',
                  'settlement', 'pre_settlement', 'upper_limit', 'lower_limit',
                  'average', 'change', 'change_percent']
    
    for field in key_fields:
        if hasattr(quote, field):
            try:
                value = getattr(quote, field)
                if not callable(value):
                    result["other_important_fields"][field] = str(value)
            except:
                pass
    
    return result


# 挂载前端静态文件（CSS、JS等）
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/{file_path:path}")
async def serve_static(file_path: str, request: Request):
    """服务前端静态文件"""
    if file_path in ["", "index.html"]:
        response = FileResponse(str(FRONTEND_DIR / "index.html"))
        # 开发模式下禁用缓存，方便热重载
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    
    file = FRONTEND_DIR / file_path
    if file.exists() and file.is_file():
        response = FileResponse(str(file))
        # 开发模式下禁用缓存，方便热重载
        if file_path.endswith(('.js', '.css', '.html')):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response
    
    # 如果是API路径，返回404
    if file_path.startswith("api/") or file_path.startswith("docs") or file_path.startswith("openapi.json"):
        raise HTTPException(status_code=404, detail="Not found")
    
    # 其他情况返回index.html（用于SPA路由）
    response = FileResponse(str(FRONTEND_DIR / "index.html"))
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


if __name__ == "__main__":
    logger.info("=" * 50)
    logger.info("白银K线监控服务启动")
    logger.info("=" * 50)
    logger.info(f"服务运行在: http://localhost:8080")
    logger.info(f"API文档: http://localhost:8080/docs")
    logger.info(f"健康检查: http://localhost:8080/health")
    logger.info(f"日志目录: {LOGS_DIR}")
    logger.info("=" * 50)
    logger.info("按 Ctrl+C 停止服务器")
    logger.info("=" * 50)
    
    print("=" * 50)
    print("白银K线监控服务启动")
    print("=" * 50)
    print("服务运行在: http://localhost:8080")
    print("API文档: http://localhost:8080/docs")
    print("健康检查: http://localhost:8080/health")
    print(f"日志目录: {LOGS_DIR}")
    print("=" * 50)
    print("按 Ctrl+C 停止服务器")
    print("=" * 50)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )

