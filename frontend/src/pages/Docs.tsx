import { Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AsyncStateBanner, {
  type AsyncStatus,
} from "@/components/common/AsyncStateBanner";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Textarea from "@/components/common/Textarea";
import { apiCreateDoc, apiDeleteDoc, apiExportMe, apiListDocs, apiSearch, apiUploadDoc, isAbortError } from "@/api";
import type { DocsListItem, RetrievedChunk } from "@/api/types";
import { clampNumber, formatDateTime } from "@/lib/format";
import { useAppStore } from "@/stores/useAppStore";

export default function Docs() {
  const navigate = useNavigate();
  const setSelectedDocId = useAppStore((s) => s.setSelectedDocId);

  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<DocsListItem[]>([]);

  const [filter, setFilter] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newChunkSize, setNewChunkSize] = useState("");
  const [newChunkOverlap, setNewChunkOverlap] = useState("");
  type ExportFormat = "md" | "txt" | "pdf" | "docx";
  const isExportFormat = (v: string): v is ExportFormat => v === "md" || v === "txt" || v === "pdf" || v === "docx";
  const [exportFormat, setExportFormat] = useState<ExportFormat>("md");

  // 检索功能状态
  const [searchStatus, setSearchStatus] = useState<AsyncStatus>("idle");
  const [searchError, setSearchError] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTopK, setSearchTopK] = useState(8);
  const [searchResults, setSearchResults] = useState<RetrievedChunk[]>([]);
  const [searchAborter, setSearchAborter] = useState<AbortController | null>(null);

  async function load(signal?: AbortSignal) {
    setStatus("loading");
    setError(undefined);
    try {
      const data = await apiListDocs(signal);
      setItems(data.items);
      setStatus("success");
    } catch (e) {
      if (signal?.aborted) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.title.toLowerCase().includes(q) || it.owner.toLowerCase().includes(q)
    );
  }, [filter, items]);

  async function create() {
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title) return;
    if (!newFile && !content) return;

    const chunkSize = newChunkSize.trim() ? Number(newChunkSize) : null;
    const chunkOverlap = newChunkOverlap.trim() ? Number(newChunkOverlap) : null;
    const hasInvalidChunkSize = chunkSize != null && (!Number.isFinite(chunkSize) || chunkSize < 100 || chunkSize > 5000);
    const hasInvalidChunkOverlap =
      chunkOverlap != null && (!Number.isFinite(chunkOverlap) || chunkOverlap < 0 || chunkOverlap > 2000);
    if (hasInvalidChunkSize || hasInvalidChunkOverlap) {
      setStatus("error");
      setError("分块参数不合法");
      return;
    }
    if (chunkSize != null && chunkOverlap != null && chunkOverlap >= chunkSize) {
      setStatus("error");
      setError("overlap 必须小于 chunk_size");
      return;
    }

    setStatus("loading");
    setError(undefined);
    try {
      const data = newFile
        ? await apiUploadDoc({ file: newFile, title, chunk_size: chunkSize, chunk_overlap: chunkOverlap })
        : await apiCreateDoc({ title, content, chunk_size: chunkSize, chunk_overlap: chunkOverlap });
      setOpenCreate(false);
      setNewTitle("");
      setNewContent("");
      setNewFile(null);
      setNewChunkSize("");
      setNewChunkOverlap("");
      await load();
      setSelectedDocId(data.doc_id);
      navigate(`/docs/${data.doc_id}`);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "创建失败");
    }
  }

  async function exportMe() {
    setStatus("loading");
    setError(undefined);
    try {
      const res = await apiExportMe(exportFormat);
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `me-export.${exportFormat}`;
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

  async function deleteDocument(doc: DocsListItem) {
    if (!confirm(`确定要删除文档 "${doc.title}" 吗？`)) return;
    
    try {
      setStatus("loading");
      await apiDeleteDoc(doc.id);
      // 重新加载文档列表
      await load();
      setStatus("success");
      setError(undefined);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  // 检索功能
  async function runSearch() {
    if (!searchQuery.trim()) return;
    const ac = new AbortController();
    setSearchAborter(ac);
    setSearchStatus("loading");
    setSearchError(undefined);
    setSearchResults([]);

    try {
      const data = await apiSearch(
        {
          query: searchQuery.trim(),
          top_k: clampNumber(searchTopK, { min: 1, max: 50 }),
          document_ids: null, // 全库检索
        },
        ac.signal
      );
      setSearchResults(data.results);
      setSearchStatus("success");
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) {
        setSearchStatus("idle");
        setSearchError(undefined);
        return;
      }
      const msg = e instanceof Error ? e.message : "检索失败";
      setSearchError(msg);
      setSearchStatus("error");
    } finally {
      setSearchAborter(null);
    }
  }

  function cancelSearch() {
    searchAborter?.abort();
    setSearchAborter(null);
    setSearchStatus("idle");
    setSearchError(undefined);
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchTopK(8);
    setSearchResults([]);
    setSearchStatus("idle");
    setSearchError(undefined);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-zinc-900">文档库</div>
          <div className="mt-0.5 text-sm text-zinc-500">浏览、创建与打开文档</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
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
          <Button variant="secondary" onClick={() => void exportMe()}>
            导出我的数据
          </Button>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4" />
            新建
          </Button>
        </div>
      </div>

      {/* 检索功能区域 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-zinc-600" />
            <div className="text-sm font-semibold text-zinc-900">全库检索</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]">
          <Input
            className="w-full"
            placeholder="输入关键词..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <div className="text-xs text-zinc-500">top_k</div>
            <Input
              className="h-9 w-[84px]"
              type="number"
              min={1}
              max={50}
              value={String(searchTopK)}
              onChange={(e) => {
                const raw = e.target.value;
                const n = raw.trim() ? Number(raw) : 8;
                setSearchTopK(clampNumber(n, { min: 1, max: 50 }));
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={runSearch}
              disabled={!searchQuery.trim() || searchStatus === "loading"}
            >
              搜索
            </Button>
            <Button variant="secondary" onClick={clearSearch}>
              清空
            </Button>
            {searchAborter ? (
              <Button variant="ghost" onClick={cancelSearch}>
                取消
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <AsyncStateBanner status={searchStatus} message={searchError} />
        </div>
        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium text-zinc-700">检索结果 ({searchResults.length})</div>
            <div className="space-y-2">
              {searchResults.map((r) => (
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
                  <div className="mt-2 flex items-center gap-2">
                    <Link
                      className="text-xs text-blue-600 hover:underline"
                      to={`/docs/${r.doc_id}`}
                      onClick={() => setSelectedDocId(r.doc_id)}
                    >
                      查看文档
                    </Link>
                    <button
                      className="text-xs text-zinc-600 hover:underline"
                      onClick={() => setSelectedDocId(r.doc_id)}
                      type="button"
                    >
                      用于工作台
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">列表</div>
          <Input
            className="h-9 w-[240px]"
            placeholder="筛选标题/owner"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="mt-4">
          <AsyncStateBanner status={status} message={error} />
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
          <div className="grid grid-cols-[1fr_140px_180px_120px] gap-0 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600">
            <div>标题</div>
            <div>Owner</div>
            <div>创建时间</div>
            <div className="text-right">操作</div>
          </div>
          <div className="divide-y divide-zinc-100">
            {filtered.length ? (
              filtered.map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-[1fr_140px_180px_120px] items-center gap-0 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-900">{it.title}</div>
                    <div className="text-xs text-zinc-500">docId: {it.id}</div>
                  </div>
                  <div className="truncate text-sm text-zinc-700">{it.owner}</div>
                  <div className="text-sm text-zinc-700">{formatDateTime(it.created_at)}</div>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      className="text-sm text-zinc-900 hover:underline"
                      to={`/docs/${it.id}`}
                      onClick={() => setSelectedDocId(it.id)}
                    >
                      打开
                    </Link>
                    <button
                      className="text-sm text-zinc-500 hover:text-red-600 hover:underline"
                      onClick={() => deleteDocument(it)}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-zinc-500">
                暂无文档
              </div>
            )}
          </div>
        </div>
      </div>

      {openCreate ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpenCreate(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-zinc-900">新建文档</div>
            <div className="mt-3">
              <div className="text-xs font-medium text-zinc-700">标题</div>
              <Input
                className="mt-1"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <div className="text-xs font-medium text-zinc-700">上传文件（可选）</div>
              <input
                className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:opacity-90"
                type="file"
                accept=".md,.markdown,.txt,.pdf,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setNewFile(f);
                  if (f && !newTitle.trim()) {
                    const name = f.name.replace(/\.(md|markdown|txt|pdf|docx)$/i, "");
                    setNewTitle(name);
                  }
                }}
              />
              {newFile ? (
                <div className="mt-1 text-xs text-zinc-500">
                  已选择：{newFile.name}（将优先使用文件内容创建）
                </div>
              ) : (
                <div className="mt-1 text-xs text-zinc-500">不上传则使用下方内容文本创建</div>
              )}
            </div>
            <div className="mt-3">
              <div className="text-xs font-medium text-zinc-700">分块参数（可选）</div>
              <div className="mt-1 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-zinc-500">chunk_size</div>
                  <Input
                    className="mt-1"
                    type="number"
                    min={100}
                    max={5000}
                    placeholder="默认使用系统配置"
                    value={newChunkSize}
                    onChange={(e) => setNewChunkSize(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-500">chunk_overlap</div>
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    max={2000}
                    placeholder="默认使用系统配置"
                    value={newChunkOverlap}
                    onChange={(e) => setNewChunkOverlap(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-1 text-xs text-zinc-500">overlap 必须小于 chunk_size</div>
            </div>
            <div className="mt-3">
              <div className="text-xs font-medium text-zinc-700">内容</div>
              <Textarea
                className="mt-1 min-h-40"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                disabled={!!newFile}
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpenCreate(false)}>
                取消
              </Button>
              <Button onClick={create} disabled={!newTitle.trim() || (!newFile && !newContent.trim())}>
                创建
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
