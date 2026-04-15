import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import DocDetail from "@/pages/DocDetail";

describe("DocDetail rewrite review", () => {
  it("shows commit and rollback buttons on rewrite tab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: 1,
            title: "t",
            owner: "o",
            created_at: new Date().toISOString(),
            content: "hello world",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    render(
      <MemoryRouter initialEntries={["/docs/1"]}>
        <Routes>
          <Route path="/docs/:docId" element={<DocDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("t");
    fireEvent.click(screen.getByText("改写"));

    expect(screen.getByRole("button", { name: "运行" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回滚" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "回滚" })).toBeDisabled();
  });
});

