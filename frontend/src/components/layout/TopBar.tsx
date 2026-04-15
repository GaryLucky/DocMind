import type { ReactNode } from "react";

export default function TopBar(props: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const { title, left, right } = props;
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {left}
          <div className="hidden text-sm text-zinc-500 md:block">/</div>
          <div className="hidden truncate text-sm font-medium text-zinc-700 md:block">
            {title}
          </div>
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

