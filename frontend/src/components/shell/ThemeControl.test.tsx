import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeControl } from "@/components/shell/ThemeControl";

describe("ThemeControl", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("persists dark mode and applies the document theme class", () => {
    render(<ThemeControl />);

    fireEvent.click(screen.getByRole("button", { name: /dark/i }));

    expect(localStorage.getItem("fuel-finder-theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("can return to light mode without leaving a dark map surface", () => {
    render(<ThemeControl />);

    fireEvent.click(screen.getByRole("button", { name: /dark/i }));
    fireEvent.click(screen.getByRole("button", { name: /light/i }));

    expect(localStorage.getItem("fuel-finder-theme")).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
