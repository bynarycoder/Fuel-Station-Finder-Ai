/**
 * About page + footer content contract.
 *
 * These are not styling tests. They pin the facts the page exists to
 * communicate — the mission statement, the six-step mechanism, the honest
 * data limitations, and the creator's real contact details — so a future
 * restyle cannot silently drop a required section or corrupt a phone number.
 *
 * The trust-related assertions matter most: "imported data", "community
 * reports", "verification" and the stated limitations are the product's
 * credibility, and the AI honesty rules are a hard product constraint.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AboutPage from "@/app/about/page";
import { CREATOR } from "@/lib/siteInfo";

function renderAbout() {
  return render(<AboutPage />);
}

describe("About page", () => {
  it("leads with the product promise", () => {
    renderAbout();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/Find fuel smarter/i);
    expect(h1).toHaveTextContent(/Drive with confidence/i);
  });

  it.each([
    ["problem", /fuel hunting is expensive/i],
    ["mission", /make every trip to the pump a decided one/i],
    ["how-it-works", /from your location to a decision/i],
    ["fuel-intelligence", /reasons over facts/i],
    ["data-trust", /where the numbers come from/i],
    ["built-for-nigeria", /designed for the conditions/i],
    ["technology", /a production stack/i],
    ["creator", /who built this/i],
    ["portfolio", /other work/i],
  ])("renders the %s section", (id, heading) => {
    const { container } = renderAbout();
    const section = container.querySelector(`#${id}`);
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByRole("heading", { name: heading }),
    ).toBeInTheDocument();
  });

  it("explains the mechanism in the required order", () => {
    const { container } = renderAbout();
    const section = container.querySelector("#how-it-works") as HTMLElement;
    const steps = within(section)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent?.trim());

    expect(steps).toEqual([
      "Location",
      "Discovery",
      "Comparison",
      "Trust",
      "Intelligence",
      "Reporting",
    ]);
  });

  it("states where data comes from AND where it stops", () => {
    const { container } = renderAbout();
    const section = container.querySelector("#data-trust") as HTMLElement;

    expect(within(section).getByText(/imported station data/i)).toBeInTheDocument();
    expect(within(section).getByText(/community reports/i)).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: /^verification$/i })).toBeInTheDocument();

    // The limitations are the point of the section — never let them vanish.
    expect(within(section).getByText(/known limitations/i)).toBeInTheDocument();
    expect(within(section).getByText(/always confirm at the pump/i)).toBeInTheDocument();
  });

  it("publishes the AI honesty rules", () => {
    const { container } = renderAbout();
    const section = container.querySelector("#fuel-intelligence") as HTMLElement;

    expect(within(section).getByText(/what it will never do/i)).toBeInTheDocument();
    expect(within(section).getByText(/invent a price/i)).toBeInTheDocument();
    expect(within(section).getByText(/claim availability/i)).toBeInTheDocument();
    expect(within(section).getByText(/fabricate verification/i)).toBeInTheDocument();
  });

  it("credits the creator with working contact links", () => {
    const { container } = renderAbout();
    const section = container.querySelector("#creator") as HTMLElement;

    expect(
      within(section).getByRole("heading", { name: CREATOR.name }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("link", { name: new RegExp(CREATOR.email, "i") }),
    ).toHaveAttribute("href", `mailto:${CREATOR.email}`);
    expect(
      within(section).getByRole("link", { name: new RegExp(CREATOR.phone) }),
    ).toHaveAttribute("href", "tel:+2349044115526");

    const linkedin = within(section).getByRole("link", {
      name: /linkedin\.com\/in\/abdulwahab-abdulyekeen/i,
    });
    expect(linkedin).toHaveAttribute("href", CREATOR.linkedinUrl);
    // External links must not hand the opener window over.
    expect(linkedin).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("presents JobLiberty as a reference only, without overbranding it", () => {
    const { container } = renderAbout();
    const section = container.querySelector("#portfolio") as HTMLElement;

    expect(within(section).getByRole("heading", { name: "JobLiberty" })).toBeInTheDocument();
    expect(within(section).getByText(/UI\/UX craft only/i)).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: "MammoGuard" })).toBeInTheDocument();
    expect(within(section).getAllByText(/breast cancer/i).length).toBeGreaterThan(0);

    // JobLiberty must appear ONLY inside the portfolio section — it is not a
    // partner brand and must never leak into the product's own chrome.
    const mentions = Array.from(container.querySelectorAll("*")).filter(
      (el) =>
        el.children.length === 0 && /jobliberty/i.test(el.textContent ?? ""),
    );
    for (const el of mentions) {
      expect(section.contains(el)).toBe(true);
    }
  });

  it("ends on the shared footer with mission, nav and creator details", () => {
    renderAbout();
    const footer = screen.getByRole("contentinfo");

    expect(within(footer).getByText(/should not cost you a tank/i)).toBeInTheDocument();
    expect(within(footer).getByRole("navigation", { name: "Product" })).toBeInTheDocument();
    expect(within(footer).getByRole("navigation", { name: "Project" })).toBeInTheDocument();
    expect(within(footer).getByText(CREATOR.name)).toBeInTheDocument();
    // The pump-confirmation disclaimer must survive any restyle.
    expect(
      within(footer).getByText(/always confirm at the pump/i),
    ).toBeInTheDocument();
    // Tech stack is summarised in the footer too.
    expect(within(footer).getByText("Next.js 15")).toBeInTheDocument();
    expect(within(footer).getByText("PostgreSQL + PostGIS")).toBeInTheDocument();
  });

  it("gives every footer and in-page anchor a real destination", () => {
    const { container } = renderAbout();
    const anchors = Array.from(container.querySelectorAll("a[href]"));
    expect(anchors.length).toBeGreaterThan(0);

    for (const a of anchors) {
      const href = a.getAttribute("href") ?? "";
      expect(href).not.toBe("");
      expect(href).not.toBe("#");

      // Hash links must point at a section that actually exists on this page.
      if (href.startsWith("/about#")) {
        const id = href.split("#")[1];
        expect(container.querySelector(`#${id}`)).not.toBeNull();
      }
      if (href.startsWith("#")) {
        expect(container.querySelector(href)).not.toBeNull();
      }
    }
  });
});
