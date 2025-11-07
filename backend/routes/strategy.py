"""
策略分析路由模块
调用大模型API进行交易策略分析
"""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import httpx
import logging
import json
import os
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/strategy", tags=["策略分析"])


class Message(BaseModel):
    role: str
    content: str


class StrategyAnalysisRequest(BaseModel):
    model: str
    systemPrompt: str
    messages: List[Message]


class TradingAdvice(BaseModel):
    action: str
    confidence: int
    riskLevel: str
    entryPrice: float
    stopLoss: float
    takeProfit: float
    lots: int
    londonPricePrediction15min: float
    pricePrediction15min: float


class StrategyAnalysisData(BaseModel):
    tradingAdvice: TradingAdvice
    analysisReason: str
    nextSteps: str


# 导入配置
from ..config.settings import LLM_API_BASE_URL, LLM_API_KEY

# 模型映射表
MODEL_MAPPING = {
    'deepseek-chat': 'deepseek-chat',
    'doubao-seed-1-6-thinking-250715': 'doubao-seed-1-6-thinking-250715',
    'qwen3-max': 'qwen3-max',
    'glm-4.6': 'glm-4.6',
    'MiniMax-M2': 'MiniMax-M2',
    'kimi-k2-0905-preview': 'kimi-k2-0905-preview',
    'gpt-5': 'gpt-5',
    'claude-sonnet-4-5': 'claude-sonnet-4.5-20241022',
    'google-ai-studio/gemini-2.5-pro': 'google-ai-studio/gemini-2.5-pro',
    'grok/grok-4': 'grok/grok-4',
}


@router.post("/analyze")
async def analyze_strategy(request_data: StrategyAnalysisRequest):
    """
    调用大模型分析交易策略
    
    接收市场数据和系统提示词，调用大模型进行分析，返回结构化的交易建议
    """
    try:
        logger.info(f"[策略分析] 开始分析，模型: {request_data.model}")
        
        # 获取映射的模型名称
        model_name = MODEL_MAPPING.get(request_data.model, 'deepseek-chat')
        
        # 构建发送给大模型的消息
        messages = []
        
        # 添加系统提示词
        messages.append({
            "role": "system",
            "content": request_data.systemPrompt
        })
        
        # 添加用户消息
        for msg in request_data.messages:
            messages.append({
                "role": msg.role,
                "content": msg.content
            })
        
        logger.info(f"[策略分析] 消息数量: {len(messages)}, 使用模型: {model_name}")
        
        # 调用大模型API
        api_url = f"{LLM_API_BASE_URL}/chat/completions"
        
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 4000,
        }
        
        # 如果是JSON输出模式支持的模型，添加response_format
        if model_name in ['gpt-4', 'gpt-4-turbo', 'gpt-5']:
            payload["response_format"] = {"type": "json_object"}
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                api_url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"[策略分析] API错误: {response.status_code} - {error_text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"大模型API调用失败: {error_text}"
                )
            
            result = response.json()
            
            # 提取模型返回的内容
            if 'choices' in result and len(result['choices']) > 0:
                content = result['choices'][0]['message']['content']
                logger.info(f"[策略分析] 收到模型响应，长度: {len(content)}")
                
                # 解析JSON响应
                try:
                    # 尝试直接解析JSON
                    strategy_data = json.loads(content)
                except json.JSONDecodeError:
                    # 如果解析失败，尝试提取JSON部分
                    logger.warning("[策略分析] JSON解析失败，尝试提取JSON部分")
                    
                    # 查找JSON代码块
                    if '```json' in content:
                        json_start = content.find('```json') + 7
                        json_end = content.find('```', json_start)
                        json_content = content[json_start:json_end].strip()
                        strategy_data = json.loads(json_content)
                    elif '```' in content:
                        json_start = content.find('```') + 3
                        json_end = content.find('```', json_start)
                        json_content = content[json_start:json_end].strip()
                        strategy_data = json.loads(json_content)
                    else:
                        # 尝试查找第一个{和最后一个}
                        first_brace = content.find('{')
                        last_brace = content.rfind('}')
                        if first_brace != -1 and last_brace != -1:
                            json_content = content[first_brace:last_brace+1]
                            strategy_data = json.loads(json_content)
                        else:
                            raise ValueError("无法从模型响应中提取JSON数据")
                
                # 验证数据结构
                if 'tradingAdvice' not in strategy_data:
                    logger.error(f"[策略分析] 响应格式错误: {strategy_data}")
                    raise ValueError("模型响应缺少tradingAdvice字段")
                
                logger.info(f"[策略分析] 分析完成，建议: {strategy_data['tradingAdvice']['action']}")
                
                # 返回标准格式
                return JSONResponse(
                    content={
                        "ret": 200,
                        "msg": "ok",
                        "data": strategy_data
                    },
                    status_code=200
                )
            else:
                logger.error(f"[策略分析] API响应格式错误: {result}")
                raise HTTPException(
                    status_code=500,
                    detail="大模型API响应格式错误"
                )
    
    except httpx.TimeoutException as e:
        logger.error(f"[策略分析] 请求超时: {str(e)}")
        raise HTTPException(status_code=504, detail="大模型API请求超时")
    
    except httpx.RequestError as e:
        logger.error(f"[策略分析] 请求错误: {str(e)}")
        raise HTTPException(status_code=502, detail=f"大模型API请求错误: {str(e)}")
    
    except json.JSONDecodeError as e:
        logger.error(f"[策略分析] JSON解析错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"模型响应JSON解析失败: {str(e)}")
    
    except Exception as e:
        logger.error(f"[策略分析] 未知错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"策略分析失败: {str(e)}")

