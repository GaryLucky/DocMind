import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type TabItem<T extends string> = {
  key: T;
  label: string;
  icon?: ReactNode;
};

export default function Tabs<T extends string>(props: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { items, value, onChange } = props;
  return (
    <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition",
            it.key === value
              ? "bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-50"
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

