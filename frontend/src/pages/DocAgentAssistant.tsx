import { useEffect, useRef, useState } from "react";

import Button from "@/components/common/Button";

export default function DocAgentAssistant() {
  const src = "/doc-agent-site/index.html";
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setLoaded(false);
  }, [reloadKey]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold text-zinc-900">文档agent助手</div>
          <div className="truncate text-sm text-zinc-500">
            侧端文档页面已集成在系统内，可直接浏览与检索
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            新窗口打开
          </a>
          <Button size="sm" variant="secondary" onClick={() => setReloadKey((x) => x + 1)}>
            刷新
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {!loaded ? (
          <div className="flex h-[calc(100dvh-220px)] items-center justify-center px-6">
            <div className="text-sm text-zinc-500">正在加载文档页面…</div>
          </div>
        ) : null}
        <iframe
          key={reloadKey}
          src={src}
          title="文档agent助手"
          ref={iframeRef}
          className={loaded ? "h-[calc(100dvh-220px)] w-full" : "h-0 w-full"}
          onLoad={() => {
            const doc = iframeRef.current?.contentDocument;
            if (doc?.head && !doc.getElementById("doc-agent-theme")) {
              const link = doc.createElement("link");
              link.id = "doc-agent-theme";
              link.rel = "stylesheet";
              link.href = "/doc-agent-theme/theme.css";
              doc.head.appendChild(link);
            }
            setLoaded(true);
          }}
        />
      </div>
    </div>
  );
}
