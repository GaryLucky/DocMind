from app.infra.llm.openai_compatible import OpenAICompatibleLLM


async def summarize_text(llm: OpenAICompatibleLLM, text: str, max_length: int) -> str:
    system_prompt = f"你是一个专业的摘要助手。请为以下文本生成摘要，尽量控制在 {max_length} 字以内。"
    user_prompt = f"需要摘要的文本：\n{text}"
    return await llm.chat(system=system_prompt, user=user_prompt)


async def rewrite_text(llm: OpenAICompatibleLLM, text: str, style: str) -> str:
    system_prompt = f"你是一个专业的文本重写助手。请将以下文本重写为 {style} 风格。确保语义不变，但调整表达方式。"
    user_prompt = f"需要重写的文本：\n{text}"
    return await llm.chat(system=system_prompt, user=user_prompt)


async def chat_with_history(llm: OpenAICompatibleLLM, messages: list[dict[str, str]]) -> str:
    """
    messages 格式如: [{"role": "user", "content": "hello"}, ...]
    """
    # 确保系统 prompt 存在
    has_system = any(m["role"] == "system" for m in messages)
    final_messages = []
    if not has_system:
        final_messages.append({
            "role": "system",
            "content": "你是一个智能文档助手，负责回答用户的问题或进行对话。"
        })
    final_messages.extend(messages)
    
    return await llm.chat_messages(messages=final_messages)
