import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";

import Button from "@/components/common/Button";
import SidebarNav from "@/components/layout/SidebarNav";
import TopBar from "@/components/layout/TopBar";
import { useAuthStore } from "@/stores/useAuthStore";

export default function AppShell(props: { children: ReactNode }) {
  const { children } = props;
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);

  const title = useMemo(() => {
    if (loc.pathname.startsWith("/docs")) return "文档库";
    return "工作台";
  }, [loc.pathname]);

  return (
    <div className="min-h-dvh bg-zinc-50">
      <TopBar
        title={title}
        left={
          <div className="flex items-center gap-2">
            <Button
              className="md:hidden"
              variant="ghost"
              size="sm"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
              菜单
            </Button>
            <Link
              to="/"
              className="text-sm font-semibold text-zinc-900 hover:opacity-80"
            >
              智能文档助手
            </Link>
          </div>
        }
        right={
          token ? (
            <div className="flex items-center gap-2">
              {user ? (
                <div className="hidden text-sm text-zinc-600 md:block">{user.username}</div>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
              >
                退出
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => navigate("/login")}>
              登录
            </Button>
          )
        }
      />

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-0 px-4 pb-8 pt-4 md:grid-cols-[260px_1fr] md:px-6">
        <aside className="hidden md:block">
          <div className="sticky top-[72px]">
            <SidebarNav />
          </div>
        </aside>
        <main>{children}</main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[280px] bg-white p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-zinc-900">菜单</div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
