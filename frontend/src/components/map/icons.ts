/**
 * Custom Leaflet `divIcon` builders.
 *
 * HTML-based divIcons (not Leaflet's default image markers) so icons render
 * correctly under Next.js bundling and can be themed with the design tokens.
 *
 * Marker hierarchy — a driver must be able to read the map at a glance:
 *
 *   selected     large brand pin, white ring, drop shadow, lifted (z-index)
 *   closest      accent (amber) pin with a star glyph
 *   verified     brand pin with a check glyph
 *   available    brand pin with the fuel glyph
 *   unavailable  muted grey pin with a slash glyph
 *   user         blue dot with an animated accuracy halo
 *
 * Glyphs are inline SVG paths (not emoji) so they render identically on every
 * Android/iOS/desktop browser — the previous ⛽/👑 emoji did not.
 */

import L from "leaflet";

export type MarkerState =
  | "default"
  | "verified"
  | "unavailable"
  | "closest"
  | "selected";

const COLORS: Record<MarkerState, { fill: string; glyph: string }> = {
  default: { fill: "#04795a", glyph: "#ffffff" },
  verified: { fill: "#065f49", glyph: "#ffffff" },
  unavailable: { fill: "#9aa7b1", glyph: "#ffffff" },
  closest: { fill: "#f79009", glyph: "#3b1d05" },
  selected: { fill: "#0a4d3c", glyph: "#ffffff" },
};

/** Inline glyph paths, drawn inside a 24×24 box centred at (12, 11). */
const GLYPHS: Record<MarkerState, string> = {
  // fuel pump
  default: `<path d="M9.4 6.6h4.1v8.8H9.4z" opacity="0.001"/>
    <path d="M9.2 6.4h3.9c.3 0 .5.2.5.5v8.2c0 .3-.2.5-.5.5H9.2a.5.5 0 0 1-.5-.5V6.9c0-.3.2-.5.5-.5Z" fill="CURRENT" opacity="0"/>
    <path d="M8.9 6.6h4.4v1.9H8.9zM8.9 9.6h4.4v5.4H8.9z" fill="CURRENT"/>
    <path d="M14.4 8.2l1.3 1.3v4.2a.9.9 0 1 0 1.8 0V9.1l-2.2-2.2-.9.9v.4Z" fill="CURRENT"/>`,
  verified: `<path d="M8.3 11.4l2.3 2.3 5-5" fill="none" stroke="CURRENT" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`,
  unavailable: `<path d="M8.4 7.4l7.2 7.2M15.6 7.4l-7.2 7.2" fill="none" stroke="CURRENT" stroke-width="2" stroke-linecap="round"/>`,
  closest: `<path d="M12 6.2l1.7 3.5 3.8.5-2.8 2.7.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.7 3.8-.5z" fill="CURRENT"/>`,
  selected: `<path d="M8.9 6.6h4.4v1.9H8.9zM8.9 9.6h4.4v5.4H8.9z" fill="CURRENT"/>
    <path d="M14.4 8.2l1.3 1.3v4.2a.9.9 0 1 0 1.8 0V9.1l-2.2-2.2-.9.9v.4Z" fill="CURRENT"/>`,
};

function pinHtml(state: MarkerState, big: boolean): string {
  const { fill, glyph } = COLORS[state];
  const w = big ? 40 : 30;
  const h = big ? 52 : 39;
  return `
  <div class="fuel-pin fuel-pin--${state}">
    <svg width="${w}" height="${h}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 0.8C5.9 0.8 0.9 5.8 0.9 11.9c0 8.1 9.5 17.9 10.6 19a0.7 0.7 0 0 0 1 0c1.1-1.1 10.6-10.9 10.6-19C23.1 5.8 18.1 0.8 12 0.8z"
        fill="${fill}" stroke="#ffffff" stroke-width="1.7"/>
      <circle cx="12" cy="11.4" r="7.2" fill="rgba(255,255,255,0.16)"/>
      ${GLYPHS[state].replaceAll("CURRENT", glyph)}
    </svg>
  </div>`;
}

function makePin(state: MarkerState, big: boolean, extraClass = ""): L.DivIcon {
  const w = big ? 40 : 30;
  const h = big ? 52 : 39;
  return L.divIcon({
    className: `fuel-station-marker ${extraClass}`.trim(),
    html: pinHtml(state, big),
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 6],
  });
}

/** Standard station pin (offers fuel, not independently verified). */
export const stationIcon = makePin("default", false);

/** Station whose catalogue record is verified by the app. */
export const verifiedStationIcon = makePin("verified", false);

/** Station currently marked inactive / no fuel reported available. */
export const unavailableStationIcon = makePin("unavailable", false);

/** The currently selected station — largest, lifted above all others. */
export const selectedStationIcon = makePin(
  "selected",
  true,
  "fuel-station-marker--selected",
);

/** The nearest station in nearby mode. */
export const closestStationIcon = makePin(
  "closest",
  true,
  "fuel-station-marker--closest",
);

/** Pick the right pin for a station's real state. */
export function iconForStation(opts: {
  isSelected: boolean;
  isClosest: boolean;
  isVerified: boolean;
  isActive: boolean;
}): L.DivIcon {
  if (opts.isSelected) return selectedStationIcon;
  if (opts.isClosest) return closestStationIcon;
  if (!opts.isActive) return unavailableStationIcon;
  if (opts.isVerified) return verifiedStationIcon;
  return stationIcon;
}

/** User position: solid dot inside an animated accuracy halo. */
export const userLocationIcon = L.divIcon({
  className: "user-location-marker",
  html: `<div class="user-location-marker__wrap">
    <span class="user-location-marker__pulse"></span>
    <span class="user-location-marker__dot"></span>
  </div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** Cluster icon used by MarkerClusterGroup — scales with child count. */
export const clusterIcon = (cluster: {
  getChildCount: () => number;
}): L.DivIcon => {
  const count = cluster.getChildCount();
  const large = count >= 25;
  return L.divIcon({
    html: `<div class="fuel-cluster__inner"><span>${count}</span><span class="fuel-cluster__label">stations</span></div>`,
    className: `fuel-cluster${large ? " fuel-cluster--lg" : ""}`,
    iconSize: L.point(large ? 48 : 40, large ? 48 : 40, true),
  });
};
