/**
 * Overlay accessibility.
 *
 * The previous ad-hoc SlideOver/CenteredModal helpers had no focus management
 * at all: focus stayed behind the scrim, Tab escaped the dialog, and Escape
 * did nothing. These tests lock in the replacement contract.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomSheet, Modal, SidePanel } from "@/components/ui/Sheet";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal dialog when open", () => {
    render(
      <Modal open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Filters</h2>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "t");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog on open", async () => {
    render(
      <Modal open onClose={vi.fn()}>
        <button type="button">First action</button>
      </Modal>,
    );
    const button = screen.getByRole("button", { name: "First action" });
    await vi.waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("honours an explicit autofocus target", async () => {
    render(
      <Modal open onClose={vi.fn()}>
        <button type="button">First</button>
        <input aria-label="Price" data-autofocus="" />
      </Modal>,
    );
    const input = screen.getByLabelText("Price");
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("locks background scroll while open and restores it on close", () => {
    const { unmount } = render(
      <Modal open onClose={vi.fn()}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("SidePanel", () => {
  it("is a labelled modal dialog and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <SidePanel open onClose={onClose} labelledBy="p">
        <h2 id="p">Station</h2>
      </SidePanel>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("BottomSheet", () => {
  function renderSheet(snap: "peek" | "half" | "full" = "peek") {
    const onSnapChange = vi.fn();
    render(
      <BottomSheet snap={snap} onSnapChange={onSnapChange} title="Nearby stations">
        <p>Station list</p>
      </BottomSheet>,
    );
    const grabber = screen.getByRole("button", { name: /Nearby stations/i });
    return { onSnapChange, grabber };
  }

  it("stays non-modal so the map above it remains usable", () => {
    renderSheet();
    // No dialog role: the sheet co-exists with the map rather than blocking it.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Station list")).toBeInTheDocument();
  });

  it("is operable from the keyboard", () => {
    const { onSnapChange, grabber } = renderSheet("peek");

    fireEvent.keyDown(grabber, { key: "ArrowUp" });
    expect(onSnapChange).toHaveBeenCalledWith("half");

    fireEvent.keyDown(grabber, { key: "Enter" });
    expect(onSnapChange).toHaveBeenCalledWith("full");
  });

  it("collapses to peek on Escape and never below peek on ArrowDown", () => {
    const { onSnapChange, grabber } = renderSheet("peek");

    fireEvent.keyDown(grabber, { key: "Escape" });
    expect(onSnapChange).toHaveBeenCalledWith("peek");

    onSnapChange.mockClear();
    fireEvent.keyDown(grabber, { key: "ArrowDown" });
    // Already at the lowest snap point — no spurious change.
    expect(onSnapChange).not.toHaveBeenCalled();
  });

  it("exposes its expanded state to assistive tech", () => {
    const { grabber } = renderSheet("full");
    expect(grabber).toHaveAttribute("aria-expanded", "true");
  });
});
