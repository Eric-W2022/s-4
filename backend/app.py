"""
FastAPI 后端服务
提供前端页面和AllTick API数据接口
"""
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import httpx
import uvicorn
import logging
from datetime import datetime
import json
import uuid
import urllib.parse

app = FastAPI(title="白银K线监控", version="1.0.0")

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

# AllTick API配置
# 外汇、贵金属、加密货币、原油、CFD指数、商品接口地址
ALLTICK_BASE_URL = "https://quote.alltick.co/quote-b-api"
ALLTICK_TOKEN = "9d7f12b4c30826987a501d532ef75707-c-app"

# K线类型映射: interval -> kline_type
# 1=1分钟, 2=5分钟, 3=15分钟, 4=30分钟, 5=1小时, 8=日K, 9=周K, 10=月K
KLINE_TYPE_MAP = {
    "1m": 1,
    "5m": 2,
    "15m": 3,
    "30m": 4,
    "1h": 5,
    "1d": 8,
    "1w": 9,
    "1M": 10
}


def convert_interval_to_kline_type(interval: str) -> int:
    """将前端interval转换为AllTick的kline_type"""
    return KLINE_TYPE_MAP.get(interval.lower(), 1)  # 默认1分钟


def convert_api_response_to_standard_format(api_response: dict) -> list:
    """将AllTick API响应转换为标准格式"""
    if api_response.get("ret") != 200:
        return []
    
    kline_list = api_response.get("data", {}).get("kline_list", [])
    result = []
    
    for item in kline_list:
        result.append({
            "t": int(item.get("timestamp", 0)) * 1000,  # 转换为毫秒时间戳
            "o": float(item.get("open_price", 0)),
            "c": float(item.get("close_price", 0)),
            "h": float(item.get("high_price", 0)),
            "l": float(item.get("low_price", 0)),
            "v": float(item.get("volume", 0)),
            "tu": float(item.get("turnover", 0))
        })
    
    return result


@app.get("/api/kline")
async def get_kline(
    request: Request,
    symbol: str = Query(..., description="产品代码，如XAGUSD、AG等"),
    interval: str = Query("1m", description="K线周期，如1m、5m、1h等"),
    limit: int = Query(100, description="返回数据条数，最大500")
):
    """
    获取K线数据接口
    后端直接请求AllTick API，前端无需传递token
    """
    # 记录请求日志
    client_ip = request.client.host if request.client else "unknown"
    request_time = datetime.now().isoformat()
    trace_id = f"{uuid.uuid4()}-{int(datetime.now().timestamp() * 1000)}"
    
    # 限制limit最大值
    limit = min(limit, 500)
    
    logger.info(f"[API请求] IP: {client_ip} | Symbol: {symbol} | Interval: {interval} | Limit: {limit} | Trace: {trace_id}")
    
    try:
        # 转换interval为kline_type
        kline_type = convert_interval_to_kline_type(interval)
        
        # 构建AllTick API请求体（POST请求，参数在query字段）
        query_data = {
            "trace": trace_id,
            "data": {
                "code": symbol,
                "kline_type": kline_type,
                "kline_timestamp_end": 0,  # 0表示从当前最新往前查询
                "query_kline_num": limit,
                "adjust_type": 0  # 0:除权
            }
        }
        
        # 记录请求详情
        request_log = {
            "timestamp": request_time,
            "client_ip": client_ip,
            "symbol": symbol,
            "interval": interval,
            "kline_type": kline_type,
            "limit": limit,
            "trace_id": trace_id,
            "api_url": ALLTICK_BASE_URL
        }
        logger.debug(f"请求详情: {json.dumps(request_log, ensure_ascii=False)}")
        
        # 使用httpx异步客户端发送POST请求
        # 注意：query参数需要JSON字符串，httpx会自动URL编码
        query_json = json.dumps(query_data, ensure_ascii=False)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{ALLTICK_BASE_URL}/kline",
                params={"token": ALLTICK_TOKEN, "query": query_json},
                headers={
                    "accept": "application/json"
                }
            )
            
            # 记录响应日志
            response_time = datetime.now().isoformat()
            response_log = {
                "timestamp": response_time,
                "symbol": symbol,
                "status_code": response.status_code,
                "trace_id": trace_id
            }
            
            # 解析响应
            try:
                api_response = response.json()
            except:
                api_response = {"error": response.text}
            
            # 检查AllTick API的ret字段
            ret_code = api_response.get("ret", response.status_code)
            
            if response.status_code == 200 and ret_code == 200:
                # 转换为标准格式
                standard_data = convert_api_response_to_standard_format(api_response)
                
                response_log["data_count"] = len(standard_data)
                response_log["ret"] = ret_code
                response_log["msg"] = api_response.get("msg")
                
                logger.info(f"[API成功] Symbol: {symbol} | Status: {response.status_code} | Ret: {ret_code} | 数据条数: {len(standard_data)}")
                logger.debug(f"响应详情: {json.dumps(response_log, ensure_ascii=False)}")
                
                return JSONResponse(
                    content=standard_data,
                    status_code=200
                )
            else:
                # 返回错误信息
                error_data = {
                    "ret": ret_code,
                    "msg": api_response.get("msg", api_response.get("error", "Unknown error")),
                    "trace": api_response.get("trace", trace_id)
                }
                response_log["error"] = error_data
                logger.warning(f"[API错误] Symbol: {symbol} | Status: {response.status_code} | Ret: {ret_code} | Error: {error_data.get('msg')}")
                logger.debug(f"错误详情: {json.dumps(response_log, ensure_ascii=False)}")
                
                return JSONResponse(
                    content=error_data,
                    status_code=response.status_code if response.status_code != 200 else 400
                )
                
    except httpx.TimeoutException as e:
        logger.error(f"[API超时] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=504, detail="请求超时")
    except httpx.RequestError as e:
        logger.error(f"[API请求错误] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"请求错误: {str(e)}")
    except Exception as e:
        logger.error(f"[服务器错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


@app.get("/api/trade-tick")
async def get_trade_tick(
    request: Request,
    symbol: str = Query(..., description="产品代码，如Silver等")
):
    """
    获取最新成交价接口
    后端直接请求AllTick API，前端无需传递token
    """
    client_ip = request.client.host if request.client else "unknown"
    request_time = datetime.now().isoformat()
    trace_id = f"{uuid.uuid4()}-{int(datetime.now().timestamp() * 1000)}"
    
    logger.info(f"[Trade-Tick请求] IP: {client_ip} | Symbol: {symbol} | Trace: {trace_id}")
    
    try:
        query_data = {
            "trace": trace_id,
            "data": {
                "symbol_list": [
                    {"code": symbol}
                ]
            }
        }
        
        query_json = json.dumps(query_data, ensure_ascii=False)
        # httpx会自动对params进行URL编码，所以我们直接传JSON字符串，不需要手动编码
        # 但为了避免双重编码问题，我们使用data参数而不是params
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 使用POST请求，query参数放在URL中，data为空
            url = f"{ALLTICK_BASE_URL}/trade-tick?token={ALLTICK_TOKEN}&query={urllib.parse.quote(query_json)}"
            response = await client.post(
                url,
                headers={
                    "accept": "application/json"
                }
            )
            
            try:
                api_response = response.json()
            except:
                api_response = {"error": response.text}
            
            ret_code = api_response.get("ret", response.status_code)
            
            if response.status_code == 200 and ret_code == 200:
                logger.info(f"[Trade-Tick成功] Symbol: {symbol} | Ret: {ret_code}")
                return JSONResponse(content=api_response, status_code=200)
            else:
                error_data = {
                    "ret": ret_code,
                    "msg": api_response.get("msg", api_response.get("error", "Unknown error")),
                    "trace": api_response.get("trace", trace_id)
                }
                logger.warning(f"[Trade-Tick错误] Symbol: {symbol} | Ret: {ret_code} | Error: {error_data.get('msg')}")
                return JSONResponse(content=error_data, status_code=response.status_code if response.status_code != 200 else 400)
                
    except httpx.TimeoutException as e:
        logger.error(f"[Trade-Tick超时] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=504, detail="请求超时")
    except httpx.RequestError as e:
        logger.error(f"[Trade-Tick请求错误] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"请求错误: {str(e)}")
    except Exception as e:
        logger.error(f"[Trade-Tick服务器错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


@app.get("/api/depth-tick")
async def get_depth_tick(
    request: Request,
    symbol: str = Query(..., description="产品代码，如Silver等")
):
    """
    获取最新盘口深度接口
    后端直接请求AllTick API，前端无需传递token
    """
    client_ip = request.client.host if request.client else "unknown"
    request_time = datetime.now().isoformat()
    trace_id = f"{uuid.uuid4()}-{int(datetime.now().timestamp() * 1000)}"
    
    logger.info(f"[Depth-Tick请求] IP: {client_ip} | Symbol: {symbol} | Trace: {trace_id}")
    
    try:
        query_data = {
            "trace": trace_id,
            "data": {
                "symbol_list": [
                    {"code": symbol}
                ]
            }
        }
        
        query_json = json.dumps(query_data, ensure_ascii=False)
        # httpx会自动对params进行URL编码，所以我们直接传JSON字符串，不需要手动编码
        # 但为了避免双重编码问题，我们使用data参数而不是params
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 使用POST请求，query参数放在URL中，data为空
            url = f"{ALLTICK_BASE_URL}/depth-tick?token={ALLTICK_TOKEN}&query={urllib.parse.quote(query_json)}"
            response = await client.post(
                url,
                headers={
                    "accept": "application/json"
                }
            )
            
            try:
                api_response = response.json()
            except:
                api_response = {"error": response.text}
            
            ret_code = api_response.get("ret", response.status_code)
            
            if response.status_code == 200 and ret_code == 200:
                logger.info(f"[Depth-Tick成功] Symbol: {symbol} | Ret: {ret_code}")
                return JSONResponse(content=api_response, status_code=200)
            else:
                error_data = {
                    "ret": ret_code,
                    "msg": api_response.get("msg", api_response.get("error", "Unknown error")),
                    "trace": api_response.get("trace", trace_id)
                }
                logger.warning(f"[Depth-Tick错误] Symbol: {symbol} | Ret: {ret_code} | Error: {error_data.get('msg')}")
                return JSONResponse(content=error_data, status_code=response.status_code if response.status_code != 200 else 400)
                
    except httpx.TimeoutException as e:
        logger.error(f"[Depth-Tick超时] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=504, detail="请求超时")
    except httpx.RequestError as e:
        logger.error(f"[Depth-Tick请求错误] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"请求错误: {str(e)}")
    except Exception as e:
        logger.error(f"[Depth-Tick服务器错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


@app.get("/health")
async def health_check():
    """健康检查接口"""
    logger.info("[健康检查] 服务正常")
    return {"status": "ok", "service": "白银K线监控"}


# 挂载前端静态文件（CSS、JS等）
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# 添加静态文件路由，使前端资源可以直接访问（放在最后，避免匹配API路由）
@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    """服务前端静态文件"""
    if file_path in ["", "index.html"]:
        return FileResponse(str(FRONTEND_DIR / "index.html"))
    
    file = FRONTEND_DIR / file_path
    if file.exists() and file.is_file():
        return FileResponse(str(file))
    
    # 如果是API路径，返回404
    if file_path.startswith("api/") or file_path.startswith("docs") or file_path.startswith("openapi.json"):
        raise HTTPException(status_code=404, detail="Not found")
    
    # 其他情况返回index.html（用于SPA路由）
    return FileResponse(str(FRONTEND_DIR / "index.html"))


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

