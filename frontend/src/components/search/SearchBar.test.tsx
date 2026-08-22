/**
 * Unified search.
 *
 * The product has ONE search field. A plain term filters the catalogue; a
 * natural-language question is routed to Fuel Intelligence. The routing must
 * be predictable and must never silently send a station name to the AI (or a
 * question to the catalogue, where it would return nothing).
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchBar, looksLikeQuestion } from "@/components/search/SearchBar";

function renderBar(value = "") {
  const onSearch = vi.fn();
  const onAsk = vi.fn();
  render(<SearchBar value={value} onSearch={onSearch} onAsk={onAsk} />);
  const input = screen.getByLabelText("Search stations or ask Fuel Intelligence");
  return { onSearch, onAsk, input };
}

describe("looksLikeQuestion", () => {
  it("treats station names and brands as searches", () => {
    expect(looksLikeQuestion("A.A. Rano")).toBe(false);
    expect(looksLikeQuestion("NNPC")).toBe(false);
    expect(looksLikeQuestion("Mobil Lekki")).toBe(false);
  });

  it("treats natural-language requests as questions", () => {
    expect(looksLikeQuestion("cheapest petrol near me")).toBe(true);
    expect(looksLikeQuestion("closest CNG station")).toBe(true);
    expect(looksLikeQuestion("where can I get diesel")).toBe(true);
    expect(looksLikeQuestion("is there fuel?")).toBe(true);
  });

  it("does not treat very short input as a question", () => {
    expect(looksLikeQuestion("ab")).toBe(false);
    expect(looksLikeQuestion("")).toBe(false);
  });
});

describe("SearchBar routing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends a plain term to catalogue search, never to the AI", () => {
    const { onSearch, onAsk, input } = renderBar();

    fireEvent.change(input, { target: { value: "A.A. Rano" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSearch).toHaveBeenCalledWith("A.A. Rano");
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("sends a question to Fuel Intelligence, never to catalogue search", () => {
    const { onSearch, onAsk, input } = renderBar();

    fireEvent.change(input, { target: { value: "cheapest petrol near me" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAsk).toHaveBeenCalledWith("cheapest petrol near me");
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("debounces catalogue search rather than firing per keystroke", () => {
    const { onSearch, input } = renderBar();

    fireEvent.change(input, { target: { value: "Mob" } });
    fireEvent.change(input, { target: { value: "Mobil" } });
    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("Mobil");
  });

  it("never debounce-searches a question", () => {
    const { onSearch, onAsk, input } = renderBar();

    fireEvent.change(input, { target: { value: "cheapest petrol near me" } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSearch).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled(); // only on explicit submit
  });

  it("clearing the field resets the catalogue filter", () => {
    const { onSearch } = renderBar("Mobil");

    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("announces which mode the field will use", () => {
    const { input } = renderBar();

    fireEvent.change(input, { target: { value: "cheapest petrol near me" } });
    expect(
      screen.getByText(/Press enter to ask Fuel Intelligence/i),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Mobil" } });
    expect(
      screen.getByText(/Press enter to search station names/i),
    ).toBeInTheDocument();
  });

  it("does nothing on submit when the field is empty", () => {
    const { onSearch, onAsk, input } = renderBar();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSearch).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
  });
});
