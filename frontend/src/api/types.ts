export type DocIngestRequest = {
  title: string;
  content: string;
  owner?: string;
};

export type RegisterRequest = {
  username: string;
  password: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type TokenResponse = {
  access_token: string;
  token_type?: string;
};

export type UserMeResponse = {
  id: number;
  username: string;
};

export type DocIngestResponse = {
  doc_id: number;
  chunks: number;
};

export type DocsListItem = {
  id: number;
  title: string;
  owner: string;
  created_at: string;
};

export type DocsListResponse = {
  items: DocsListItem[];
};

export type DocDetailResponse = {
  id: number;
  title: string;
  owner: string;
  created_at: string;
  content: string;
};

export type RetrievedChunk = {
  doc_id: number;
  chunk_id: number;
  chunk_index: number;
  content: string;
  score: number;
};

export type SearchRequest = {
  query: string;
  top_k?: number;
  document_ids?: number[] | null;
};

export type SearchResponse = {
  results: RetrievedChunk[];
};

export type QARequest = {
  question: string;
  doc_id?: number | null;
};

export type QAResponse = {
  answer: string;
  citations: RetrievedChunk[];
};

export type SummarizeRequest = {
  text: string;
  max_length?: number;
};

export type SummarizeResponse = {
  summary: string;
};

export type RewriteRequest = {
  text: string;
  style?: string;
  enable_agent_chain?: boolean;
  chain_strictness?: number;
  chain_max_loops?: number;
  user_intent?: string | null;
  audience?: string | null;
  constraints?: string[] | null;
  glossary?: Record<string, string> | null;
};

export type RewriteChainMeta = {
  enabled: boolean;
  strictness: number;
  max_loops: number;
  loops: number;
  quality_passed: boolean;
  overall_score: number;
  steps: Record<string, unknown>[];
  requirements_doc: Record<string, unknown>;
  qa_reports: Record<string, unknown>[];
  final_notes: string;
};

export type RewriteResponse = {
  result: string;
  chain?: RewriteChainMeta | null;
};

export type RewriteReviewRequest = {
  doc_id: number;
  start: number;
  end: number;
  style?: string;
  enable_agent_chain?: boolean;
  chain_strictness?: number;
  chain_max_loops?: number;
  user_intent?: string | null;
  audience?: string | null;
  constraints?: string[] | null;
  glossary?: Record<string, string> | null;
};

export type RewriteReviewResponse = {
  review_id: number;
  doc_id: number;
  start: number;
  end: number;
  style: string;
  status: string;
  original: string;
  proposed: string;
  diff: string;
  created_at: string;
  chain?: RewriteChainMeta | null;
};

export type RewriteReviewApplyResponse = {
  review_id: number;
  doc_id: number;
  status: string;
  chunks: number;
  content: string;
};

export type RewriteReviewOpcode = {
  id: number;
  tag: "replace" | "delete" | "insert";
  i1: number;
  i2: number;
  j1: number;
  j2: number;
};

export type RewriteReviewCommitItem = {
  id: number;
  created_at: string;
  opcode_ids: number[];
  before_sha256: string;
  after_sha256: string;
};

export type RewriteReviewSessionCreateRequest = {
  doc_id: number;
  start: number;
  end: number;
  style?: string;
  enable_agent_chain?: boolean;
  chain_strictness?: number;
  chain_max_loops?: number;
  user_intent?: string | null;
  audience?: string | null;
  constraints?: string[] | null;
  glossary?: Record<string, string> | null;
};

export type RewriteReviewSessionResponse = {
  session_id: number;
  doc_id: number;
  style: string;
  status: string;
  base_sha256: string;
  target_sha256: string;
  base_text: string;
  target_text: string;
  opcodes: RewriteReviewOpcode[];
  commits: RewriteReviewCommitItem[];
  created_at: string;
  updated_at: string;
  chain?: RewriteChainMeta | null;
};

export type RewriteReviewSessionApplyRequest = {
  opcode_ids: number[];
};

export type RewriteReviewSessionApplyResponse = {
  session_id: number;
  doc_id: number;
  status: string;
  chunks: number;
  base_sha256: string;
  opcodes: RewriteReviewOpcode[];
  commits: RewriteReviewCommitItem[];
};

export type RewriteReviewSessionRollbackRequest = {
  commit_id: number;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
};

export type ChatResponse = {
  reply: string;
};

export type TranslateRequest = {
  text: string;
  target_language: string;
  source_language?: string | null;
};

export type TranslateResponse = {
  translation: string;
};

export type AnalyzeRequest = {
  text: string;
};

export type AnalyzeResponse = {
  readability: Record<string, unknown>;
  statistics: Record<string, unknown>;
  keywords: string[];
};

export type ConvertRequest = {
  text: string;
  input_format: string;
  output_format: string;
};

export type ConvertResponse = {
  result: string;
};

export type CompareRequest = {
  text1: string;
  text2: string;
};

export type CompareResponse = {
  similarity: number;
  statistics: Record<string, unknown>;
  differences: string[];
};

export type MergeRequest = {
  texts: string[];
  smart_merge?: boolean;
};

export type MergeResponse = {
  result: string;
};

export type BatchRequest = {
  texts: string[];
  operations: string[];
  max_length?: number;
  target_language?: string;
  report?: boolean;
};

export type BatchResponse = {
  results: Record<string, unknown>[];
};
