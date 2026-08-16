/**
 * Conversational Groq journey through the Fuel Intelligence panel.
 *
 * A user must be able to type a NORMAL question ("Hello, what can you help me
 * with?") and get an answer:
 *
 *   input -> requestAiRecommendation (no coordinates invented)
 *         -> backend routes it to Groq chat
 *         -> the answer renders in the panel
 *
 * and the panel must never dress a deterministic fallback up as an AI answer.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FuelIntelligence } from "@/components/ai/FuelIntelligence";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";
import type { AIRecommendResponse } from "@/types/ai";

let geo: GeoMock;

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, requestAiRecommendation: vi.fn() };
});

const requestMock = vi.mocked(api.requestAiRecommendation);

function conversationResponse(
  overrides: Partial<AIRecommendResponse> = {},
): AIRecommendResponse {
  return {
    query: "Hello, what can you help me with?",
    mode: "conversation",
    intent: null,
    intent_source: "not_applicable",
    answer_source: "groq",
    needs_location: false,
    recommendations: [],
    answer:
      "I can help you find fuel stations near you and compare the latest prices drivers reported.",
    ...overrides,
  };
}

function resetStore() {
  useMapStore.setState({
    mode: "browse",
    filters: { q: "", brand: "", city: "", fuelType: "" },
    userLocation: null,
    locationStatus: "idle",
    locationMessage: null,
    radiusMeters: 5000,
    selectedStationId: null,
    favoritesOnly: false,
  });
}

function ask(query: string) {
  fireEvent.change(screen.getByLabelText("Ask Fuel AI"), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: /ask fuel ai/i }));
}

beforeEach(() => {
  resetStore();
  geo = installGeoMock();
  requestMock.mockReset();
});

afterEach(() => {
  removeGeoMock();
  vi.restoreAllMocks();
});

describe("conversational questions", () => {
  it("answers a normal question without asking for a location", async () => {
    requestMock.mockResolvedValue(conversationResponse());
    render(<FuelIntelligence onViewStation={vi.fn()} />);

    ask("Hello, what can you help me with?");

    expect(
      await screen.findByTestId("ai-conversation-answer"),
    ).toHaveTextContent(/i can help you find fuel stations/i);
    // No location prompt, and no coordinates were invented.
    expect(
      screen.queryByText(/I need your location to find stations near you/i),
    ).not.toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledWith({
      query: "Hello, what can you help me with?",
    });
  });

  it("answers a fuel question conversationally", async () => {
    requestMock.mockResolvedValue(
      conversationResponse({
        query: "Why should I verify a fuel station's reported price?",
        answer:
          "Prices are reported by other drivers, so verification tells you how much to trust them.",
      }),
    );
    render(<FuelIntelligence onViewStation={vi.fn()} />);

    ask("Why should I verify a fuel station's reported price?");

    expect(await screen.findByTestId("ai-conversation-answer")).toHaveTextContent(
      /verification tells you how much to trust them/i,
    );
    expect(screen.getByTestId("ai-answer-source")).toHaveTextContent(/AI answer/i);
  });

  it("labels a deterministic fallback instead of passing it off as AI", async () => {
    requestMock.mockResolvedValue(
      conversationResponse({ answer_source: "fallback", answer: "I can help you find fuel." }),
    );
    render(<FuelIntelligence onViewStation={vi.fn()} />);

    ask("Hello there");

    expect(await screen.findByTestId("ai-answer-source")).toHaveTextContent(
      /answered without AI/i,
    );
  });

  it("still refuses to run a station search without a location", async () => {
    render(<FuelIntelligence onViewStation={vi.fn()} />);

    ask("cheapest petrol near me");

    expect(
      await screen.findByText(/I need your location to find stations near you/i),
    ).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("surfaces a provider/API error instead of a fake answer", async () => {
    requestMock.mockRejectedValue(new api.ApiError(503, "The Fuel AI is unavailable."));
    render(<FuelIntelligence onViewStation={vi.fn()} />);

    ask("Hello, what can you help me with?");

    expect(await screen.findByText(/the fuel ai hit a snag/i)).toBeInTheDocument();
    expect(screen.queryByTestId("ai-conversation-answer")).not.toBeInTheDocument();
  });
});
