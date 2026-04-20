import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Wand2 } from "lucide-react";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Textarea from "@/components/common/Textarea";
import { apiSummarize, apiExportMe, apiListDocs, apiGetDoc } from "@/api";
import { isAbortError } from "@/api";
import type { DocDetailResponse, DocsListItem } from "@/api/types";

type AsyncStatus = "idle" | "loading" | "success" | "error";

export default function SummarizePage() {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<DocDetailResponse | null>(null);
  const [maxLength, setMaxLength] = useState(200);
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [resultText, setResultText] = useState<string | undefined>(undefined);
  const [documents, setDocuments] = useState<DocsListItem[]>([]);
  const [aborter, setAborter] = useState<AbortController | null>(null);

  // 加载文档列表
  useState(() => {
    async function loadDocuments() {
      try {
        const data = await apiListDocs();
        setDocuments(data.items);
      } catch (e) {
        console.error("Failed to load documents:", e);
      }
    }
    loadDocuments();
  });

  // 选择文档
  async function selectDocument(doc: DocsListItem) {
    try {
      const fullDoc = await apiGetDoc(doc.id);
      setSelectedDocument(fullDoc);
      setInputText(fullDoc.content || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取文档内容失败");
    }
  }

  // 运行摘要
  async function run() {
    if (!inputText.trim() && !selectedDocument) return;
    
    const ac = new AbortController();
    setAborter(ac);
    setStatus("loading");
    setError(undefined);

    try {
      const textToProcess = selectedDocument?.content || inputText;
      const data = await apiSummarize({ text: textToProcess, max_length: maxLength }, ac.signal);
      setResultText(data.summary);
      setStatus("success");
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) {
        setStatus("idle");
        return;
      }
      setError(e instanceof Error ? e.message : "请求失败");
      setStatus("error");
    } finally {
      setAborter(null);
    }
  }

  // 导出结果
  async function exportResult(format: "md" | "txt" | "pdf" | "docx") {
    if (!resultText) return;
    
    try {
      const res = await apiExportMe(format);
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `summary.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col p-6">
      <div className="mb-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="h-5 w-5" />
          返回工作台
        </button>
        <div className="flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-blue-500" />
          <h1 className="text-xl font-semibold text-zinc-900">智能摘要</h1>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* 左侧：输入区域 */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-4">
            <div className="text-sm font-medium text-zinc-700">选择文档</div>
            <div className="mt-2 space-y-2">
              {documents.slice(0, 5).map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => selectDocument(doc)}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    selectedDocument?.id === doc.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-900">{doc.title}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-zinc-700">文本</div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-zinc-500">最大长度</div>
                <Input
                  className="h-8 w-20"
                  type="number"
                  min={1}
                  max={2000}
                  value={String(maxLength)}
                  onChange={(e) => setMaxLength(Number(e.target.value))}
                />
              </div>
            </div>
            {selectedDocument ? (
              <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="text-sm font-medium text-zinc-900">{selectedDocument.title}</div>
                <div className="mt-1 text-xs text-zinc-600">{selectedDocument.content?.slice(0, 100)}...</div>
              </div>
            ) : (
              <Textarea
                className="mt-2"
                placeholder="输入需要摘要的文本..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={run} disabled={status === "loading"}>
              生成摘要
            </Button>
            {aborter && (
              <Button
                variant="ghost"
                onClick={() => {
                  aborter.abort();
                  setAborter(null);
                }}
              >
                取消
              </Button>
            )}
          </div>

          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        </div>

        {/* 右侧：结果区域 */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">摘要结果</h2>
            {resultText && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => exportResult("md")}>
                  导出MD
                </Button>
                <Button variant="secondary" size="sm" onClick={() => exportResult("txt")}>
                  导出TXT
                </Button>
              </div>
            )}
          </div>
          {resultText ? (
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap text-sm text-zinc-900">{resultText}</p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400">
              运行后将显示摘要结果
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
