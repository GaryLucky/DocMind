import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate } from "react-router-dom";

import AsyncStateBanner from "@/components/common/AsyncStateBanner";
import { useAuthStore } from "@/stores/useAuthStore";

export default function ProtectedRoute(props: { children: ReactNode }) {
  const { children } = props;
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  useEffect(() => {
    if (token && !user) void fetchMe();
  }, [fetchMe, token, user]);

  if (!token) return <Navigate to="/login" replace />;
  if (!user) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <AsyncStateBanner status={status === "loading" ? "loading" : "idle"} message="加载用户信息…" />
      </div>
    );
  }
  return <>{children}</>;
}
