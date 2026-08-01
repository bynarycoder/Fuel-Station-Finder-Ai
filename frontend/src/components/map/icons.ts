/**
 * Custom Leaflet `divIcon` builders.
 *
 * We use HTML-based divIcons (not Leaflet's default image markers) so the icons
 * render correctly under Next.js bundling (the default marker image paths break
 * without special configuration) and so we can theme them with Tailwind/emerald.
 */

import L from "leaflet";

const stationPin = (selected: boolean): string => `
  <div class="fuel-pin ${selected ? "fuel-pin--selected" : ""}">
    <svg width="28" height="36" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z"
        fill="${selected ? "#b45309" : "#047857"}" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="6" fill="white"/>
      <text x="12" y="16" text-anchor="middle" font-size="9" font-weight="700"
        fill="${selected ? "#b45309" : "#047857"}">⛽</text>
    </svg>
  </div>`;

export const stationIcon = L.divIcon({
  className: "fuel-station-marker",
  html: stationPin(false),
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  popupAnchor: [0, -32],
});

export const selectedStationIcon = L.divIcon({
  className: "fuel-station-marker fuel-station-marker--selected",
  html: stationPin(true),
  iconSize: [34, 44],
  iconAnchor: [17, 44],
  popupAnchor: [0, -40],
});

export const userLocationIcon = L.divIcon({
  className: "user-location-marker",
  html: `<div class="user-location-marker__dot"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/** Cluster icon (emerald themed) used by MarkerClusterGroup. */
export const clusterIcon = (cluster: {
  getChildCount: () => number;
}): L.DivIcon =>
  L.divIcon({
    html: `<div class="fuel-cluster__inner">${cluster.getChildCount()}</div>`,
    className: "fuel-cluster",
    iconSize: L.point(40, 40, true),
  });
