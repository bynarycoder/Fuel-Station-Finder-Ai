/**
 * Station naming helpers.
 *
 * Real catalogue data (especially OpenStreetMap imports) frequently sets
 * `brand` to the same string the `name` already starts with — e.g.
 * brand "A.A. Rano" + name "A.A. Rano Ikorodu Road", or brand and name both
 * "NNPC". Rendering `{brand} {name}` blindly produced "A.A. Rano A.A. Rano".
 *
 * These helpers keep the brand as a quiet prefix ONLY when it adds
 * information, and always produce a single clean accessible label.
 */

export interface StationNameParts {
  /** Brand to render as the muted prefix, or null when it would be redundant. */
  brandPrefix: string | null;
  /** The name to render as the primary text. */
  name: string;
  /** One clean string for aria-labels, titles and analytics. */
  label: string;
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function stationNameParts(
  brand: string | null | undefined,
  name: string,
): StationNameParts {
  const cleanName = name.trim();
  const cleanBrand = brand?.trim() ?? "";

  if (!cleanBrand) {
    return { brandPrefix: null, name: cleanName, label: cleanName };
  }

  const nb = normalise(cleanBrand);
  const nn = normalise(cleanName);

  // Brand is identical to the name, or the name already leads with the brand.
  if (nn === nb || nn.startsWith(`${nb} `)) {
    return { brandPrefix: null, name: cleanName, label: cleanName };
  }

  return {
    brandPrefix: cleanBrand,
    name: cleanName,
    label: `${cleanBrand} ${cleanName}`,
  };
}

/** Convenience: the single-string form (lists, aria-labels, popups). */
export function stationLabel(
  brand: string | null | undefined,
  name: string,
): string {
  return stationNameParts(brand, name).label;
}
