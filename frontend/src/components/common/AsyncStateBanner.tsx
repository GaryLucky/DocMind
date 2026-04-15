import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export default function AsyncStateBanner(props: {
  status: AsyncStatus;
  message?: string;
}) {
  const { status, message } = props;

  if (status === "idle") return null;

  const base =
    "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-5";

  if (status === "loading") {
    return (
      <div className={`${base} border-zinc-200 bg-white text-zinc-700`}>
        <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
        <div>{message || "处理中…"}</div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className={`${base} border-emerald-200 bg-emerald-50 text-emerald-900`}>
        <CheckCircle2 className="mt-0.5 h-4 w-4" />
        <div>{message || "完成"}</div>
      </div>
    );
  }

  return (
    <div className={`${base} border-red-200 bg-red-50 text-red-900`}>
      <AlertCircle className="mt-0.5 h-4 w-4" />
      <div>{message || "发生错误"}</div>
    </div>
  );
}

