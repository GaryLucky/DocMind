import { useState, useRef, useCallback } from "react";
import { MessageSquare, Send, Brain, Search, FileText } from "lucide-react";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Textarea from "@/components/common/Textarea";
import { apiChat } from "@/api";
import { isAbortError } from "@/api";

type AsyncStatus = "idle" | "loading" | "success" | "error";
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export default function LawModel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSend = useCallback(async () => {
    if (!input.trim() || status === "loading") return;

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setStatus("loading");
    setError(undefined);

    abortControllerRef.current = new AbortController();

    try {
      const response = await apiChat(
        {
          messages: [
            {
              role: "system" as const,
              content: "你是一个专业的法律助手，精通各种法律法规，能够提供准确的法律建议和分析。请以专业、严谨的态度回答用户的法律问题。",
            },
            ...messages.map((msg) => ({
              role: msg.role === "user" ? ("user" as const) : ("assistant" as const),
              content: msg.content,
            })),
            { role: "user" as const, content: userMessage.content },
          ],
        },
        abortControllerRef.current.signal
      );

      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: response.reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStatus("success");
    } catch (e) {
      if (!isAbortError(e)) {
        setError(e instanceof Error ? e.message : "请求失败");
        setStatus("error");
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [input, messages, status]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setInput("");
    setStatus("idle");
    setError(undefined);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 聊天记录 */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <Scale className="h-12 w-12 mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">律法大模型</h3>
              <p className="text-sm text-center max-w-md">
                专业的法律助手，为您提供准确的法律建议和分析
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} mb-4`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${message.role === "user" 
                    ? "bg-zinc-900 text-white" 
                    : "bg-zinc-100 text-zinc-900"}`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div className="mt-2 text-xs opacity-70 text-right">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* 加载状态 */}
          {status === "loading" && (
            <div className="flex justify-start mb-4">
              <div className="max-w-[80%] rounded-lg bg-zinc-100 p-4">
                <div className="animate-pulse flex space-x-2">
                  <div className="h-2 w-20 bg-zinc-300 rounded-full"></div>
                  <div className="h-2 w-12 bg-zinc-300 rounded-full"></div>
                  <div className="h-2 w-16 bg-zinc-300 rounded-full"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className="border-t border-zinc-200 p-4">
          {error && (
            <div className="mb-3 text-sm text-red-500">{error}</div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入您的法律问题..."
              className="flex-1 resize-none min-h-[100px]"
            />
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSend}
                disabled={!input.trim() || status === "loading"}
                className="h-10 w-10 p-0"
              >
                <Send className="h-5 w-5" />
              </Button>
              <Button
                onClick={handleClear}
                variant="secondary"
                className="h-10 w-10 p-0"
              >
                <MessageSquare className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Scale(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05" />
      <path d="M12 22V12" />
    </svg>
  );
}
