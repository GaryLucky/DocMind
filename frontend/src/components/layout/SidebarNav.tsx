import { BookOpen, LayoutDashboard } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

export default function SidebarNav(props: { onNavigate?: () => void }) {
  const { onNavigate } = props;

  const itemBase =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition";

  return (
    <nav className="rounded-xl border border-zinc-200 bg-white p-2">
      <NavLink
        to="/"
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            itemBase,
            isActive
              ? "bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-50"
          )
        }
        end
      >
        <LayoutDashboard className="h-4 w-4" />
        工作台
      </NavLink>
      <NavLink
        to="/docs"
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            itemBase,
            isActive
              ? "bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-50"
          )
        }
      >
        <BookOpen className="h-4 w-4" />
        文档库
      </NavLink>
    </nav>
  );
}

