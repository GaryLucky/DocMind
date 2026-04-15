from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_text(*, text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    # 初始化切块器
    # 它会按顺序尝试分割符：双换行 -> 单换行 -> 空格 -> 字符
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        is_separator_regex=False,
    )

    # 直接调用 split_text 即可，内部已处理边界逻辑
    return splitter.split_text(text)