"""
分析路由模块
提供大模型走势分析接口
"""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
import httpx
import logging
import json
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analysis", tags=["分析接口"])

# 大模型API配置
LLM_API_URL = "https://1256349444-is2nyxcqfv.ap-guangzhou.tencentscf.com/chat"

# 获取prompt文件夹路径
BASE_DIR = Path(__file__).parent.parent
PROMPT_DIR = BASE_DIR / "prompt"
MAIN_PROMPT_FILE = PROMPT_DIR / "mainprompt"


def load_main_prompt() -> str:
    """加载主提示词文件"""
    try:
        if MAIN_PROMPT_FILE.exists():
            with open(MAIN_PROMPT_FILE, 'r', encoding='utf-8') as f:
                return f.read()
        else:
            logger.warning(f"提示词文件不存在: {MAIN_PROMPT_FILE}")
            return "你是一个专业的金融分析师，请根据提供的K线数据进行分析。"
    except Exception as e:
        logger.error(f"加载提示词文件失败: {e}", exc_info=True)
        return "你是一个专业的金融分析师，请根据提供的K线数据进行分析。"


def format_kline_data_for_prompt(kline_data: List[Dict[str, Any]]) -> str:
    """将K线数据格式化为提示词文本"""
    if not kline_data or len(kline_data) == 0:
        return "暂无K线数据"
    
    # 格式化K线数据为文本
    lines = ["以下是K线数据（格式：时间戳, 开盘价, 收盘价, 最高价, 最低价, 成交量）："]
    lines.append("")
    
    for item in kline_data:
        timestamp = item.get('t', item.get('time', ''))
        open_price = item.get('o', item.get('open', 0))
        close_price = item.get('c', item.get('close', 0))
        high_price = item.get('h', item.get('high', 0))
        low_price = item.get('l', item.get('low', 0))
        volume = item.get('v', item.get('volume', 0))
        
        lines.append(f"{timestamp}, {open_price}, {close_price}, {high_price}, {low_price}, {volume}")
    
    lines.append("")
    lines.append("请根据以上K线数据进行技术分析，并按照JSON格式输出分析结果。")
    
    return "\n".join(lines)


@router.post("/analyze")
async def analyze_trend(
    request: Request,
    kline_data: List[Dict[str, Any]]
):
    """
    分析K线走势接口
    接收前端传来的K线数据，调用大模型进行分析
    """
    client_ip = request.client.host if request.client else "unknown"
    request_time = datetime.now().isoformat()
    
    logger.info(f"[分析请求] IP: {client_ip} | 数据条数: {len(kline_data) if kline_data else 0}")
    
    try:
        # 验证输入数据
        if not kline_data or len(kline_data) == 0:
            raise HTTPException(status_code=400, detail="K线数据不能为空")
        
        # 加载系统提示词
        system_prompt = load_main_prompt()
        
        # 格式化用户提示词（K线数据）
        user_prompt = format_kline_data_for_prompt(kline_data)
        
        # 构建消息数组（只包含用户消息）
        messages = [
            {
                "role": "user",
                "content": user_prompt
            }
        ]
        
        # 构建请求体（prompt参数放系统提示词，messages数组放用户数据）
        request_body = {
            "prompt": system_prompt,
            "messages": messages
        }
        
        logger.info(f"[LLM请求] URL: {LLM_API_URL}")
        logger.info(f"[LLM请求] 接收K线数据条数: {len(kline_data)}")
        logger.info(f"[LLM请求] Prompt长度: {len(system_prompt)} 字符")
        logger.info(f"[LLM请求] User prompt长度: {len(user_prompt)} 字符")
        logger.info(f"[LLM请求] Messages数组: {json.dumps(messages, ensure_ascii=False)}")
        logger.info(f"[LLM请求] 完整请求体: {json.dumps(request_body, ensure_ascii=False, indent=2)}")
        
        # 调用大模型API
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                LLM_API_URL,
                json=request_body,
                headers={
                    "Content-Type": "application/json",
                    "accept": "application/json"
                }
            )
            
            # 记录响应日志
            response_time = datetime.now().isoformat()
            logger.info(f"[LLM响应] Status: {response.status_code} | Time: {response_time}")
            
            # 解析响应
            if response.status_code == 200:
                try:
                    api_response = response.json()
                    
                    # 尝试解析JSON格式的分析结果
                    # 如果响应是文本格式，尝试提取JSON
                    result_text = api_response.get("content", "") or api_response.get("message", "") or str(api_response)
                    
                    # 尝试解析JSON（可能响应中直接包含JSON字符串）
                    analysis_result = None
                    try:
                        # 如果响应直接是JSON对象
                        if isinstance(api_response, dict) and "trend" in api_response:
                            analysis_result = api_response
                        else:
                            # 尝试从文本中提取JSON
                            import re
                            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', result_text, re.DOTALL)
                            if json_match:
                                analysis_result = json.loads(json_match.group())
                            else:
                                # 如果无法解析JSON，返回原始响应
                                analysis_result = {
                                    "error": "无法解析JSON格式的分析结果",
                                    "raw_response": result_text
                                }
                    except json.JSONDecodeError as e:
                        logger.warning(f"[LLM响应] JSON解析失败: {e}")
                        analysis_result = {
                            "error": "JSON解析失败",
                            "raw_response": result_text
                        }
                    
                    logger.info(f"[分析成功] 数据条数: {len(kline_data)}")
                    return JSONResponse(
                        content=analysis_result,
                        status_code=200
                    )
                    
                except Exception as e:
                    logger.error(f"[LLM响应解析错误] {e}", exc_info=True)
                    raise HTTPException(
                        status_code=500,
                        detail=f"解析大模型响应失败: {str(e)}"
                    )
            else:
                error_text = response.text
                logger.error(f"[LLM API错误] Status: {response.status_code} | Error: {error_text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"大模型API请求失败: {error_text}"
                )
                
    except httpx.TimeoutException as e:
        logger.error(f"[分析超时] Error: {str(e)}")
        raise HTTPException(status_code=504, detail="请求超时，请稍后重试")
    except httpx.RequestError as e:
        logger.error(f"[分析请求错误] Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"请求错误: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[分析服务器错误] Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")

