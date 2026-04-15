import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Workbench from "@/pages/Workbench";

describe("Workbench", () => {
  it("renders tool tabs and run button", () => {
    render(<Workbench />);
    expect(screen.getByText("检索")).toBeInTheDocument();
    expect(screen.getByText("问答")).toBeInTheDocument();
    expect(screen.getByText("总结")).toBeInTheDocument();
    expect(screen.getByText("改写")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行" })).toBeInTheDocument();
  });
});

