"""
FastAPI 后端服务
提供前端页面和AllTick API数据接口
同时支持TqSdk获取国内期货数据
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import uvicorn
import logging
from datetime import datetime
import asyncio
import time

# 导入共享配置和工具函数
from config import (
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
from routes import data
from routes import analysis

app = FastAPI(title="白银K线监控", version="1.0.0")

# 注册路由
app.include_router(data.router)
app.include_router(analysis.router)

# 获取项目根目录和前端目录
BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
LOGS_DIR = BASE_DIR / "logs"

# 创建logs目录
LOGS_DIR.mkdir(exist_ok=True)

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
    from config import TQSDK_SUBSCRIPTION_RUNNING as TQSDK_SUBSCRIPTION_RUNNING_GLOBAL, TQSDK_KLINE_CACHE, TQSDK_QUOTE_CACHE
    
    if not TQSDK_AVAILABLE:
        logger.warning("TqSdk未安装，无法启动订阅任务")
        return
    
    if TQSDK_SUBSCRIPTION_RUNNING_GLOBAL:
        logger.info("TqSdk订阅任务已在运行")
        return
    
    def subscription_loop():
        """订阅循环"""
        from config import TQSDK_SUBSCRIPTION_RUNNING, TQSDK_KLINE_CACHE, TQSDK_QUOTE_CACHE
        
        # 使用导入的模块变量
        import config
        config.TQSDK_SUBSCRIPTION_RUNNING = True
        logger.info("TqSdk订阅任务启动")
        
        try:
            api = get_tqsdk_api()
            contract = "KQ.m@SHFE.ag"
            
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
            while config.TQSDK_SUBSCRIPTION_RUNNING:
                try:
                    # 等待数据更新（最多等待1秒）
                    deadline = time.time() + 1
                    api.wait_update(deadline=deadline)
                    
                    # 更新K线数据
                    for interval, kline_df in klines.items():
                        if kline_df is not None and not kline_df.empty:
                            standard_data = convert_tqsdk_kline_to_standard_format(kline_df)
                            config.TQSDK_KLINE_CACHE['AG'][interval] = standard_data
                    
                    # 更新实时行情
                    if quote:
                        config.TQSDK_QUOTE_CACHE['AG'] = quote
                    
                    update_count += 1
                    if update_count % 60 == 0:  # 每60次更新记录一次日志
                        logger.debug(f"TqSdk订阅任务运行中，已更新 {update_count} 次")
                        
                except Exception as e:
                    logger.error(f"TqSdk订阅循环错误: {e}", exc_info=True)
                    # 等待一段时间后重试
                    time.sleep(5)
                    
        except Exception as e:
            logger.error(f"TqSdk订阅任务失败: {e}", exc_info=True)
            config.TQSDK_SUBSCRIPTION_RUNNING = False
        finally:
            logger.info("TqSdk订阅任务已停止")
            config.TQSDK_SUBSCRIPTION_RUNNING = False
    
    # 在后台线程中启动订阅任务
    if executor:
        executor.submit(subscription_loop)
    else:
        import threading
        thread = threading.Thread(target=subscription_loop, daemon=True)
        thread.start()


@app.get("/health")
async def health_check():
    """健康检查接口"""
    logger.info("[健康检查] 服务正常")
    return {"status": "ok", "service": "白银K线监控"}


# 挂载前端静态文件（CSS、JS等）
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# 添加静态文件路由，使前端资源可以直接访问（放在最后，避免匹配API路由）
@app.on_event("startup")
async def startup_event():
    """应用启动时启动TqSdk订阅任务"""
    if TQSDK_AVAILABLE:
        logger.info("正在启动TqSdk订阅任务...")
        # 延迟启动，确保TqApi实例已创建
        await asyncio.sleep(2)
        # 在后台线程中启动订阅任务
        start_tqsdk_subscription()
    else:
        logger.warning("TqSdk未安装，跳过订阅任务启动")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时停止TqSdk订阅任务"""
    import config
    config.TQSDK_SUBSCRIPTION_RUNNING = False
    logger.info("TqSdk订阅任务已停止")


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

