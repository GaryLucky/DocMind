import { Copy, Maximize2, Minimize2 } from "lucide-react";
import { useMemo, useState } from "react";

import Button from "@/components/common/Button";

export default function ResultCard(props: {
  title: string;
  subtitle?: string;
  text?: string;
  extra?: React.ReactNode;
}) {
  const { title, subtitle, text, extra } = props;
  const [expanded, setExpanded] = useState(false);

  const canCopy = useMemo(() => !!text && text.trim().length > 0, [text]);

  async function onCopy() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          {subtitle ? (
            <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canCopy ? (
            <Button variant="secondary" size="sm" onClick={onCopy}>
              <Copy className="h-4 w-4" />
              复制
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
            {expanded ? "收起" : "展开"}
          </Button>
        </div>
      </div>
      <div className="px-4 py-3">
        {extra ? <div className="mb-3">{extra}</div> : null}
        {text ? (
          <pre
            className={
              expanded
                ? "whitespace-pre-wrap break-words text-sm leading-6 text-zinc-900"
                : "line-clamp-6 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-900"
            }
          >
            {text}
          </pre>
        ) : (
          <div className="text-sm text-zinc-500">暂无内容</div>
        )}
      </div>
    </div>
  );
}

