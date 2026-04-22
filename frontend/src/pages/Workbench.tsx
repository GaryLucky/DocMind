import { CloudUpload, FileText, Search, Globe, Sparkles, Wand2, GitCompare, GitMerge, MessageSquare } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";

import AsyncStateBanner, {
  type AsyncStatus,
} from "@/components/common/AsyncStateBanner";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import ResultCard from "@/components/common/ResultCard";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import Textarea from "@/components/common/Textarea";
import {
  apiChat,
  apiQa,
  apiSearch,
  apiSummarize,
  apiTranslate,
  apiAnalyze,
  apiCompare,
  apiMerge,
  apiUploadDoc,
  apiListDocs,
  apiGetDoc,
  apiDeleteDoc,
  apiExportMe,
  apiExportResult,
  isAbortError,
} from "@/api";
import type { ChatMessage } from "@/api/types";
import { clampNumber } from "@/lib/format";

type ToolKey = "summarize" | "translate" | "analyze" | "convert" | "compare" | "merge" | "qa" | "chat" | "search";

type Document = {
  id: number;
  title: string;
  owner: string;
  created_at: string;
  content_length?: number;
  content?: string;
};

export default function Workbench() {
  const [selectedTool, setSelectedTool] = useState<ToolKey>("summarize");
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [aborter, setAborter] = useState<AbortController | null>(null);

  // 文档管理状态
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadChunkSize, setUploadChunkSize] = useState("");
  const [uploadChunkOverlap, setUploadChunkOverlap] = useState("");

  // 工具状态
  const [inputText, setInputText] = useState("");
  const [resultTitle, setResultTitle] = useState("结果");
  const [resultText, setResultText] = useState<string | undefined>(undefined);
  const [resultExtra, setResultExtra] = useState<React.ReactNode>(null);
  const [documentSelectionTarget, setDocumentSelectionTarget] = useState<string | null>(null);

  // 工具参数
  const [maxLength, setMaxLength] = useState(200);
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [compareText2, setCompareText2] = useState("");
  const [mergeTexts, setMergeTexts] = useState<string[]>(["", ""]);
  const [smartMerge, setSmartMerge] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [question, setQuestion] = useState("");
  const [searchQueryText, setSearchQueryText] = useState("");
  const [topK, setTopK] = useState(8);

  // 导出功能状态
  type ExportFormat = "md" | "txt" | "pdf" | "docx";
  const isExportFormat = (v: string): v is ExportFormat => v === "md" || v === "txt" || v === "pdf" || v === "docx";
  const [exportFormat, setExportFormat] = useState<ExportFormat>("md");

  // 工具列表
  const toolItems: TabItem<ToolKey>[] = useMemo(
    () => [
      { key: "summarize", label: "摘要", icon: <Wand2 className="h-4 w-4" /> },
      { key: "translate", label: "翻译", icon: <Globe className="h-4 w-4" /> },
      { key: "analyze", label: "分析", icon: <FileText className="h-4 w-4" /> },
      { key: "convert", label: "转换", icon: <FileText className="h-4 w-4" /> },
      { key: "compare", label: "比较", icon: <GitCompare className="h-4 w-4" /> },
      { key: "merge", label: "合并", icon: <GitMerge className="h-4 w-4" /> },
      { key: "qa", label: "问答", icon: <Sparkles className="h-4 w-4" /> },
      { key: "chat", label: "对话", icon: <MessageSquare className="h-4 w-4" /> },
      { key: "search", label: "检索", icon: <Search className="h-4 w-4" /> },
    ],
    []
  );

  // 加载文档列表
  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const data = await apiListDocs();
      setDocuments(data.items);
    } catch (e) {
      console.error("Failed to load documents:", e);
    }
  }

  // 处理文档上传
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const chunkSize = uploadChunkSize.trim() ? Number(uploadChunkSize) : null;
    const chunkOverlap = uploadChunkOverlap.trim() ? Number(uploadChunkOverlap) : null;
    const hasInvalidChunkSize = chunkSize != null && (!Number.isFinite(chunkSize) || chunkSize < 100 || chunkSize > 5000);
    const hasInvalidChunkOverlap =
      chunkOverlap != null && (!Number.isFinite(chunkOverlap) || chunkOverlap < 0 || chunkOverlap > 2000);
    if (hasInvalidChunkSize || hasInvalidChunkOverlap || (chunkSize != null && chunkOverlap != null && chunkOverlap >= chunkSize)) {
      setStatus("error");
      setError("分块参数不合法（overlap 必须小于 chunk_size）");
      return;
    }

    setStatus("loading");
    setUploadProgress(0);

    try {
      // 处理多个文件
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 模拟上传进度
        const progress = Math.round((i / files.length) * 100);
        setUploadProgress(progress);

        await apiUploadDoc({ file, title: file.name, chunk_size: chunkSize, chunk_overlap: chunkOverlap });
      }

      setUploadProgress(100);

      // 重新加载文档列表
      await loadDocuments();
      setStatus("success");
      setError(undefined);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setTimeout(() => setUploadProgress(null), 1000);
    }
  }

  // 选择文档
  async function selectDocument(doc: Document) {
    setStatus("loading");
    setError(undefined);
    try {
      // 获取完整的文档信息，包括内容
      const fullDoc = await apiGetDoc(doc.id);
      
      // 根据 documentSelectionTarget 来决定将文档内容设置到哪个文本框
      if (documentSelectionTarget === "compareText2") {
        setCompareText2(fullDoc.content || "");
        // 重置选择目标
        setDocumentSelectionTarget(null);
      } else {
        setSelectedDocument(fullDoc);
        setInputText(fullDoc.content || "");
      }
      
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "获取文档内容失败");
    }
  }



  // 删除文档
  async function deleteDocument(doc: Document) {
    if (!confirm(`确定要删除文档 "${doc.title}" 吗？`)) return;
    
    try {
      setStatus("loading");
      await apiDeleteDoc(doc.id);
      // 重新加载文档列表
      await loadDocuments();
      // 如果删除的是当前选中的文档，清空选择
      if (selectedDocument?.id === doc.id) {
        setSelectedDocument(null);
        setInputText("");
      }
      setStatus("success");
      setError(undefined);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  // 导出结果
  async function exportResult() {
    if (!resultText && !resultExtra) return;
    
    setStatus("loading");
    setError(undefined);
    try {
      // 构建导出内容
      let exportContent = resultText || "";
      
      // 如果有额外的结果内容，也添加到导出内容中
      if (resultExtra) {
        // 这里简单处理，实际项目中可能需要更复杂的处理
        exportContent += "\n\n---\n\n" + "额外结果内容";
      }
      
      const res = await apiExportResult(exportContent, exportFormat, resultTitle);
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `result-export.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "导出失败");
    }
  }

  // 清除输入
  function clearInputs() {
    setInputText("");
    setSelectedDocument(null);
    setCompareText2("");
    setMergeTexts(["", ""]);
    setChatInput("");
    setChatMessages([]);
    setQuestion("");
    setSearchQueryText("");
    setError(undefined);
    setStatus("idle");
    resetResult();
  }

  // 重置结果
  function resetResult() {
    setResultTitle("结果");
    setResultText(undefined);
    setResultExtra(null);
  }

  // 检查是否可以运行
  const canRun = useMemo(() => {
    if (status === "loading") return false;
    
    switch (selectedTool) {
      case "summarize":
      case "translate":
      case "analyze":
      case "convert":
        return inputText.trim().length > 0 || selectedDocument !== null;
      case "compare":
        return (inputText.trim().length > 0 || selectedDocument !== null) && compareText2.trim().length > 0;
      case "merge":
        return mergeTexts.some(text => text.trim().length > 0) || selectedDocument !== null;

      case "qa":
        return question.trim().length > 0;
      case "chat":
        return chatInput.trim().length > 0 || chatMessages.length > 0;
      case "search":
        return searchQueryText.trim().length > 0;
      default:
        return false;
    }
  }, [status, selectedTool, inputText, selectedDocument, compareText2, mergeTexts, question, chatInput, chatMessages.length, searchQueryText]);

  // 运行工具
  async function run() {
    if (!canRun) return;
    const ac = new AbortController();
    setAborter(ac);
    setStatus("loading");
    setError(undefined);
    resetResult();

    try {
      // 获取要处理的文本
      let textToProcess = inputText;
      if (selectedDocument) {
        // 如果有选中文档，使用文档内容
        textToProcess = selectedDocument.content || "";
        // 如果文档内容为空，获取完整的文档信息
        if (!textToProcess) {
          const fullDoc = await apiGetDoc(selectedDocument.id);
          textToProcess = fullDoc.content || "";
        }
      }
      
      switch (selectedTool) {
        case "summarize": {
          setResultTitle("摘要结果");
          const sumData = await apiSummarize({ text: textToProcess, max_length: maxLength }, ac.signal);
          setResultText(sumData.summary);
          break;
        }

        case "translate": {
          setResultTitle("翻译结果");
          const transData = await apiTranslate(
            { text: textToProcess, target_language: targetLanguage, source_language: sourceLanguage || null },
            ac.signal
          );
          setResultText(transData.translation);
          break;
        }

        case "analyze": {
          setResultTitle("分析结果");
          const analyzeData = await apiAnalyze({ text: textToProcess }, ac.signal);
          const readability = analyzeData.readability as Record<string, unknown>;
          const stats = analyzeData.statistics as Record<string, unknown>;
          const readabilityScore = typeof readability["score"] === "number" ? readability["score"] : undefined;
          const readabilityLevel = typeof readability["level"] === "string" ? readability["level"] : undefined;
          const avgWordLen = typeof stats["average_word_length"] === "number" ? stats["average_word_length"] : undefined;
          const avgSentenceLen = typeof stats["average_sentence_length"] === "number" ? stats["average_sentence_length"] : undefined;
          setResultText(undefined);
          setResultExtra(
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-zinc-700">可读性</div>
                <div className="mt-1 text-sm text-zinc-900">
                  评分: {readabilityScore ?? "-"} / 100<br />
                  级别: {readabilityLevel ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-700">统计信息</div>
                <div className="mt-1 text-sm text-zinc-900">
                  字数: {typeof stats["word_count"] === "number" ? stats["word_count"] : "-"}<br />
                  句子数: {typeof stats["sentence_count"] === "number" ? stats["sentence_count"] : "-"}<br />
                  段落数: {typeof stats["paragraph_count"] === "number" ? stats["paragraph_count"] : "-"}<br />
                  字符数: {typeof stats["character_count"] === "number" ? stats["character_count"] : "-"}<br />
                  平均词长: {typeof avgWordLen === "number" ? avgWordLen.toFixed(2) : "-"}<br />
                  平均句长: {typeof avgSentenceLen === "number" ? avgSentenceLen.toFixed(2) : "-"}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-700">关键词</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {analyzeData.keywords.map((keyword: string, idx: number) => (
                    <span key={idx} className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
          break;
        }

        case "convert": {
          setResultTitle(`转换结果 (导出为 ${exportFormat})`);
          try {
            const res = await apiExportMe(exportFormat, ac.signal);
            const url = URL.createObjectURL(res.blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = res.filename || `converted-result.${exportFormat}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            setResultText(`文件已成功导出为 ${exportFormat} 格式`);
          } catch (e) {
            setError(e instanceof Error ? e.message : "导出失败");
            setStatus("error");
            return;
          }
          break;
        }

        case "compare": {
          setResultTitle("比较结果");
          const compareData = await apiCompare(
            { text1: textToProcess, text2: compareText2 },
            ac.signal
          );
          const compareStats = compareData.statistics as Record<string, unknown>;
          setResultText(undefined);
          setResultExtra(
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-zinc-700">相似度</div>
                <div className="mt-1 text-sm text-zinc-900">{Math.round(compareData.similarity * 100)}%</div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-700">统计信息</div>
                <div className="mt-1 text-sm text-zinc-900">
                  字数差异: {typeof compareStats["length_diff"] === "number" ? compareStats["length_diff"] : "-"}<br />
                  文本1字数: {typeof compareStats["text1_word_count"] === "number" ? compareStats["text1_word_count"] : "-"}<br />
                  文本2字数: {typeof compareStats["text2_word_count"] === "number" ? compareStats["text2_word_count"] : "-"}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-700">差异</div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-zinc-900">
                  {compareData.differences.join("\n") || "无差异"}
                </div>
              </div>
            </div>
          );
          break;
        }

        case "merge": {
          setResultTitle("合并结果");
          const mergeData = await apiMerge(
            { texts: mergeTexts.filter((text) => text.trim().length > 0), smart_merge: smartMerge },
            ac.signal
          );
          setResultText(mergeData.result);
          break;
        }

        case "qa": {
          setResultTitle("问答结果");
          const qaData = await apiQa(
            { question: question, doc_id: selectedDocument?.id || null },
            ac.signal
          );
          setResultText(qaData.answer);
          setResultExtra(
            <div className="space-y-2">
              {qaData.citations.length ? (
                qaData.citations.map((c) => (
                  <div
                    key={c.chunk_id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <div className="text-xs text-zinc-600">
                      doc:{c.doc_id} · chunk:{c.chunk_index} · score {c.score.toFixed(3)}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-zinc-900">{c.content}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-500">无引用片段</div>
              )}
            </div>
          );
          break;
        }

        case "chat": {
          setResultTitle("对话");
          const nextMessages: ChatMessage[] = chatInput.trim()
            ? [...chatMessages, { role: "user", content: chatInput.trim() }]
            : chatMessages;
          setChatInput("");
          const chatData = await apiChat({ messages: nextMessages }, ac.signal);
          const finalMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: chatData.reply }];
          setChatMessages(finalMessages);
          setResultExtra(
            <div className="space-y-2">
              {finalMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    m.role === "assistant"
                      ? "rounded-lg border border-zinc-200 bg-white p-3"
                      : "rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                  }
                >
                  <div className="text-xs text-zinc-600">{m.role}</div>
                  <div className="mt-1 text-sm leading-6 text-zinc-900">{m.content}</div>
                </div>
              ))}
            </div>
          );
          setResultText(undefined);
          break;
        }

        case "search": {
          setResultTitle("检索结果");
          const searchData = await apiSearch(
            {
              query: searchQueryText,
              top_k: clampNumber(topK, { min: 1, max: 50 }),
              document_ids: selectedDocument ? [selectedDocument.id] : null,
            },
            ac.signal
          );
          setResultExtra(
            <div className="space-y-2">
              {searchData.results.length ? (
                searchData.results.map((r) => (
                  <div
                    key={r.chunk_id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-zinc-600">
                        doc:{r.doc_id} · chunk:{r.chunk_index}
                      </div>
                      <div className="text-xs text-zinc-500">score {r.score.toFixed(3)}</div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-zinc-900">{r.content}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-500">未检索到结果</div>
              )}
            </div>
          );
          setResultText(undefined);
          break;
        }
      }

      setStatus("success");
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) {
        setStatus("idle");
        setError(undefined);
        return;
      }
      const msg = e instanceof Error ? e.message : "请求失败";
      setError(msg);
      setStatus("error");
    } finally {
      setAborter(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* 左侧文档管理面板 */}
        <aside className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="space-y-6">
            <h2 className="text-sm font-semibold text-zinc-900">文档管理</h2>
              
            {/* 文档上传区域 */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-zinc-500">chunk_size（可选）</div>
                  <Input
                    className="mt-1 h-9"
                    type="number"
                    min={100}
                    max={5000}
                    placeholder="默认"
                    value={uploadChunkSize}
                    onChange={(e) => setUploadChunkSize(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-500">overlap（可选）</div>
                  <Input
                    className="mt-1 h-9"
                    type="number"
                    min={0}
                    max={2000}
                    placeholder="默认"
                    value={uploadChunkOverlap}
                    onChange={(e) => setUploadChunkOverlap(e.target.value)}
                  />
                </div>
              </div>
              <label
                htmlFor="file-upload"
                className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100"
              >
                <input
                  id="file-upload"
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".txt,.md,.docx,.pdf,.html,.json,.yaml,.yml,.csv,.xlsx,.pptx"
                  multiple
                />
                <CloudUpload className="mb-2 h-8 w-8 text-zinc-400" />
                <span className="text-sm text-zinc-600">拖拽文件到此处或点击上传</span>
              </label>
              {uploadProgress !== null && (
                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{uploadProgress}%</div>
                </div>
              )}
            </div>

            {/* 文档搜索 */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  className="pl-10"
                  placeholder="搜索文档..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* 文档列表 */}
            <div>
              <h3 className="text-xs font-medium text-zinc-700">我的文档</h3>
              <div className="space-y-2">
                {documents
                  .filter(doc => doc.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((doc) => {
                    // 获取文件类型图标
                    const getFileIcon = (filename: string) => {
                      const ext = filename.split('.').pop()?.toLowerCase();
                      switch (ext) {
                        case 'txt': return <FileText className="h-4 w-4 text-zinc-500" />;
                        case 'md': return <FileText className="h-4 w-4 text-blue-500" />;
                        case 'docx': return <FileText className="h-4 w-4 text-blue-600" />;
                        case 'pdf': return <FileText className="h-4 w-4 text-red-500" />;
                        case 'html': return <FileText className="h-4 w-4 text-orange-500" />;
                        case 'json': return <FileText className="h-4 w-4 text-green-500" />;
                        case 'yaml':
                        case 'yml': return <FileText className="h-4 w-4 text-purple-500" />;
                        case 'csv': return <FileText className="h-4 w-4 text-green-600" />;
                        case 'xlsx': return <FileText className="h-4 w-4 text-green-700" />;
                        case 'pptx': return <FileText className="h-4 w-4 text-orange-600" />;
                        default: return <FileText className="h-4 w-4 text-zinc-400" />;
                      }
                    };
                    
                    return (
                      <div
                        key={doc.id}
                        className={`rounded-lg border border-zinc-200 p-3 transition-colors ${selectedDocument?.id === doc.id ? 'bg-blue-50 border-blue-200' : 'hover:bg-zinc-50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {getFileIcon(doc.title)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div 
                                className="text-sm font-medium text-zinc-900 truncate cursor-pointer" 
                                onClick={() => selectDocument(doc)}
                              >
                                {doc.title}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {new Date(doc.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs text-zinc-600">
                              <span>{doc.owner}</span>
                              <span>字数: {doc.content_length || 0}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button 
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() => selectDocument(doc)}
                          >
                            选择
                          </button>
                          <button 
                            className="text-xs text-zinc-600 hover:text-red-600"
                            onClick={() => deleteDocument(doc)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </aside>

        {/* 主内容区域 */}
        <main className="min-w-0">
          <div className="space-y-6">
            {/* 工具选择 */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">工具</h2>
              <Tabs items={toolItems} value={selectedTool} onChange={(v) => setSelectedTool(v)} />
            </div>

            {/* 工具操作面板 */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">操作</h2>
              
              {/* 工具输入表单 */}
              <div className="space-y-4">
                {/* 摘要工具 */}
                {selectedTool === "summarize" && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-zinc-700">文本</div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-zinc-500">最大长度</div>
                        <Input
                          className="h-9 w-[84px]"
                          type="number"
                          min={1}
                          max={2000}
                          value={String(maxLength)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const n = raw.trim() ? Number(raw) : 200;
                            setMaxLength(clampNumber(n, { min: 1, max: 2000 }));
                          }}
                        />
                      </div>
                    </div>
                    {selectedDocument ? (
                      <div className="mt-1 rounded-lg border border-zinc-200 bg-blue-50 p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-zinc-900">{selectedDocument.title}</div>
                            <div className="text-xs text-zinc-600">选中的文档</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Textarea
                        className="mt-1"
                        placeholder="输入需要总结的文本..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      />
                    )}
                  </div>
                )}

                {/* 翻译工具 */}
                {selectedTool === "translate" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">文本</div>
                    {selectedDocument ? (
                      <div className="mt-1 rounded-lg border border-zinc-200 bg-blue-50 p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-zinc-900">{selectedDocument.title}</div>
                            <div className="text-xs text-zinc-600">选中的文档</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Textarea
                        className="mt-1"
                        placeholder="输入需要翻译的文本..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      />
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-zinc-500">源语言（可选）</div>
                        <Input
                          className="mt-1"
                          placeholder="如 zh, en"
                          value={sourceLanguage}
                          onChange={(e) => setSourceLanguage(e.target.value)}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">目标语言</div>
                        <Input
                          className="mt-1"
                          placeholder="如 en, zh"
                          value={targetLanguage}
                          onChange={(e) => setTargetLanguage(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 分析工具 */}
                {selectedTool === "analyze" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">文本</div>
                    {selectedDocument ? (
                      <div className="mt-1 rounded-lg border border-zinc-200 bg-blue-50 p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-zinc-900">{selectedDocument.title}</div>
                            <div className="text-xs text-zinc-600">选中的文档</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Textarea
                        className="mt-1"
                        placeholder="输入需要分析的文本..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      />
                    )}
                  </div>
                )}

                {/* 转换工具 */}
                {selectedTool === "convert" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">文本</div>
                    {selectedDocument ? (
                      <div className="mt-1 rounded-lg border border-zinc-200 bg-blue-50 p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-zinc-900">{selectedDocument.title}</div>
                            <div className="text-xs text-zinc-600">选中的文档</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Textarea
                        className="mt-1"
                        placeholder="输入需要转换的文本..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      />
                    )}
                    <div className="mt-2">
                      <div className="text-xs text-zinc-500">导出格式</div>
                      <select
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                        value={exportFormat}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (isExportFormat(v)) setExportFormat(v);
                        }}
                      >
                        <option value="md">Markdown (MD)</option>
                        <option value="txt">文本 (TXT)</option>
                        <option value="pdf">PDF 文档</option>
                        <option value="docx">Word 文档 (DOCX)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 比较工具 */}
                {selectedTool === "compare" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">文本 1</div>
                    {selectedDocument ? (
                      <div className="mt-1 rounded-lg border border-zinc-200 bg-blue-50 p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-zinc-900">{selectedDocument.title}</div>
                            <div className="text-xs text-zinc-600">选中的文档</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Textarea
                        className="mt-1"
                        placeholder="输入第一个文档..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      />
                    )}
                    <div className="mt-3 text-xs font-medium text-zinc-700">文本 2</div>
                    <div className="mt-1 space-y-2">
                      <Textarea
                        className="mt-1"
                        placeholder="输入第二个文档..."
                        value={compareText2}
                        onChange={(e) => setCompareText2(e.target.value)}
                      />
                      <div>
                        <button
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => {
                            // 设置文档选择目标为第二个文本框
                            setDocumentSelectionTarget("compareText2");
                          }}
                        >
                          从文档库选择
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 合并工具 */}
                {selectedTool === "merge" && (
                  <div>
                    {/* 已选择的文档 */}
                    {selectedDocument && (
                      <div className="mb-3 rounded-lg border border-zinc-200 bg-blue-50 p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-zinc-900">{selectedDocument.title}</div>
                            <div className="text-xs text-zinc-600">选中的文档</div>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              // 将选中文档添加到合并列表
                              setMergeTexts([...mergeTexts, selectedDocument.content || ""]);
                            }}
                          >
                            添加到合并列表
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {/* 合并文本列表 */}
                    {mergeTexts.map((text, index) => (
                      <div key={index} className="mb-3">
                        <div className="text-xs font-medium text-zinc-700">文本 {index + 1}</div>
                        <Textarea
                          className="mt-1"
                          placeholder={`输入需要合并的文本 ${index + 1}...`}
                          value={text}
                          onChange={(e) => {
                            const newTexts = [...mergeTexts];
                            newTexts[index] = e.target.value;
                            setMergeTexts(newTexts);
                          }}
                        />
                      </div>
                    ))}
                    
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setMergeTexts([...mergeTexts, ""])}
                      >
                        添加文本
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (mergeTexts.length > 1) {
                            setMergeTexts(mergeTexts.slice(0, -1));
                          }
                        }}
                        disabled={mergeTexts.length <= 1}
                      >
                        删除文本
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="smart-merge"
                        checked={smartMerge}
                        onChange={(e) => setSmartMerge(e.target.checked)}
                      />
                      <label htmlFor="smart-merge" className="text-xs text-zinc-700">
                        智能去重
                      </label>
                    </div>
                  </div>
                )}

                {/* 问答工具 */}
                {selectedTool === "qa" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">问题</div>
                    <Textarea
                      className="mt-1"
                      placeholder="输入你的问题..."
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                    />
                    <div className="mt-2 text-xs text-zinc-500">
                      {selectedDocument ? `当前文档: ${selectedDocument.title}` : "不选择文档则在全库范围检索"}
                    </div>
                  </div>
                )}

                {/* 对话工具 */}
                {selectedTool === "chat" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">消息</div>
                    <Textarea
                      className="mt-1"
                      placeholder="输入一条消息..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                    />
                    <div className="mt-2 text-xs text-zinc-500">
                      当前实现为简化多轮：将 messages 直接发给后端。
                    </div>
                  </div>
                )}

                {/* 检索工具 */}
                {selectedTool === "search" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">查询</div>
                    <Input
                      className="mt-1"
                      placeholder="输入关键词..."
                      value={searchQueryText}
                      onChange={(e) => setSearchQueryText(e.target.value)}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-xs text-zinc-500">top_k</div>
                      <Input
                        className="h-9 w-[84px]"
                        type="number"
                        min={1}
                        max={50}
                        value={String(topK)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = raw.trim() ? Number(raw) : 8;
                          setTopK(clampNumber(n, { min: 1, max: 50 }));
                        }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      {selectedDocument ? `当前文档: ${selectedDocument.title}` : "不选择文档则在全库范围检索"}
                    </div>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  onClick={run}
                  disabled={!canRun}
                  className="min-w-28"
                >
                  运行
                </Button>
                <Button variant="secondary" onClick={clearInputs}>
                  清空
                </Button>
                {aborter ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      aborter.abort();
                      setAborter(null);
                    }}
                  >
                    取消
                  </Button>
                ) : null}
              </div>

              {/* 状态提示 */}
              <div className="mt-3">
                <AsyncStateBanner status={status} message={error} />
              </div>
            </div>

            {/* 结果展示 */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-zinc-900">{resultTitle}</h2>
                {(resultText || resultExtra) && (
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                      value={exportFormat}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isExportFormat(v)) setExportFormat(v);
                      }}
                    >
                      <option value="md">导出MD</option>
                      <option value="txt">导出TXT</option>
                      <option value="pdf">导出PDF</option>
                      <option value="docx">导出Word</option>
                    </select>
                    <Button variant="secondary" onClick={() => void exportResult()}>
                      导出
                    </Button>
                  </div>
                )}
              </div>
              <ResultCard title={resultTitle} text={resultText} extra={resultExtra} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
