import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AsyncStateBanner from "@/components/common/AsyncStateBanner";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { useAuthStore } from "@/stores/useAuthStore";

type Mode = "login" | "register";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");

  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const items: TabItem<Mode>[] = useMemo(
    () => [
      { key: "login", label: "登录" },
      { key: "register", label: "注册" },
    ],
    []
  );

  const canSubmit = username.trim().length >= 3 && password.length >= 6 && status !== "loading";

  async function onSubmit() {
    if (!canSubmit) return;
    const u = username.trim();
    const p = password;
    const ok = mode === "login" ? await login({ username: u, password: p }) : await register({ username: u, password: p });
    if (ok) navigate("/", { replace: true });
  }

  useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [navigate, token]);

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-10">
      <div className="mx-auto w-full max-w-[520px] space-y-6">
        <div className="text-center">
          <div className="text-lg font-semibold text-zinc-900">智能文档助手</div>
          <div className="mt-1 text-sm text-zinc-500">登录后只能查看和管理自己的文档</div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <Tabs items={items} value={mode} onChange={(v) => setMode(v)} />

          <div className="mt-5 space-y-3">
            <div>
              <div className="text-xs font-medium text-zinc-700">用户名</div>
              <Input
                className="mt-1"
                placeholder="至少 3 位"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-700">密码</div>
              <Input
                className="mt-1"
                type="password"
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button className="w-full" onClick={onSubmit} disabled={!canSubmit}>
              {mode === "login" ? "登录" : "注册并登录"}
            </Button>
          </div>

          <div className="mt-4">
            <AsyncStateBanner
              status={status === "loading" ? "loading" : status === "error" ? "error" : "idle"}
              message={error}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
