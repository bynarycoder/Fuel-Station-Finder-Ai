import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import i18n from "@/i18n/config";

void i18n.changeLanguage("en");

// vitest runs without `globals`, so register RTL's automatic cleanup manually.
afterEach(() => {
  cleanup();
});
