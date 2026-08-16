/**
 * Mobile overlay behaviour — the on-screen keyboard must never cover the
 * dialog's last row.
 *
 * Real bug this guards: a bottom-anchored dialog is laid out against the
 * LAYOUT viewport, which does not shrink when the soft keyboard opens. On a
 * phone that put the keyboard on top of the report form's "Submit price
 * report" button and the Fuel Intelligence composer — the two controls the
 * user needs while typing. The overlay now pads itself by the area
 * `visualViewport` reports as covered.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal, SidePanel } from "@/components/ui/Sheet";

interface FakeViewport {
  height: number;
  offsetTop: number;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
  emit: () => void;
}

function installVisualViewport(height: number): FakeViewport {
  const listeners = new Set<() => void>();
  const vv: FakeViewport = {
    height,
    offsetTop: 0,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
    emit: () => listeners.forEach((fn) => fn()),
  };
  Object.defineProperty(window, "visualViewport", {
    value: vv,
    configurable: true,
    writable: true,
  });
  return vv;
}

function removeVisualViewport() {
  Object.defineProperty(window, "visualViewport", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

/** The fixed overlay wrapper that owns the keyboard padding. */
function overlayOf(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement as HTMLElement;
}

afterEach(() => {
  removeVisualViewport();
  vi.restoreAllMocks();
});

describe("Modal keyboard avoidance", () => {
  it("lifts the dialog above the on-screen keyboard", () => {
    window.innerHeight = 800;
    const vv = installVisualViewport(800);

    render(
      <Modal open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Report fuel price</h2>
        <input aria-label="Price" />
        <button type="button">Submit price report</button>
      </Modal>,
    );

    const overlay = overlayOf(screen.getByRole("dialog"));
    expect(overlay.style.paddingBottom).toBe("");

    // Keyboard opens: the visual viewport shrinks by ~336px.
    act(() => {
      vv.height = 464;
      vv.emit();
    });
    expect(overlay.style.paddingBottom).toBe("336px");

    // Keyboard closes again.
    act(() => {
      vv.height = 800;
      vv.emit();
    });
    expect(overlay.style.paddingBottom).toBe("");
  });

  it("ignores small viewport changes (browser toolbars, not a keyboard)", () => {
    window.innerHeight = 800;
    const vv = installVisualViewport(800);

    render(
      <Modal open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Report</h2>
      </Modal>,
    );

    act(() => {
      vv.height = 740; // 60px — Safari's collapsing toolbar
      vv.emit();
    });
    expect(overlayOf(screen.getByRole("dialog")).style.paddingBottom).toBe("");
  });

  it("accounts for a viewport scrolled by the focused field", () => {
    window.innerHeight = 800;
    const vv = installVisualViewport(500);

    render(
      <Modal open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Report</h2>
      </Modal>,
    );

    act(() => {
      vv.offsetTop = 60;
      vv.emit();
    });
    // 800 - 500 - 60 = 240 visible px covered below the viewport.
    expect(overlayOf(screen.getByRole("dialog")).style.paddingBottom).toBe("240px");
  });

  it("changes nothing when visualViewport is unavailable (desktop/older browsers)", () => {
    removeVisualViewport();
    render(
      <Modal open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Report</h2>
      </Modal>,
    );
    expect(overlayOf(screen.getByRole("dialog")).style.paddingBottom).toBe("");
  });
});

describe("SidePanel keyboard avoidance", () => {
  it("lifts the panel above the keyboard too", () => {
    window.innerHeight = 900;
    const vv = installVisualViewport(900);

    render(
      <SidePanel open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Station details</h2>
      </SidePanel>,
    );

    act(() => {
      vv.height = 600;
      vv.emit();
    });
    expect(overlayOf(screen.getByRole("dialog")).style.paddingBottom).toBe("300px");
  });
});

describe("overlay heights track the dynamic viewport", () => {
  it("uses the dvh-aware utility rather than a raw vh height", () => {
    // `vh` resolves against the LARGEST mobile viewport, so a vh-sized sheet
    // hides its own footer under the browser chrome. The utility in
    // globals.css declares `92vh` then `92dvh` (progressive enhancement).
    render(
      <Modal open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Report</h2>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-sheet");
    expect(dialog.className).not.toMatch(/max-h-\[\d+vh\]/);
  });
});
