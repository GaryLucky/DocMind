import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Tools() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // 打开新标签页
    window.open("https://tools.pdf24.org/zh/all-tools", "_blank");
    // 返回到工作台
    navigate("/");
  }, [navigate]);
  
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center">
      <div className="mb-2 text-base font-semibold text-zinc-900">正在打开 PDF24 工具台...</div>
      <div className="text-sm text-zinc-500">如果没有自动打开，请点击下方链接</div>
      <a 
        href="https://tools.pdf24.org/zh/all-tools" 
        className="mt-4 text-blue-600 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        前往 PDF24 工具台
      </a>
    </div>
  );
}
