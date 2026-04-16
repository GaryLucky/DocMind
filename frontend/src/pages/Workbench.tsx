import { CloudUpload, FileText, Search, Settings, User, X, ChevronDown, ChevronRight, RefreshCw, Download, Trash2, Globe, Sparkles, Wand2, GitCompare, GitMerge, CheckCircle, AlertCircle, Clock, MessageSquare } from "lucide-react";
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
  apiRewrite,
  apiSearch,
  apiSummarize,
  apiTranslate,
  apiAnalyze,
  apiConvert,
  apiCompare,
  apiMerge,
  apiBatch,
  apiUploadDoc,
  apiListDocs,
  isAbortError,
} from "@/api";
import { clampNumber } from "@/lib/format";
import { useAppStore } from "@/stores/useAppStore";

type ToolKey = "summarize" | "translate" | "analyze" | "convert" | "compare" | "merge" | "batch" | "qa" | "chat" | "search";

type Document = {
  id: number;
  title: string;
  owner: string;
  created_at: string;
  content?: string;
};

export default function Workbench() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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

  // 工具状态
  const [inputText, setInputText] = useState("");
  const [resultTitle, setResultTitle] = useState("结果");
  const [resultText, setResultText] = useState<string | undefined>(undefined);
  const [resultExtra, setResultExtra] = useState<React.ReactNode>(null);

  // 工具参数
  const [maxLength, setMaxLength] = useState(200);
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [inputFormat, setInputFormat] = useState("md");
  const [outputFormat, setOutputFormat] = useState("html");
  const [compareText2, setCompareText2] = useState("");
  const [mergeTexts, setMergeTexts] = useState<string[]>(["", ""]);
  const [smartMerge, setSmartMerge] = useState(false);
  const [batchTexts, setBatchTexts] = useState<string[]>(["", ""]);
  const [batchOperations, setBatchOperations] = useState<string[]>(["summarize", "analyze"]);
  const [batchMaxLength, setBatchMaxLength] = useState(200);
  const [batchTargetLanguage, setBatchTargetLanguage] = useState("en");
  const [batchReport, setBatchReport] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [question, setQuestion] = useState("");
  const [searchQueryText, setSearchQueryText] = useState("");
  const [topK, setTopK] = useState(8);
  const [rewriteStyle, setRewriteStyle] = useState("professional");
  const [rewriteText, setRewriteText] = useState("");

  // 工具列表
  const toolItems: TabItem<ToolKey>[] = useMemo(
    () => [
      { key: "summarize", label: "摘要", icon: <Wand2 className="h-4 w-4" /> },
      { key: "translate", label: "翻译", icon: <Globe className="h-4 w-4" /> },
      { key: "analyze", label: "分析", icon: <FileText className="h-4 w-4" /> },
      { key: "convert", label: "转换", icon: <FileText className="h-4 w-4" /> },
      { key: "compare", label: "比较", icon: <GitCompare className="h-4 w-4" /> },
      { key: "merge", label: "合并", icon: <GitMerge className="h-4 w-4" /> },
      { key: "batch", label: "批量", icon: <FileText className="h-4 w-4" /> },
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

    setStatus("loading");
    setUploadProgress(0);

    try {
      const file = files[0];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);

      // 模拟上传进度
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setUploadProgress(progress);
        if (progress >= 100) clearInterval(interval);
      }, 200);

      const result = await apiUploadDoc(file, file.name);
      clearInterval(interval);
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
  function selectDocument(doc: Document) {
    setSelectedDocument(doc);
    setInputText(doc.content || "");
  }

  // 清除输入
  function clearInputs() {
    setInputText("");
    setCompareText2("");
    setMergeTexts(["", ""]);
    setBatchTexts(["", ""]);
    setChatInput("");
    setChatMessages([]);
    setQuestion("");
    setSearchQueryText("");
    setRewriteText("");
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
        return inputText.trim().length > 0;
      case "compare":
        return inputText.trim().length > 0 && compareText2.trim().length > 0;
      case "merge":
        return mergeTexts.some(text => text.trim().length > 0);
      case "batch":
        return batchTexts.some(text => text.trim().length > 0) && batchOperations.length > 0;
      case "qa":
        return question.trim().length > 0;
      case "chat":
        return chatInput.trim().length > 0 || chatMessages.length > 0;
      case "search":
        return searchQueryText.trim().length > 0;
      default:
        return false;
    }
  }, [status, selectedTool, inputText, compareText2, mergeTexts, batchTexts, batchOperations, question, chatInput, chatMessages.length, searchQueryText]);

  // 运行工具
  async function run() {
    if (!canRun) return;
    const ac = new AbortController();
    setAborter(ac);
    setStatus("loading");
    setError(undefined);
    resetResult();

    try {
      switch (selectedTool) {
        case "summarize":
          setResultTitle("摘要结果");
          const sumData = await apiSummarize({ text: inputText, max_length: maxLength }, ac.signal);
          setResultText(sumData.summary);
          break;

        case "translate":
          setResultTitle("翻译结果");
          const transData = await apiTranslate(
            { text: inputText, target_language: targetLanguage, source_language: sourceLanguage || null },
            ac.signal
          );
          setResultText(transData.translation);
          break;

        case "analyze":
          setResultTitle("分析结果");
          const analyzeData = await apiAnalyze({ text: inputText }, ac.signal);
          setResultText(undefined);
          setResultExtra(
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-zinc-700">可读性</div>
                <div className="mt-1 text-sm text-zinc-900">
                  评分: {analyzeData.readability.score} / 100<br />
                  级别: {analyzeData.readability.level}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-700">统计信息</div>
                <div className="mt-1 text-sm text-zinc-900">
                  字数: {analyzeData.statistics.word_count}<br />
                  句子数: {analyzeData.statistics.sentence_count}<br />
                  段落数: {analyzeData.statistics.paragraph_count}<br />
                  字符数: {analyzeData.statistics.character_count}<br />
                  平均词长: {analyzeData.statistics.average_word_length?.toFixed(2)}<br />
                  平均句长: {analyzeData.statistics.average_sentence_length?.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-700">关键词</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {analyzeData.keywords.map((keyword, idx) => (
                    <span key={idx} className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
          break;

        case "convert":
          setResultTitle(`转换结果 (${inputFormat} → ${outputFormat})`);
          const convertData = await apiConvert(
            { text: inputText, input_format: inputFormat, output_format: outputFormat },
            ac.signal
          );
          setResultText(convertData.result);
          break;

        case "compare":
          setResultTitle("比较结果");
          const compareData = await apiCompare(
            { text1: inputText, text2: compareText2 },
            ac.signal
          );
          setResultText(undefined);
          setResultExtra(
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-zinc-700">相似度</div>
                <div className="mt-1 text-sm text-zinc-900">
                  {Math.round(compareData.similarity * 100)}%
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-700">统计信息</div>
                <div className="mt-1 text-sm text-zinc-900">
                  字数差异: {compareData.statistics.length_diff}<br />
                  文本1字数: {compareData.statistics.text1_word_count}<br />
                  文本2字数: {compareData.statistics.text2_word_count}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-700">差异</div>
                <div className="mt-1 text-xs text-zinc-900 whitespace-pre-wrap">
                  {compareData.differences.join('\n') || '无差异'}
                </div>
              </div>
            </div>
          );
          break;

        case "merge":
          setResultTitle("合并结果");
          const mergeData = await apiMerge(
            { texts: mergeTexts.filter(text => text.trim().length > 0), smart_merge: smartMerge },
            ac.signal
          );
          setResultText(mergeData.result);
          break;

        case "batch":
          setResultTitle("批量处理结果");
          const batchData = await apiBatch(
            {
              texts: batchTexts.filter(text => text.trim().length > 0),
              operations: batchOperations,
              max_length: batchMaxLength,
              target_language: batchTargetLanguage,
              report: batchReport
            },
            ac.signal
          );
          setResultText(undefined);
          setResultExtra(
            <div className="space-y-4">
              {batchData.results.map((result, idx) => (
                <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3">
                  {result.report ? (
                    <>
                      <div className="text-sm font-medium text-zinc-700">批量处理报告</div>
                      <div className="mt-2 text-xs text-zinc-900">
                        总文本数: {result.report.total_texts}<br />
                        执行操作: {result.report.operations.join(', ')}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-zinc-700">文本 {result.index + 1} 结果</div>
                      <div className="mt-2 space-y-2">
                        {Object.entries(result.operations).map(([op, value]) => (
                          <div key={op}>
                            <div className="text-xs font-medium text-zinc-600">{op}</div>
                            <div className="mt-1 text-xs text-zinc-900 whitespace-pre-wrap">
                              {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          );
          break;

        case "qa":
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

        case "chat":
          setResultTitle("对话");
          const nextMessages = chatInput.trim()
            ? [...chatMessages, { role: "user", content: chatInput.trim() }]
            : chatMessages;
          setChatInput("");
          const chatData = await apiChat({ messages: nextMessages }, ac.signal);
          const finalMessages = [...nextMessages, { role: "assistant", content: chatData.reply }];
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

        case "search":
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
    <div className="flex h-screen flex-col bg-zinc-50">
      {/* 顶部导航栏 */}
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-md p-2 hover:bg-zinc-100"
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          <h1 className="text-xl font-semibold text-zinc-900">DocMind 工作台</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="rounded-full border border-zinc-200 p-2 hover:bg-zinc-100">
            <Settings className="h-5 w-5 text-zinc-600" />
          </button>
          <button className="rounded-full border border-zinc-200 p-2 hover:bg-zinc-100">
            <User className="h-5 w-5 text-zinc-600" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧文档管理面板 */}
        {isSidebarOpen && (
          <aside className="w-80 border-r border-zinc-200 bg-white p-4 overflow-y-auto">
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">文档管理</h2>
              
              {/* 文档上传区域 */}
              <div className="mb-4">
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
                    accept=".txt,.md,.docx,.pdf"
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
              <div className="mb-4">
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
                <h3 className="mb-2 text-xs font-medium text-zinc-700">我的文档</h3>
                <div className="space-y-2">
                  {documents
                    .filter(doc => doc.title.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => selectDocument(doc)}
                        className={`cursor-pointer rounded-lg p-3 transition-colors ${selectedDocument?.id === doc.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-zinc-50'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-zinc-900">{doc.title}</div>
                          <div className="text-xs text-zinc-500">{new Date(doc.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="mt-1 text-xs text-zinc-600">{doc.owner}</div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* 主内容区域 */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* 工具选择 */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">工具</h2>
              <Tabs items={toolItems} value={selectedTool} onChange={setSelectedTool} />
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
                    <Textarea
                      className="mt-1"
                      placeholder="输入需要总结的文本..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                  </div>
                )}

                {/* 翻译工具 */}
                {selectedTool === "translate" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">文本</div>
                    <Textarea
                      className="mt-1"
                      placeholder="输入需要翻译的文本..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
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
                    <Textarea
                      className="mt-1"
                      placeholder="输入需要分析的文本..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                  </div>
                )}

                {/* 转换工具 */}
                {selectedTool === "convert" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">文本</div>
                    <Textarea
                      className="mt-1"
                      placeholder="输入需要转换的文本..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-zinc-500">输入格式</div>
                        <Input
                          className="mt-1"
                          placeholder="如 md, html, txt"
                          value={inputFormat}
                          onChange={(e) => setInputFormat(e.target.value)}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">输出格式</div>
                        <Input
                          className="mt-1"
                          placeholder="如 html, md, txt"
                          value={outputFormat}
                          onChange={(e) => setOutputFormat(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 比较工具 */}
                {selectedTool === "compare" && (
                  <div>
                    <div className="text-xs font-medium text-zinc-700">文本 1</div>
                    <Textarea
                      className="mt-1"
                      placeholder="输入第一个文档..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                    <div className="mt-3 text-xs font-medium text-zinc-700">文本 2</div>
                    <Textarea
                      className="mt-1"
                      placeholder="输入第二个文档..."
                      value={compareText2}
                      onChange={(e) => setCompareText2(e.target.value)}
                    />
                  </div>
                )}

                {/* 合并工具 */}
                {selectedTool === "merge" && (
                  <div>
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
                          if (mergeTexts.length > 2) {
                            setMergeTexts(mergeTexts.slice(0, -1));
                          }
                        }}
                        disabled={mergeTexts.length <= 2}
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

                {/* 批量处理工具 */}
                {selectedTool === "batch" && (
                  <div>
                    {batchTexts.map((text, index) => (
                      <div key={index} className="mb-3">
                        <div className="text-xs font-medium text-zinc-700">文本 {index + 1}</div>
                        <Textarea
                          className="mt-1"
                          placeholder={`输入需要批量处理的文本 ${index + 1}...`}
                          value={text}
                          onChange={(e) => {
                            const newTexts = [...batchTexts];
                            newTexts[index] = e.target.value;
                            setBatchTexts(newTexts);
                          }}
                        />
                      </div>
                    ))}
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setBatchTexts([...batchTexts, ""])}
                      >
                        添加文本
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (batchTexts.length > 2) {
                            setBatchTexts(batchTexts.slice(0, -1));
                          }
                        }}
                        disabled={batchTexts.length <= 2}
                      >
                        删除文本
                      </Button>
                    </div>
                    <div className="mt-3">
                      <div className="text-xs font-medium text-zinc-700">操作</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {["summarize", "analyze", "translate"].map((op) => (
                          <label key={op} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={batchOperations.includes(op)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setBatchOperations([...batchOperations, op]);
                                } else {
                                  setBatchOperations(batchOperations.filter(o => o !== op));
                                }
                              }}
                            />
                            <span className="text-xs text-zinc-700">{op}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-zinc-500">摘要最大长度</div>
                        <Input
                          className="mt-1"
                          type="number"
                          min={1}
                          max={2000}
                          value={String(batchMaxLength)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const n = raw.trim() ? Number(raw) : 200;
                            setBatchMaxLength(clampNumber(n, { min: 1, max: 2000 }));
                          }}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">目标语言</div>
                        <Input
                          className="mt-1"
                          placeholder="如 en, zh"
                          value={batchTargetLanguage}
                          onChange={(e) => setBatchTargetLanguage(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="batch-report"
                        checked={batchReport}
                        onChange={(e) => setBatchReport(e.target.checked)}
                      />
                      <label htmlFor="batch-report" className="text-xs text-zinc-700">
                        生成报告
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
              <ResultCard title={resultTitle} text={resultText} extra={resultExtra} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
