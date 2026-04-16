import { httpBlob, httpForm, httpJson, httpSse, type SseEvent } from "@/api/http";
import { API_BASE } from "@/api/base";
import type {
  ChatRequest,
  ChatResponse,
  DocDetailResponse,
  DocIngestRequest,
  DocIngestResponse,
  DocsListResponse,
  LoginRequest,
  QARequest,
  QAResponse,
  RegisterRequest,
  RewriteRequest,
  RewriteResponse,
  RewriteReviewApplyResponse,
  RewriteReviewRequest,
  RewriteReviewResponse,
  RewriteReviewSessionApplyRequest,
  RewriteReviewSessionApplyResponse,
  RewriteReviewSessionCreateRequest,
  RewriteReviewSessionResponse,
  RewriteReviewSessionRollbackRequest,
  SearchRequest,
  SearchResponse,
  SummarizeRequest,
  SummarizeResponse,
  TokenResponse,
  UserMeResponse,
} from "@/api/types";

export { HttpError, isAbortError } from "@/api/http";

export async function apiAuthRegister(body: RegisterRequest, signal?: AbortSignal) {
  return await httpJson<UserMeResponse>(`${API_BASE}/auth/register`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiAuthLogin(body: LoginRequest, signal?: AbortSignal) {
  return await httpJson<TokenResponse>(`${API_BASE}/auth/login`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiAuthMe(signal?: AbortSignal) {
  return await httpJson<UserMeResponse>(`${API_BASE}/auth/me`, {
    method: "GET",
    signal,
  });
}

export async function apiListDocs(signal?: AbortSignal) {
  return await httpJson<DocsListResponse>(`${API_BASE}/docs`, {
    method: "GET",
    signal,
  });
}

export async function apiGetDoc(docId: number, signal?: AbortSignal) {
  return await httpJson<DocDetailResponse>(`${API_BASE}/docs/${docId}`, {
    method: "GET",
    signal,
  });
}

export async function apiCreateDoc(body: DocIngestRequest, signal?: AbortSignal) {
  return await httpJson<DocIngestResponse>(`${API_BASE}/docs`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiUploadDoc(file: File, title?: string, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  if (title && title.trim().length > 0) form.append("title", title.trim());
  return await httpForm<DocIngestResponse>(`${API_BASE}/docs/upload`, { form, signal });
}

export async function apiSearch(body: SearchRequest, signal?: AbortSignal) {
  return await httpJson<SearchResponse>(`${API_BASE}/search`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiQa(body: QARequest, signal?: AbortSignal) {
  return await httpJson<QAResponse>(`${API_BASE}/qa`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiQaStream(body: QARequest, args: { onEvent: (evt: SseEvent) => void; signal?: AbortSignal }) {
  return await httpSse(`${API_BASE}/qa/stream`, {
    init: { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    signal: args.signal,
    onEvent: args.onEvent,
  });
}

export async function apiSummarize(body: SummarizeRequest, signal?: AbortSignal) {
  return await httpJson<SummarizeResponse>(`${API_BASE}/summarize`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiSummarizeStream(
  body: SummarizeRequest,
  args: { onEvent: (evt: SseEvent) => void; signal?: AbortSignal }
) {
  return await httpSse(`${API_BASE}/summarize/stream`, {
    init: { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    signal: args.signal,
    onEvent: args.onEvent,
  });
}

export async function apiRewrite(body: RewriteRequest, signal?: AbortSignal) {
  return await httpJson<RewriteResponse>(`${API_BASE}/rewrite`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiRewriteStream(
  body: RewriteRequest,
  args: { onEvent: (evt: SseEvent) => void; signal?: AbortSignal }
) {
  return await httpSse(`${API_BASE}/rewrite/stream`, {
    init: { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    signal: args.signal,
    onEvent: args.onEvent,
  });
}

export async function apiRewriteReview(body: RewriteReviewRequest, signal?: AbortSignal) {
  return await httpJson<RewriteReviewResponse>(`${API_BASE}/rewrite/review`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiApplyRewriteReview(reviewId: number, signal?: AbortSignal) {
  return await httpJson<RewriteReviewApplyResponse>(
    `${API_BASE}/rewrite/review/${reviewId}/apply`,
    {
      method: "POST",
      signal,
    }
  );
}

export async function apiRollbackRewriteReview(reviewId: number, signal?: AbortSignal) {
  return await httpJson<RewriteReviewApplyResponse>(
    `${API_BASE}/rewrite/review/${reviewId}/rollback`,
    {
      method: "POST",
      signal,
    }
  );
}

export async function apiCreateRewriteReviewSession(
  body: RewriteReviewSessionCreateRequest,
  signal?: AbortSignal
) {
  return await httpJson<RewriteReviewSessionResponse>(`${API_BASE}/rewrite/review_sessions`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiGetRewriteReviewSession(sessionId: number, signal?: AbortSignal) {
  return await httpJson<RewriteReviewSessionResponse>(`${API_BASE}/rewrite/review_sessions/${sessionId}`, {
    method: "GET",
    signal,
  });
}

export async function apiApplyRewriteReviewSession(
  sessionId: number,
  body: RewriteReviewSessionApplyRequest,
  signal?: AbortSignal
) {
  return await httpJson<RewriteReviewSessionApplyResponse>(
    `${API_BASE}/rewrite/review_sessions/${sessionId}/apply`,
    {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }
  );
}

export async function apiRollbackRewriteReviewSession(
  sessionId: number,
  body: RewriteReviewSessionRollbackRequest,
  signal?: AbortSignal
) {
  return await httpJson<RewriteReviewSessionApplyResponse>(
    `${API_BASE}/rewrite/review_sessions/${sessionId}/rollback`,
    {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }
  );
}

export async function apiChat(body: ChatRequest, signal?: AbortSignal) {
  return await httpJson<ChatResponse>(`${API_BASE}/chat`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiChatStream(
  body: ChatRequest,
  args: { onEvent: (evt: SseEvent) => void; signal?: AbortSignal }
) {
  return await httpSse(`${API_BASE}/chat/stream`, {
    init: { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    signal: args.signal,
    onEvent: args.onEvent,
  });
}

export async function apiExportDoc(docId: number, format: "md" | "txt" | "pdf" | "docx", signal?: AbortSignal) {
  const url = `${API_BASE}/docs/${docId}/export?format=${encodeURIComponent(format)}`;
  return await httpBlob(url, { method: "GET", signal });
}

export async function apiExportMe(format: "md" | "txt" | "pdf" | "docx", signal?: AbortSignal) {
  const url = `${API_BASE}/export/me?format=${encodeURIComponent(format)}`;
  return await httpBlob(url, { method: "GET", signal });
}

export async function apiExportResult(content: string, format: "md" | "txt" | "pdf" | "docx", title: string = "result", signal?: AbortSignal) {
  const url = `${API_BASE}/export/result?format=${encodeURIComponent(format)}&title=${encodeURIComponent(title)}`;
  return await httpBlob(url, { method: "POST", body: content, signal });
}

export async function apiTranslate(body: TranslateRequest, signal?: AbortSignal) {
  return await httpJson<TranslateResponse>(`${API_BASE}/translate`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiAnalyze(body: AnalyzeRequest, signal?: AbortSignal) {
  return await httpJson<AnalyzeResponse>(`${API_BASE}/analyze`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiConvert(body: ConvertRequest, signal?: AbortSignal) {
  return await httpJson<ConvertResponse>(`${API_BASE}/convert`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiCompare(body: CompareRequest, signal?: AbortSignal) {
  return await httpJson<CompareResponse>(`${API_BASE}/compare`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiMerge(body: MergeRequest, signal?: AbortSignal) {
  return await httpJson<MergeResponse>(`${API_BASE}/merge`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiBatch(body: BatchRequest, signal?: AbortSignal) {
  return await httpJson<BatchResponse>(`${API_BASE}/batch`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiDeleteDoc(docId: number, signal?: AbortSignal) {
  return await httpJson<{ success: boolean }>(`${API_BASE}/docs/${docId}`, {
    method: "DELETE",
    signal,
  });
}
