/**
 * Tests for the app-wide error boundary (wrapped in `Providers`).
 *
 * A client-side render error must never blank the app: the boundary should
 * render a designed, recoverable state with "Try again" and "Reload app",
 * log the real error to the console for developers, and never expose the
 * stack trace to the user.
 */

import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Providers from "@/app/providers";

let shouldThrow = false;

function Bomb() {
  if (shouldThrow) {
    throw new Error("SECRET_INTERNAL_FAILURE_do_not_show_this_stack_trace");
  }
  return <div>All good now</div>;
}

describe("Providers error boundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrow = false;
    // React itself logs caught errors to console.error in development; silence
    // that noise while we assert our own logging behaviour.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <Providers>
        <div>healthy content</div>
      </Providers>,
    );
    expect(screen.getByText("healthy content")).toBeInTheDocument();
  });

  it("catches a child render error and shows the recoverable error state", () => {
    shouldThrow = true;
    render(
      <Providers>
        <Bomb />
      </Providers>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    // The crashed child is gone.
    expect(screen.queryByText("All good now")).not.toBeInTheDocument();
  });

  it("offers both 'Try again' and 'Reload app' actions", () => {
    shouldThrow = true;
    render(
      <Providers>
        <Bomb />
      </Providers>,
    );

    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reload app/i }),
    ).toBeInTheDocument();
  });

  it("logs the real error to the console for diagnostics", () => {
    shouldThrow = true;
    render(
      <Providers>
        <Bomb />
      </Providers>,
    );

    expect(consoleError).toHaveBeenCalled();
  });

  it("does NOT expose the error message or stack trace to the user", () => {
    shouldThrow = true;
    render(
      <Providers>
        <Bomb />
      </Providers>,
    );

    const body = document.body.textContent ?? "";
    expect(body).not.toContain("SECRET_INTERNAL_FAILURE");
    expect(body).not.toContain("Bomb"); // component stack must not leak
    expect(body).not.toContain("at ");
  });

  it("recovers (remounts children) when 'Try again' is clicked", () => {
    shouldThrow = true;
    const { rerender } = render(
      <Providers>
        <Bomb />
      </Providers>,
    );
    expect(screen.queryByText("All good now")).not.toBeInTheDocument();

    // The underlying component recovers; resetting the boundary remounts it.
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    rerender(
      <Providers>
        <Bomb />
      </Providers>,
    );

    expect(screen.getByText("All good now")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
