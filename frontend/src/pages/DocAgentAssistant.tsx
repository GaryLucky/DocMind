import { useRef } from "react";

export default function DocAgentAssistant() {
  const src = "/doc-agent-site/index.html";
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <iframe
        src={src}
        title="文档agent助手"
        ref={iframeRef}
        className="h-[calc(100dvh-160px)] w-full"
        onLoad={() => {
          const doc = iframeRef.current?.contentDocument;
          if (doc?.head && !doc.getElementById("doc-agent-theme")) {
            const link = doc.createElement("link");
            link.id = "doc-agent-theme";
            link.rel = "stylesheet";
            link.href = "/doc-agent-theme/theme.css";
            doc.head.appendChild(link);
          }
        }}
      />
    </div>
  );
}
