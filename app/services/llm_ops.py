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


try:
    from googletrans import Translator
    translator = Translator()
except ImportError:
    translator = None


try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.tokenize import word_tokenize
    from nltk.probability import FreqDist
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
except ImportError:
    nltk = None


try:
    import markdown
    from bs4 import BeautifulSoup
except ImportError:
    markdown = None


try:
    import difflib
except ImportError:
    difflib = None


async def translate_text(llm,text: str, target_language: str, source_language: str = None) -> str:
    """
    翻译文本
    """
    if translator:
        try:
            result = translator.translate(text, dest=target_language, src=source_language)
            return result.text
        except Exception:
            pass
    #  fallback to LLM translation
    system_prompt = f"你是一个专业的翻译助手。请将以下文本翻译成 {target_language}。"
    user_prompt = f"需要翻译的文本：\n{text}"
    return await llm.chat(system=system_prompt, user=user_prompt)


async def analyze_document(text: str) -> dict:
    """
    分析文档质量
    """
    # 基础统计信息
    words = text.split()
    sentences = text.split('.')
    paragraphs = text.split('\n')
    
    statistics = {
        'word_count': len(words),
        'sentence_count': len(sentences),
        'paragraph_count': len([p for p in paragraphs if p.strip()]),
        'character_count': len(text),
        'average_word_length': sum(len(word) for word in words) / len(words) if words else 0,
        'average_sentence_length': sum(len(sentence.split()) for sentence in sentences if sentence.strip()) / len([s for s in sentences if s.strip()]) if sentences else 0
    }
    
    # 可读性评分（简化版）
    readability = {
        'score': min(100, max(0, 100 - (statistics['average_sentence_length'] - 10) * 2)),
        'level': 'easy' if statistics['average_sentence_length'] < 15 else 'medium' if statistics['average_sentence_length'] < 25 else 'difficult'
    }
    
    # 关键词提取
    keywords = []
    if nltk:
        try:
            tokens = word_tokenize(text.lower())
            stop_words = set(stopwords.words('chinese') + stopwords.words('english'))
            filtered_tokens = [token for token in tokens if token.isalnum() and token not in stop_words]
            freq_dist = FreqDist(filtered_tokens)
            keywords = [word for word, _ in freq_dist.most_common(10)]
        except Exception:
            pass
    
    if not keywords:
        # 简单的关键词提取
        word_freq = {}
        for word in words:
            if len(word) > 2:
                word_freq[word] = word_freq.get(word, 0) + 1
        keywords = [word for word, _ in sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]]
    
    return {
        'readability': readability,
        'statistics': statistics,
        'keywords': keywords
    }


async def convert_format(text: str, input_format: str, output_format: str) -> str:
    """
    格式转换
    """
    if input_format == output_format:
        return text
    
    # Markdown to HTML
    if input_format == 'md' and output_format == 'html':
        if markdown:
            return markdown.markdown(text)
        else:
            # 简单的 markdown 转 html
            lines = text.split('\n')
            html_lines = []
            for line in lines:
                if line.startswith('# '):
                    html_lines.append(f'<h1>{line[2:]}</h1>')
                elif line.startswith('## '):
                    html_lines.append(f'<h2>{line[3:]}</h2>')
                elif line.startswith('### '):
                    html_lines.append(f'<h3>{line[4:]}</h3>')
                elif line.startswith('* '):
                    html_lines.append(f'<li>{line[2:]}</li>')
                else:
                    html_lines.append(f'<p>{line}</p>')
            return '\n'.join(html_lines)
    
    # HTML to Markdown
    if input_format == 'html' and output_format == 'md':
        if markdown and BeautifulSoup:
            soup = BeautifulSoup(text, 'html.parser')
            return soup.get_text()
        else:
            return text
    
    # 其他格式转换
    return text


async def compare_documents(text1: str, text2: str) -> dict:
    """
    比较两个文档
    """
    # 计算相似度
    similarity = 0
    if difflib:
        similarity = difflib.SequenceMatcher(None, text1, text2).ratio()
    
    # 统计信息
    stats1 = len(text1.split())
    stats2 = len(text2.split())
    
    # 找出差异
    differences = []
    if difflib:
        diff = difflib.unified_diff(
            text1.splitlines(),
            text2.splitlines(),
            lineterm='',
            n=2
        )
        differences = list(diff)
    
    return {
        'similarity': similarity,
        'statistics': {
            'length_diff': abs(stats1 - stats2),
            'text1_word_count': stats1,
            'text2_word_count': stats2
        },
        'differences': differences
    }


async def merge_documents(texts: list[str], smart_merge: bool = False) -> str:
    """
    合并多个文档
    """
    if not texts:
        return ''
    
    if not smart_merge:
        return '\n\n'.join(texts)
    
    # 智能去重合并
    merged_text = []
    seen_lines = set()
    
    for text in texts:
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if line and line not in seen_lines:
                merged_text.append(line)
                seen_lines.add(line)
    
    return '\n'.join(merged_text)


async def batch_process(texts: list[str], operations: list[str], max_length: int = 200, target_language: str = 'en', report: bool = False) -> list[dict]:
    """
    批量处理多个文本
    """
    results = []
    
    for i, text in enumerate(texts):
        text_result = {
            'index': i,
            'operations': {}
        }
        
        # 执行摘要
        if 'summarize' in operations:
            try:
                from app.api.deps import get_llm
                from fastapi import Request
                llm = get_llm(Request({}))
                summary = await summarize_text(llm, text, max_length)
                text_result['operations']['summarize'] = summary
            except Exception as e:
                text_result['operations']['summarize'] = f'Error: {str(e)}'
        
        # 执行分析
        if 'analyze' in operations:
            try:
                analysis = await analyze_document(text)
                text_result['operations']['analyze'] = analysis
            except Exception as e:
                text_result['operations']['analyze'] = f'Error: {str(e)}'
        
        # 执行翻译
        if 'translate' in operations:
            try:
                translation = await translate_text(text, target_language)
                text_result['operations']['translate'] = translation
            except Exception as e:
                text_result['operations']['translate'] = f'Error: {str(e)}'
        
        results.append(text_result)
    
    if report:
        # 生成报告
        report_data = {
            'total_texts': len(texts),
            'operations': operations,
            'results': results
        }
        results.append({'report': report_data})
    
    return results

