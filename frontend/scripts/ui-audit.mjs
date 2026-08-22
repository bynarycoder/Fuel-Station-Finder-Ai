/**
 * FuelFinder AI — browser UI audit.
 *
 * jsdom has no layout engine, so the component tests can only assert
 * structure. This harness drives a REAL headless Chromium against a running
 * dev/prod server and measures what the tests cannot:
 *
 *   · horizontal overflow at every supported width (320 → 1920)
 *   · the map-first hierarchy (how much map is actually visible)
 *   · overlap between the map controls, the bottom sheet and the nav
 *   · bottom-sheet snap heights and scrollability
 *   · computed typography against the type scale
 *   · WCAG contrast of every rendered text node, in BOTH themes
 *   · console errors/warnings
 *
 * Usage:
 *
 *   # 1. start the app
 *   npm run dev
 *
 *   # 2. point the harness at a Chromium build and run it
 *   CHROME_PATH=/path/to/chrome \
 *   NODE_PATH=/path/to/node_modules \
 *   node scripts/ui-audit.mjs [--url http://localhost:3000] [--json out.json]
 *
 * `puppeteer-core` is resolved dynamically and is NOT a dependency of this
 * package: the harness is a local QA tool, not part of the app or its build.
 * Without it (or without CHROME_PATH) the script exits 0 with a clear notice,
 * so it can sit in CI behind an opt-in without ever breaking a pipeline.
 *
 * Exit code is 1 when a check fails, so it can gate a release when wanted.
 */

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE_URL = argOf("--url", process.env.AUDIT_URL ?? "http://localhost:3000");
const JSON_OUT = argOf("--json", null);

/* --------------------------------------------------------------- browser -- */

async function resolveBrowser() {
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch {
    return null;
  }
  let executablePath = process.env.CHROME_PATH;
  let extraArgs = [];
  if (!executablePath) {
    try {
      const chromium = (await import("@sparticuz/chromium")).default;
      executablePath = await chromium.executablePath();
      // `--single-process` (a Lambda default) cannot create the isolated
      // browser contexts this audit uses — the target dies on the first one.
      extraArgs = chromium.args.filter(
        (a) => a !== "--single-process" && a !== "--no-zygote",
      );
    } catch {
      return null;
    }
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: [...extraArgs, "--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
}

/* -------------------------------------------------------------- fixtures -- */

/**
 * Deterministic API stubs. The audit must be able to run without the backend,
 * and — more importantly — must exercise the hostile cases the real data will
 * eventually contain: a very long station name, a long address, a four-digit
 * price and a station with no reports at all.
 */
const LONG_NAME =
  "Alhaji Muhammadu Buhari Memorial Mega Filling & Service Station Annex";
const LONG_ADDRESS =
  "Plot 1145B Ahmadu Bello Way, Opposite the Central Mosque Roundabout, Zaria Road";

function station(id, name, extra = {}) {
  return {
    id,
    name,
    brand: "Total Energies",
    address: LONG_ADDRESS,
    city: "Kaduna",
    state: "Kaduna",
    phone: "+2348000000000",
    latitude: 10.5207,
    longitude: 7.4386,
    is_active: true,
    data_source: "official",
    verification_status: "verified",
    verified_at: "2026-08-01T00:00:00Z",
    last_verified_at: "2026-08-01T00:00:00Z",
    source_id: null,
    fuel_types: [
      { code: "PMS", name: "Petrol (PMS)" },
      { code: "AGO", name: "Diesel (AGO)" },
      { code: "CNG", name: "Compressed Natural Gas (CNG)" },
    ],
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...extra,
  };
}

const STATIONS = [
  station("st-1", LONG_NAME, { distance_meters: 612 }),
  station("st-2", "Zaria Road", { distance_meters: 1840 }),
  station("st-3", "Ahmadu Bello Way", { distance_meters: 4210 }),
];

const REPORTS = {
  items: [
    {
      id: "rp-1",
      station_id: "st-1",
      user_id: "u-1",
      fuel_type: { code: "PMS", name: "Petrol (PMS)" },
      price_per_litre: 1020.5,
      queue_length: "short",
      is_available: true,
      notes: null,
      photo_url: null,
      status: "verified",
      ai_confidence_score: 0.91,
      created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
};

/** 1x1 transparent PNG. */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A far-future, unsigned JWT. It is never verified locally: supabase-js only
 * reads `exp` to decide whether to refresh, and the backend is stubbed. It
 * exists so the audit can reach the authenticated screens (Report Price, the
 * signed-in Account header) without a network round trip.
 */
function fakeJwt() {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: "qa-user", exp, email: "ahmed@example.com" })}.qa`;
}

const AUTH_USER = {
  id: "qa-user",
  email: "ahmed@example.com",
  full_name: null,
  role: "driver",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function routeFor(url) {
  const path = url.split("/api/v1")[1] ?? "";
  if (DATA_MODE === "error" && path.startsWith("/stations")) {
    return { status: 500, body: { detail: "Internal Server Error" } };
  }
  if (path.startsWith("/stations/nearby")) {
    const items = DATA_MODE === "empty" ? [] : STATIONS;
    return { items, latitude: 10.52, longitude: 7.43, radius_meters: 5000 };
  }
  if (path.startsWith("/stations")) {
    const items = DATA_MODE === "empty" ? [] : STATIONS;
    return { items, total: items.length, page: 1, page_size: 100 };
  }
  if (path.startsWith("/reports")) return REPORTS;
  if (path.startsWith("/favorites")) return { items: [], total: 0 };
  if (path.startsWith("/auth/me")) {
    return AUTHED ? AUTH_USER : { status: 401, body: { detail: "Unauthorized" } };
  }
  return {};
}

/** Flipped by the authenticated pass. */
let AUTHED = false;
/** Flipped by the states pass: "empty" | "error" | null. */
let DATA_MODE = null;

async function stubApi(page) {
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/v1")) {
      const result = routeFor(url);
      const status = result?.status ?? 200;
      const body = result?.body ?? result;
      return req.respond({
        status,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(body),
      });
    }
    // Map tiles: never hit the real network from an audit run. A real 1x1
    // PNG — an empty body makes Chromium report net::ERR_FAILED.
    if (/tile\.openstreetmap|basemaps|tiles\./.test(url)) {
      return req.respond({ status: 200, contentType: "image/png", body: PNG_1x1 });
    }
    return req.continue();
  });
}

/* ---------------------------------------------------- in-page measurement -- */

/** Serialised into the page: contrast + layout helpers. */
const PAGE_HELPERS = `
window.__audit = (() => {
  function parseColor(value) {
    const m = /rgba?\\(([^)]+)\\)/.exec(value || "");
    if (!m) return null;
    const parts = m[1].split(",").map((p) => parseFloat(p));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  function lum({ r, g, b }) {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrast(fg, bg) {
    const a = lum(fg) + 0.05;
    const b = lum(bg) + 0.05;
    return a > b ? a / b : b / a;
  }
  function blend(fg, bg) {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }
  /** Effective background: first opaque-ish ancestor background. */
  function bgOf(el) {
    let node = el;
    let acc = null;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { color: null, gradient: true };
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? blend(acc, c) : c;
        if (acc.a >= 0.99) return { color: acc, gradient: false };
      }
      node = node.parentElement;
    }
    const rootBg = parseColor(getComputedStyle(document.documentElement).backgroundColor) ||
      parseColor(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    return { color: acc ? blend(acc, rootBg) : rootBg, gradient: false };
  }
  function visible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // sr-only pattern
    if (r.width <= 2 && r.height <= 2) return false;
    return true;
  }
  function path(el) {
    const bits = [];
    let node = el;
    for (let i = 0; node && i < 4; i++) {
      let s = node.tagName.toLowerCase();
      if (node.id) s += "#" + node.id;
      else if (typeof node.className === "string" && node.className.trim()) {
        s += "." + node.className.trim().split(/\\s+/).slice(0, 3).join(".");
      }
      bits.unshift(s);
      node = node.parentElement;
    }
    return bits.join(" > ");
  }
  return {
    /** Every element whose painted box extends past the viewport width. */
    overflowOffenders() {
      const out = [];
      const vw = document.documentElement.clientWidth;
      document.querySelectorAll("*").forEach((el) => {
        if (!visible(el)) return;
        const cs = getComputedStyle(el);
        if (cs.position === "fixed" && el.getBoundingClientRect().width === 0) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        // Ignore elements inside a CLIPPING ancestor: a horizontal scroll
        // rail (allowed to be wider than the screen) or an overflow-hidden
        // box such as the Leaflet tile pane, whose tiles are always drawn
        // past the edges of the map. Only unclipped overflow can scroll or
        // truncate the page.
        let p = el.parentElement, clipped = false;
        while (p) {
          const pcs = getComputedStyle(p);
          if (["auto", "scroll", "hidden", "clip"].includes(pcs.overflowX)) { clipped = true; break; }
          p = p.parentElement;
        }
        if (clipped) return;
        if (r.right > vw + 1 || r.left < -1) {
          out.push({ path: path(el), left: Math.round(r.left), right: Math.round(r.right), vw });
        }
      });
      return out.slice(0, 15);
    },
    /** WCAG AA audit of every visible text node. */
    contrastFailures() {
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      let n;
      while ((n = walker.nextNode())) {
        const text = (n.textContent || "").trim();
        if (!text) continue;
        const el = n.parentElement;
        if (!el || seen.has(el) || !visible(el)) continue;
        seen.add(el);
        const cs = getComputedStyle(el);
        const fgRaw = parseColor(cs.color);
        if (!fgRaw) continue;
        const bg = bgOf(el);
        if (bg.gradient || !bg.color) continue;
        const fg = fgRaw.a < 1 ? blend(fgRaw, bg.color) : fgRaw;
        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const required = large ? 3 : 4.5;
        const ratio = contrast(fg, bg.color);
        if (ratio + 0.02 < required) {
          out.push({
            text: text.slice(0, 40),
            path: path(el),
            color: cs.color,
            background: "rgb(" + [bg.color.r, bg.color.g, bg.color.b].map(Math.round).join(",") + ")",
            size, weight, ratio: Math.round(ratio * 100) / 100, required,
          });
        }
      }
      return out;
    },
    /** Contrast of a fill against its surroundings (non-text UI, 3:1). */
    boxRatio(selector) {
      const el = Array.from(document.querySelectorAll(selector)).find(visible);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const fill = parseColor(cs.backgroundColor);
      const around = bgOf(el.parentElement);
      if (!fill || !around.color) return null;
      return Math.round(contrast(fill, around.color) * 100) / 100;
    },
    /** First VISIBLE match — the desktop rail is mounted but hidden on mobile. */
    rect(selector) {
      const el = Array.from(document.querySelectorAll(selector)).find(visible);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
    },
    rectOfText(role, pattern) {
      const rx = new RegExp(pattern, "i");
      const els = Array.from(document.querySelectorAll(role));
      const el = els.reverse().find((e) => rx.test((e.textContent || "").trim()) && visible(e));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 30) };
    },
    typography() {
      const sample = (sel) => {
        const el = Array.from(document.querySelectorAll(sel)).find(visible);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) };
      };
      return {
        h1: sample(".text-h1"),
        h2: sample(".text-h2"),
        h3: sample(".text-h3"),
        body: sample(".text-body"),
        bodySm: sample(".text-body-sm"),
        caption: sample(".text-caption"),
      };
    },
    scroll() {
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
      };
    },
    /** Is the chip rail scrollable, and is its last chip reachable? */
    railReach(selector) {
      const rail = Array.from(document.querySelectorAll(selector)).find(visible);
      if (!rail) return null;
      const chips = Array.from(rail.querySelectorAll("button"));
      const last = chips[chips.length - 1];
      rail.scrollLeft = rail.scrollWidth;
      const r = last.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      const reachable = r.right <= railRect.right + 1 && r.left >= railRect.left - 1;
      rail.scrollLeft = 0;
      return {
        label: (last.textContent || "").trim(),
        scrollable: rail.scrollWidth > rail.clientWidth,
        reachable,
        railWidth: Math.round(railRect.width),
        contentWidth: rail.scrollWidth,
      };
    },
  };
})();
`;

/* ------------------------------------------------------------------ runner */

const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? "  ok  " : " FAIL ";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Seed a live Supabase session so the app boots signed in. */
async function seedSession(page) {
  const token = fakeJwt();
  await page.evaluateOnNewDocument(
    (accessToken, user) => {
      const session = {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "qa-refresh",
        user: {
          id: user.id,
          aud: "authenticated",
          role: "authenticated",
          email: user.email,
          app_metadata: {},
          user_metadata: {},
          created_at: user.created_at,
        },
      };
      // supabase-js v2 keys storage as `sb-<project-ref>-auth-token`; newer
      // builds accept both the plain and the `base64-` wrapped payload.
      const raw = JSON.stringify(session);
      window.localStorage.setItem("sb-qa-stub-auth-token", raw);
      window.localStorage.setItem(
        "sb-qa-stub-auth-token.0",
        "base64-" + btoa(unescape(encodeURIComponent(raw))),
      );
    },
    token,
    AUTH_USER,
  );
}

/**
 * A page in its OWN incognito context: localStorage (the persisted theme),
 * service workers and caches must not leak between checks — otherwise the
 * theme-persistence pass inherits the dark mode chosen by the theme pass.
 */
async function newPage(browser, width, height) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.__context = context;
  const consoleIssues = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") consoleIssues.push(`${type}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleIssues.push(`pageerror: ${err.message}`));
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
  await page.setBypassServiceWorker(true);
  if (AUTHED) await seedSession(page);
  await stubApi(page);
  await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 90000 });
  await page.evaluate(PAGE_HELPERS);
  await page.waitForSelector(".leaflet-container, [data-testid='station-map-mock']", { timeout: 30000 }).catch(() => {});
  // Stations arrive from the stubbed API; measuring before they render would
  // audit a skeleton, not the product.
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("[data-testid='station-card']")).some(
          (el) => el.getBoundingClientRect().width > 0,
        ),
      { timeout: 20000 },
    )
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(PAGE_HELPERS);
  return { page, consoleIssues };
}

/** Close a page and the throwaway context it owns. */
async function closePage(page) {
  const context = page.__context;
  await page.close();
  await context?.close?.();
}

const MOBILE = [
  [320, 640],
  [360, 800],
  [375, 812],
  [390, 844],
  [414, 896],
  [430, 932],
];
const DESKTOP = [
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];

async function auditMobile(browser, [w, h]) {
  const { page, consoleIssues } = await newPage(browser, w, h);
  const label = `${w}x${h}`;

  const scroll = await page.evaluate(() => window.__audit.scroll());
  check(
    `${label} · no horizontal page scroll`,
    scroll.docScrollWidth <= scroll.clientWidth && scroll.bodyScrollWidth <= scroll.clientWidth,
    `doc=${scroll.docScrollWidth} body=${scroll.bodyScrollWidth} client=${scroll.clientWidth}`,
  );

  const offenders = await page.evaluate(() => window.__audit.overflowOffenders());
  check(
    `${label} · nothing painted outside the viewport`,
    offenders.length === 0,
    offenders.length ? JSON.stringify(offenders.slice(0, 3)) : "",
  );

  const search = await page.evaluate(() => window.__audit.rect("input[type='search']"));
  check(
    `${label} · search field fits`,
    search && search.left >= 0 && search.right <= w + 1 && search.h >= 40,
    search ? `x=${search.left}..${search.right} h=${search.h}` : "missing",
  );

  const rail = await page.evaluate(() =>
    window.__audit.railReach("[aria-label='Filter by fuel type']"),
  );
  check(
    `${label} · CNG reachable in the fuel rail`,
    rail && rail.label === "CNG" && rail.reachable,
    rail ? `last=${rail.label} scrollable=${rail.scrollable} rail=${rail.railWidth} content=${rail.contentWidth}` : "missing",
  );

  const nearMe = await page.evaluate(() => window.__audit.rectOfText("button", "^near me$"));
  const browseAll = await page.evaluate(() => window.__audit.rectOfText("button", "browse all"));
  check(
    `${label} · Near me fully visible`,
    nearMe && nearMe.left >= 0 && nearMe.right <= w + 1,
    nearMe ? `${nearMe.left}..${nearMe.right}` : "missing",
  );
  check(
    `${label} · Browse all fully visible`,
    browseAll && browseAll.left >= 0 && browseAll.right <= w + 1,
    browseAll ? `${browseAll.left}..${browseAll.right}` : "missing",
  );

  // --- map-first hierarchy -------------------------------------------------
  const geometry = await page.evaluate(() => {
    const map = document.querySelector("[aria-label='Station map']");
    const sheet = document.querySelector("[aria-label='Station map'] > section");
    const nav = document.querySelector("nav[aria-label='Main']");
    const header = document.querySelector("header");
    const controls = document.querySelector("[aria-label='Zoom in']")?.closest("div")?.parentElement;
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const box = (x) => (x ? { top: Math.round(x.top), bottom: Math.round(x.bottom), left: Math.round(x.left), right: Math.round(x.right), h: Math.round(x.height) } : null);
    return {
      viewport: window.innerHeight,
      map: box(r(map)),
      sheet: box(r(sheet)),
      nav: box(r(nav)),
      header: box(r(header)),
      controls: box(r(controls)),
    };
  });
  const visibleMap = geometry.map && geometry.sheet ? geometry.sheet.top - geometry.map.top : null;
  const chrome = geometry.map ? geometry.map.top : null;
  check(
    `${label} · map is the dominant band`,
    visibleMap !== null && visibleMap > chrome && visibleMap >= geometry.viewport * 0.24,
    `visibleMap=${visibleMap}px chrome=${chrome}px nav=${geometry.nav?.h}px viewport=${geometry.viewport}px (${visibleMap && Math.round((visibleMap / geometry.viewport) * 100)}%)`,
  );
  check(
    `${label} · collapsed sheet leaves the map visible`,
    geometry.sheet && geometry.map && geometry.sheet.h < geometry.map.h * 0.6,
    `sheet=${geometry.sheet?.h} map=${geometry.map?.h}`,
  );
  check(
    `${label} · map controls sit above the sheet`,
    geometry.controls && geometry.sheet && geometry.controls.bottom <= geometry.sheet.top + 1,
    `controlsBottom=${geometry.controls?.bottom} sheetTop=${geometry.sheet?.top}`,
  );
  check(
    `${label} · bottom nav does not overlap the sheet content`,
    geometry.nav && geometry.sheet && geometry.sheet.bottom <= geometry.nav.top + 1,
    `sheetBottom=${geometry.sheet?.bottom} navTop=${geometry.nav?.top}`,
  );

  // --- station cards -------------------------------------------------------
  const cards = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll("[data-testid='station-card']")).find(
      (el) => el.getBoundingClientRect().width > 0,
    );
    if (!card) return null;
    const cr = card.getBoundingClientRect();
    let worst = 0;
    card.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      worst = Math.max(worst, r.right - cr.right);
    });
    const name = card.querySelector("h3 button span");
    const nameCs = name ? getComputedStyle(name) : null;
    return {
      cardWidth: Math.round(cr.width),
      worstChildOverflow: Math.round(worst),
      nameTruncates: nameCs ? nameCs.textOverflow === "ellipsis" || nameCs.overflow === "hidden" : null,
      scrollWidthVsClient: name ? name.scrollWidth - name.clientWidth : null,
    };
  });
  check(
    `${label} · station card children stay inside the card`,
    cards && cards.worstChildOverflow <= 1,
    cards ? `worst=${cards.worstChildOverflow}px width=${cards.cardWidth}` : "no card rendered",
  );
  check(
    `${label} · a very long station name is truncated, not overflowing`,
    cards && cards.nameTruncates !== false,
    cards ? `truncates=${cards.nameTruncates}` : "",
  );

  const consoleOk = consoleIssues.filter(
    (m) => !/Download the React DevTools|Leaflet|favicon|preload/i.test(m),
  );
  check(`${label} · no console errors/warnings`, consoleOk.length === 0, consoleOk.slice(0, 2).join(" | "));

  await closePage(page);
}

async function auditSnaps(browser) {
  const { page } = await newPage(browser, 390, 844);
  const read = () =>
    page.evaluate(() => {
      const map = document.querySelector("[aria-label='Station map']").getBoundingClientRect();
      const sheet = document.querySelector("[aria-label='Station map'] > section").getBoundingClientRect();
      const scroller = document.querySelector("[aria-label='Station map'] > section > div:last-child");
      const handle = document.querySelector("[aria-label*='drag or use arrow keys'] span");
      const controls = document.querySelector("[aria-label='Zoom in']")?.closest("div")?.parentElement?.getBoundingClientRect();
      const nav = document.querySelector("nav[aria-label='Main']").getBoundingClientRect();
      return {
        ratio: Math.round((sheet.height / map.height) * 100),
        handleVisible: !!handle && handle.getBoundingClientRect().height > 0,
        scrollable: scroller ? scroller.scrollHeight > scroller.clientHeight : false,
        contentBottom: Math.round(sheet.bottom),
        navTop: Math.round(nav.top),
        controlsBottom: controls ? Math.round(controls.bottom) : null,
        sheetTop: Math.round(sheet.top),
        bodyScrollTop: document.scrollingElement.scrollTop,
      };
    });

  const grab = async () => {
    const handle = await page.$("[aria-label*='drag or use arrow keys']");
    await handle.focus();
    return handle;
  };

  const expectations = [
    ["peek", 42],
    ["half", 68],
    ["full", 92],
  ];
  const handle = await grab();
  for (const [name, expected] of expectations) {
    if (name !== "peek") {
      await handle.press("ArrowUp");
      await new Promise((r) => setTimeout(r, 420));
    }
    const m = await read();
    check(
      `sheet · ${name} snap is ${expected}% of the map`,
      Math.abs(m.ratio - expected) <= 2,
      `measured=${m.ratio}%`,
    );
    check(`sheet · ${name} · drag handle visible`, m.handleVisible);
    check(
      `sheet · ${name} · map controls stay above the sheet`,
      m.controlsBottom !== null && m.controlsBottom <= m.sheetTop + 1,
      `controls=${m.controlsBottom} sheetTop=${m.sheetTop}`,
    );
    check(
      `sheet · ${name} · nothing hidden behind the bottom nav`,
      m.contentBottom <= m.navTop + 1,
      `sheetBottom=${m.contentBottom} navTop=${m.navTop}`,
    );
    check(`sheet · ${name} · page itself never scrolls`, m.bodyScrollTop === 0);
  }
  const full = await read();
  check("sheet · expanded sheet scrolls its own content", full.scrollable, `scrollable=${full.scrollable}`);

  await handle.press("Escape");
  await new Promise((r) => setTimeout(r, 420));
  const back = await read();
  check("sheet · Escape collapses back to peek", Math.abs(back.ratio - 42) <= 2, `measured=${back.ratio}%`);

  await closePage(page);
}

async function auditTheme(browser, theme) {
  const { page } = await newPage(browser, 390, 844);
  if (theme === "dark") {
    await page.click("[aria-label='Switch to dark theme']").catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  }
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  check(`theme · ${theme} applied`, theme === "dark" ? isDark : !isDark);

  // Home
  let fails = await page.evaluate(() => window.__audit.contrastFailures());
  check(
    `theme · ${theme} · Home text contrast (WCAG AA)`,
    fails.length === 0,
    fails.length ? JSON.stringify(fails.slice(0, 4)) : "",
  );

  if (theme === "light") {
    // The contract is the TOKEN, so read the stylesheet rule rather than one
    // element (call sites legitimately add `font-semibold` on top of a size).
    const rules = await page.evaluate(() => {
      const out = {};
      for (const sheet of Array.from(document.styleSheets)) {
        let list;
        try {
          list = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(list || [])) {
          const m = /^\.(text-(?:h1|h2|h3|body|body-sm|caption))$/.exec(rule.selectorText || "");
          if (m) out[m[1]] = { size: rule.style.fontSize, weight: rule.style.fontWeight };
        }
      }
      return out;
    });
    const want = {
      "text-h1": ["1.5rem", "700"],
      "text-h2": ["1.25rem", "700"],
      "text-h3": ["1.125rem", "700"],
      "text-body": ["1rem", "400"],
      "text-body-sm": ["0.875rem", "400"],
      "text-caption": ["0.75rem", "500"],
    };
    for (const [cls, [size, weight]] of Object.entries(want)) {
      const got = rules[cls];
      check(
        `type · .${cls} = ${size}/${weight}`,
        got && got.size === size && got.weight === weight,
        got ? `got ${got.size}/${got.weight}` : "rule missing",
      );
    }
  }

  // Station details
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll("[data-testid='station-card']")).find(
      (el) => el.getBoundingClientRect().width > 0,
    );
    card?.querySelector("h3 button")?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  const detailOpen = await page.evaluate(() => !!document.querySelector("[aria-label='Back to stations']"));
  check(`nav · station card opens Station Details (${theme})`, detailOpen);
  if (detailOpen) {
    fails = await page.evaluate(() => window.__audit.contrastFailures());
    check(
      `theme · ${theme} · Station Details contrast`,
      fails.length === 0,
      fails.length ? JSON.stringify(fails.slice(0, 4)) : "",
    );
    const cta = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a")).find((x) => /get directions/i.test(x.textContent || ""));
      if (!a) return null;
      const cs = getComputedStyle(a);
      return { href: a.getAttribute("href"), bg: cs.backgroundColor, color: cs.color };
    });
    check(
      "details · Get Directions is a real maps link with the primary fill",
      cta && /google\.com\/maps|maps\./.test(cta.href || ""),
      cta ? `${cta.href?.slice(0, 60)} bg=${cta.bg}` : "missing",
    );
    await page.click("[aria-label='Back to stations']");
    await new Promise((r) => setTimeout(r, 400));
  }

  // AI assistant
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("nav[aria-label='Main'] button")).find((b) =>
      /AI Assistant/i.test(b.textContent || ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  const aiOpen = await page.evaluate(() => !!document.querySelector("[data-testid='fuel-intelligence']"));
  check(`nav · AI Assistant opens (${theme})`, aiOpen);
  if (aiOpen) {
    fails = await page.evaluate(() => window.__audit.contrastFailures());
    check(
      `theme · ${theme} · AI Assistant contrast`,
      fails.length === 0,
      fails.length ? JSON.stringify(fails.slice(0, 4)) : "",
    );
    const composer = await page.evaluate(() => {
      const input = document.querySelector("[data-testid='fuel-intelligence'] input");
      const send = document.querySelector("[data-testid='fuel-intelligence'] button[type='submit'], [data-testid='fuel-intelligence'] button:last-of-type");
      const ir = input?.getBoundingClientRect();
      const sr = send?.getBoundingClientRect();
      return {
        inputVisible: !!ir && ir.bottom <= window.innerHeight + 1 && ir.width > 100,
        sendVisible: !!sr && sr.bottom <= window.innerHeight + 1,
      };
    });
    check(`ai · composer input and send button are on screen (${theme})`, composer.inputVisible && composer.sendVisible, JSON.stringify(composer));
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 400));
  }

  // Account
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("nav[aria-label='Main'] button")).find((b) =>
      /Account/i.test(b.textContent || ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  const accountOpen = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h3, p")).some((n) => /Appearance|Welcome|Hello,/.test(n.textContent || "")),
  );
  check(`nav · Account opens (${theme})`, accountOpen);
  if (accountOpen) {
    fails = await page.evaluate(() => window.__audit.contrastFailures());
    check(
      `theme · ${theme} · Account contrast`,
      fails.length === 0,
      fails.length ? JSON.stringify(fails.slice(0, 4)) : "",
    );
  }

  await closePage(page);
}

async function auditDesktop(browser, [w, h]) {
  const { page } = await newPage(browser, w, h);
  const label = `${w}x${h}`;
  const scroll = await page.evaluate(() => window.__audit.scroll());
  check(
    `${label} · no horizontal page scroll`,
    scroll.docScrollWidth <= scroll.clientWidth,
    `doc=${scroll.docScrollWidth} client=${scroll.clientWidth}`,
  );
  const offenders = await page.evaluate(() => window.__audit.overflowOffenders());
  check(`${label} · nothing painted outside the viewport`, offenders.length === 0, JSON.stringify(offenders.slice(0, 2)));

  const layout = await page.evaluate(() => {
    const rail = document.querySelector("#stations");
    const map = document.querySelector("[aria-label='Station map']");
    const nav = document.querySelector("nav[aria-label='Main']");
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const rr = r(rail), mr = r(map), nr = nav ? getComputedStyle(nav).display : "none";
    return {
      railWidth: rr ? Math.round(rr.width) : 0,
      mapWidth: mr ? Math.round(mr.width) : 0,
      mapHeight: mr ? Math.round(mr.height) : 0,
      navDisplay: nr,
      sheetPresent: !!document.querySelector("[aria-label='Station map'] > section:not([class*='hidden'])") &&
        getComputedStyle(document.querySelector("[aria-label='Station map'] > section")).display !== "none",
    };
  });
  check(
    `${label} · desktop is a map-led split, not a stretched phone`,
    layout.mapWidth > layout.railWidth && layout.railWidth >= 380 && layout.railWidth <= 520,
    `rail=${layout.railWidth} map=${layout.mapWidth}x${layout.mapHeight}`,
  );
  check(`${label} · mobile bottom nav is hidden`, layout.navDisplay === "none", `display=${layout.navDisplay}`);
  check(`${label} · mobile sheet is hidden`, layout.sheetPresent === false);

  await closePage(page);
}


/* ------------------------------------------------- states / persistence -- */

async function auditStates(browser) {
  // --- empty ---------------------------------------------------------------
  DATA_MODE = "empty";
  let { page } = await newPage(browser, 390, 844);
  let seen = await page.evaluate(() => document.body.innerText);
  check(
    "state · empty result set is explained, with a way forward",
    /no stations match|no stations found/i.test(seen) && /clear filters|expand radius/i.test(seen),
    seen.replace(/\n+/g, " | ").slice(0, 90),
  );
  let fails = await page.evaluate(() => window.__audit.contrastFailures());
  check("state · empty state contrast", fails.length === 0, JSON.stringify(fails.slice(0, 3)));
  await closePage(page);

  // --- API error -----------------------------------------------------------
  DATA_MODE = "error";
  ({ page } = await newPage(browser, 390, 844));
  seen = await page.evaluate(() => document.body.innerText);
  check(
    "state · API failure shows a retryable error, not a blank screen",
    /couldn't load/i.test(seen) && /try again/i.test(seen),
    seen.replace(/\n+/g, " | ").slice(0, 90),
  );
  fails = await page.evaluate(() => window.__audit.contrastFailures());
  check("state · error state contrast", fails.length === 0, JSON.stringify(fails.slice(0, 3)));
  const stillMap = await page.evaluate(
    () => !!document.querySelector("[aria-label='Station map']"),
  );
  check("state · the map survives an API failure", stillMap);
  await closePage(page);

  // --- location denied -----------------------------------------------------
  DATA_MODE = null;
  ({ page } = await newPage(browser, 390, 844));
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) =>
      err({ code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1 });
    navigator.geolocation.watchPosition = (_ok, err) => {
      err({ code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1 });
      return 1;
    };
  });
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => /^near me$/i.test((b.textContent || "").trim()),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  seen = await page.evaluate(() => document.body.innerText);
  check(
    "state · denied location is explained with a manual fallback",
    /location access denied|could not get your location/i.test(seen) &&
      /choose a location|search by city|try again/i.test(seen),
    seen.replace(/\n+/g, " | ").slice(0, 110),
  );
  fails = await page.evaluate(() => window.__audit.contrastFailures());
  check("state · location-denied contrast", fails.length === 0, JSON.stringify(fails.slice(0, 3)));
  await closePage(page);
}

async function auditThemePersistence(browser) {
  const { page } = await newPage(browser, 390, 844);
  await page.click("[aria-label='Switch to dark theme']");
  await new Promise((r) => setTimeout(r, 300));
  check("theme · toggle light → dark", await page.evaluate(() => document.documentElement.classList.contains("dark")));

  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 600));
  const darkAfterReload = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    // The pre-hydration script must set the class before first paint.
    inlineScript: Array.from(document.scripts).some((sc) => /classList\.add\("dark"\)|dark/.test(sc.textContent || "")),
  }));
  check("theme · dark survives a reload", darkAfterReload.dark);
  check("theme · an anti-flash script runs before paint", darkAfterReload.inlineScript);

  await page.click("[aria-label='Switch to light theme']");
  await new Promise((r) => setTimeout(r, 300));
  check("theme · toggle dark → light", await page.evaluate(() => !document.documentElement.classList.contains("dark")));
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 600));
  check("theme · light survives a reload", await page.evaluate(() => !document.documentElement.classList.contains("dark")));
  await closePage(page);
}

async function auditAiConversation(browser) {
  const { page } = await newPage(browser, 390, 844);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("nav[aria-label='Main'] button")).find((b) =>
      /AI Assistant/i.test(b.textContent || ""),
    );
    btn?.click();
  });
  await page.waitForSelector("[data-testid='fuel-intelligence']", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));

  const chips = await page.evaluate(() => {
    const panel = document.querySelector("[data-testid='fuel-intelligence']");
    const btns = Array.from(panel.querySelectorAll("button")).filter((b) =>
      /near me|open stations|reported petrol price|before buying/i.test(b.textContent || ""),
    );
    const panelRect = panel.getBoundingClientRect();
    return {
      count: btns.length,
      allInside: btns.every((b) => {
        const r = b.getBoundingClientRect();
        return r.left >= panelRect.left - 1 && r.right <= panelRect.right + 1;
      }),
    };
  });
  check("ai · suggested prompts wrap inside the panel", chips.count >= 3 && chips.allInside, JSON.stringify(chips));

  // Ask something so both a user turn and an assistant turn exist.
  await page.type("[data-testid='fuel-intelligence'] input", "Cheapest diesel near me");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 1200));
  const bubbles = await page.evaluate(() => {
    const panel = document.querySelector("[data-testid='fuel-intelligence']");
    const pr = panel.getBoundingClientRect();
    const user = panel.querySelector("[data-testid='ai-user-message']");
    const assistant = Array.from(panel.querySelectorAll("p, div")).find((n) =>
      /I can find fuel stations|I need your location|snag/i.test(n.textContent || ""),
    );
    const box = (el) => (el ? el.getBoundingClientRect() : null);
    const u = box(user), a = box(assistant);
    return {
      userRight: u ? Math.round(pr.right - u.right) : null,
      userLeft: u ? Math.round(u.left - pr.left) : null,
      assistantLeft: a ? Math.round(a.left - pr.left) : null,
      assistantRight: a ? Math.round(pr.right - a.right) : null,
    };
  });
  check(
    "ai · user turn is right-aligned, assistant turn is left-aligned",
    bubbles.userRight !== null && bubbles.userLeft > bubbles.userRight &&
      bubbles.assistantLeft !== null && bubbles.assistantLeft <= bubbles.assistantRight,
    JSON.stringify(bubbles),
  );
  const fails = await page.evaluate(() => window.__audit.contrastFailures());
  check("ai · conversation contrast", fails.length === 0, JSON.stringify(fails.slice(0, 3)));
  await closePage(page);
}

/* ------------------------------------------------- authenticated screens -- */

async function auditAuthed(browser) {
  const { page } = await newPage(browser, 390, 844);

  const authState = await page.evaluate(() =>
    Array.from(document.querySelectorAll("header button")).some((b) =>
      /signed in as/i.test(b.getAttribute("aria-label") || ""),
    ),
  );
  check("auth · the header shows the authenticated user", authState);

  // Account: real user data, destructive sign out.
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("nav[aria-label='Main'] button")).find((b) =>
      /Account/i.test(b.textContent || ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  const account = await page.evaluate(() => {
    const text = document.body.innerText;
    const signOut = Array.from(document.querySelectorAll("button")).find((b) =>
      /sign out/i.test(b.textContent || ""),
    );
    const rows = Array.from(document.querySelectorAll("nav[aria-label='Account'] a, nav[aria-label='Account'] button"))
      .map((n) => (n.textContent || "").split("\n")[0].trim());
    return {
      greeting: /Hello, Ahmed/.test(text),
      email: /ahmed@example\.com/.test(text),
      verified: /Verified User/.test(text),
      rows,
      signOutColor: signOut ? getComputedStyle(signOut).color : null,
      signOutBg: signOut ? getComputedStyle(signOut).backgroundColor : null,
    };
  });
  check("account · greeting and email come from the authenticated user", account.greeting && account.email, JSON.stringify(account).slice(0, 120));
  check("account · verified badge reflects the account", account.verified);
  check(
    "account · every reference destination is present",
    ["My Reports", "Saved Stations", "Notification Settings", "Help & Support", "About Fuel Station Finder"].every((r) =>
      account.rows.some((row) => row.startsWith(r)),
    ),
    account.rows.join(" · "),
  );
  check("account · Sign Out is destructive (red)", /rgb\(1[6-9]\d|rgb\(2[0-5]\d/.test(account.signOutColor || ""), `${account.signOutColor} on ${account.signOutBg}`);
  let fails = await page.evaluate(() => window.__audit.contrastFailures());
  check("auth · Account (signed in) contrast", fails.length === 0, JSON.stringify(fails.slice(0, 3)));

  // My Reports opens from the account menu (no browser back needed).
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll("nav[aria-label='Account'] button")).find((b) =>
      /My Reports/i.test(b.textContent || ""),
    );
    row?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  check(
    "account · My Reports opens from the menu",
    await page.evaluate(() => /my reports|community reports|your reports/i.test(document.body.innerText)),
  );
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 400));

  // Station details → Report a Price → the real form (auth required).
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll("[data-testid='station-card']")).find(
      (el) => el.getBoundingClientRect().width > 0,
    );
    card?.querySelector("h3 button")?.click();
  });
  await page.waitForSelector("[aria-label='Back to stations']", { timeout: 10000 });
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /report a price/i.test(b.textContent || ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  const form = await page.evaluate(() => {
    const text = document.body.innerText;
    const price = document.querySelector("input[inputmode='decimal']");
    const fuels = Array.from(document.querySelectorAll("button[aria-pressed]"))
      .map((b) => (b.textContent || "").trim())
      .filter((t) => /PMS|AGO|DPK|LPG|CNG|Petrol|Diesel|Kerosene|Cooking/i.test(t));
    const selected = document.querySelector("button[aria-pressed='true']");
    return {
      heading: /Report Fuel Price/i.test(text),
      subtitle: /Help keep fuel prices updated/i.test(text),
      fuels,
      priceInput: !!price,
      priceRect: price ? Math.round(price.getBoundingClientRect().width) : 0,
      selectedBg: selected ? getComputedStyle(selected).backgroundColor : null,
      selectedColor: selected ? getComputedStyle(selected).color : null,
    };
  });
  check("report · the form opens for an authenticated user", form.heading && form.subtitle, JSON.stringify(form).slice(0, 140));
  check("report · fuel options are selectable", form.fuels.length >= 2, form.fuels.join(" · "));
  check("report · price input is present and full width", form.priceInput && form.priceRect > 200, `w=${form.priceRect}`);
  fails = await page.evaluate(() => window.__audit.contrastFailures());
  check("auth · Report Price contrast", fails.length === 0, JSON.stringify(fails.slice(0, 3)));

  // Step through to the photo step exactly as a user would: the wizard gates
  // "Continue" on step 1 until a price has been typed.
  await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll("input[inputmode='decimal']")).find(
      (i) => i.getBoundingClientRect().width > 0,
    );
    input?.focus();
  });
  await page.keyboard.type("1020");
  await new Promise((r) => setTimeout(r, 300));
  const priceTyped = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll("input[inputmode='decimal']")).find(
      (i) => i.getBoundingClientRect().width > 0,
    );
    return input ? input.value : null;
  });
  check("report · the price field accepts input", priceTyped === "1020", `value=${priceTyped}`);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const next = Array.from(document.querySelectorAll("button")).find((b) =>
        /^(continue|next)$/i.test((b.textContent || "").trim()),
      );
      next?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  }
  const photoStep = await page.evaluate(() => {
    const text = document.body.innerText;
    const file = document.querySelector("input[type='file']");
    const submit = Array.from(document.querySelectorAll("button")).find((b) => /submit report/i.test(b.textContent || ""));
    const sr = submit ? submit.getBoundingClientRect() : null;
    return {
      photoLabel: /Photo \(Optional\)/i.test(text),
      fileInput: !!file,
      accept: file ? file.getAttribute("accept") : null,
      submitVisible: !!sr && sr.width > 100 && sr.bottom <= window.innerHeight + 1,
      submitBg: submit ? getComputedStyle(submit).backgroundColor : null,
    };
  });
  check("report · photo step keeps the multipart file input", photoStep.fileInput && photoStep.photoLabel, JSON.stringify(photoStep).slice(0, 140));
  check("report · Submit Report is visible and green", photoStep.submitVisible && photoStep.submitBg === "rgb(13, 124, 74)", `${photoStep.submitBg} visible=${photoStep.submitVisible}`);
  fails = await page.evaluate(() => window.__audit.contrastFailures());
  check("auth · Report Price (photo step) contrast", fails.length === 0, JSON.stringify(fails.slice(0, 3)));

  await closePage(page);
}

/* ---------------------------------------------------------------- execute -- */

const browser = await resolveBrowser();
if (!browser) {
  console.log(
    "[skip] ui-audit needs a Chromium build.\n" +
      "       Install `puppeteer-core` (+ `@sparticuz/chromium`, or set CHROME_PATH)\n" +
      "       and re-run: node scripts/ui-audit.mjs --url http://localhost:3000",
  );
  process.exit(0);
}

console.log(`\nFuelFinder AI — UI audit against ${BASE_URL}\n${"=".repeat(60)}`);

console.log("\n— mobile widths —");
for (const vp of MOBILE) await auditMobile(browser, vp);

console.log("\n— bottom sheet —");
await auditSnaps(browser);

console.log("\n— light theme —");
await auditTheme(browser, "light");

console.log("\n— dark theme —");
await auditTheme(browser, "dark");

console.log("\n— conversation —");
await auditAiConversation(browser);

console.log("\n— loading / empty / error states —");
await auditStates(browser);

console.log("\n— theme persistence —");
await auditThemePersistence(browser);

console.log("\n— authenticated screens —");
if (process.env.AUDIT_SUPABASE_STUB === "1") {
  AUTHED = true;
  await auditAuthed(browser);
  AUTHED = false;
} else {
  console.log(
    "[skip] set AUDIT_SUPABASE_STUB=1 and build with NEXT_PUBLIC_SUPABASE_URL=https://qa-stub.supabase.co\n" +
      "       NEXT_PUBLIC_SUPABASE_ANON_KEY=qa-anon to audit Report Price / signed-in Account.",
  );
}

console.log("\n— desktop widths —");
for (const vp of DESKTOP) await auditDesktop(browser, vp);

await browser.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${"=".repeat(60)}\nChecks: ${passed}/${results.length} passed, ${failures} failed`);

if (JSON_OUT) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(JSON_OUT, JSON.stringify({ base: BASE_URL, results }, null, 2));
  console.log(`Report written to ${JSON_OUT}`);
}

process.exit(failures > 0 ? 1 : 0);
