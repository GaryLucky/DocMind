import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Workbench from "@/pages/Workbench";

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return {
    ...actual,
    apiListDocs: vi.fn(async () => ({ items: [] })),
  };
});

describe("Workbench", () => {
  it("renders tool tabs and run button", () => {
    render(<Workbench />);
    expect(screen.getByText("文档管理")).toBeInTheDocument();
    expect(screen.getByText("摘要")).toBeInTheDocument();
    expect(screen.getByText("翻译")).toBeInTheDocument();
    expect(screen.getByText("检索")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行" })).toBeInTheDocument();
  });
});
