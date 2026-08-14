# DATA PROVENANCE

How station data gets into Fuel Station Finder AI, how it is labelled, and
how genuine data can be imported — without ever faking verification.

## Provenance model

Every `fuel_stations` row carries:

| Column | Values | Meaning |
|---|---|---|
| `data_source` | `seed` · `official` · `government` · `partner` · `community` · `imported` · `other` | Where the record came from |
| `verification_status` | `unverified` · `pending` · `verified` · `rejected` | Whether the **record itself** has been independently checked |
| `verified_at` / `last_verified_at` | timestamp | When first / last verified |
| `source_id` | string | Optional external identifier (provider's primary key) used for idempotent re-imports |

Rules that keep the data honest:

1. The built-in seed script (`app/scripts/seed.py`) always writes
   `data_source='seed'`, `verification_status='unverified'` — including on
   re-runs, so re-seeding can never upgrade rows to "verified".
2. The import service never marks rows `verified` unless the **source
   provides** explicit verification metadata with the record.
3. The API passes these fields through untouched; the frontend renders them
   as badges ("Unverified Demo Data", "Verified", "Awaiting Verification",
   …). Nothing is hard-coded per station.

## Current data (facts)

- **176 stations total**, all `seed` + `unverified`: 18 original Lagos/FCT
  seed rows + 158 nationwide demo rows (each named with a `(Demo)` suffix).
- The nationwide catalogue is **synthetic/demo data** and is **not** an
  authoritative live registry. Coordinates are approximate, drawn from
  well-known neighbourhoods for demo purposes.
- No external data provider is currently connected, and no paid API is
  required for the app to work.

## Importing genuine data

### 1. Via the API (recommended)

`POST /api/v1/stations/import` (Admin or Station Manager — enforced
server-side):

```json
{
  "records": [
    {
      "name": "NNPC Retail Garki",
      "brand": "NNPC",
      "address": "Aminu Kano Crescent, Garki",
      "city": "Garki",
      "state": "FCT",
      "latitude": 9.0275,
      "longitude": 7.4772,
      "fuel_type_codes": ["PMS", "AGO", "CNG"],
      "source": "NMDPRA-2025",          // required
      "source_id": "NG-10234",           // optional, for dedupe
      "verification_status": "unverified" // default; only promote with evidence
    }
  ]
}
```

Per-record validation: name required; latitude ∈ [-90, 90]; longitude ∈
[-180, 180]; state must be one of the 36 states + FCT ("Abuja" is normalised
to "FCT"); `source` required; fuel codes must exist (PMS/AGO/DPK/LPG/CNG).
Invalid records are reported per index and never block valid ones.

Idempotency: a record whose `source_id` matches an existing row **updates**
it; otherwise the `(name, city)` business key is used. Re-importing the same
batch inserts nothing twice (proven by tests).

### 2. Via CLI/script

`import_stations_sync(session, records)` in
`backend/app/services/station_import.py` — same validation + upsert, for
batch jobs (e.g. a nightly provider sync).

### 3. Connecting a real provider (documented path, no fake keys)

The importer accepts plain dicts, so any trustworthy source only needs a
small adapter that yields the same record shape:

- **NMDPRA / DPR downstream data** — regulator-issued retail outlet lists
  (licence numbers map naturally to `source_id`).
- **NNPC retail directory / brand station locators** (TotalEnergies, Mobil,
  Conoil, Oando…) — brand-official lists, `data_source='official'`.
- **Government open data / NBS gazetteers** — `data_source='government'`.
- **OpenStreetMap Overpass** (query tagged `amenity=fuel` in Nigeria) —
  community-derived; verify before promoting. **Implemented** — see
  section 4 below (`scripts/data/extract_nigeria_osm_fuel.py`).
- **Partner CSV/JSON exports** — a cron job that POSTs batches or runs
  `import_stations_sync`.

**Verification policy:** `verification_status` should only become `verified`
when a human/moderator review (or an authoritative source with explicit
evidence) supports it. The importer's default (`unverified`) is correct for
every automated bulk import until reviewed.

### 4. OpenStreetMap / Overpass extraction (implemented)

`scripts/data/extract_nigeria_osm_fuel.py` is a working, self-contained
extractor that pulls **genuine** `amenity=fuel` objects for all 36 Nigerian
states + FCT from public Overpass API endpoints (no API key) and converts
them into the exact `StationImportRequest` record shape.

**Data source and licensing (read before using the data):**

* The data comes from **OpenStreetMap**, retrieved through the **Overpass
  API** — it is community-mapped data, **not** an official NMDPRA/NNPC
  registry. It must never be presented as official verification.
* OSM data is © OpenStreetMap contributors and is made available under the
  **Open Database License (ODbL) 1.0**
  (https://www.openstreetmap.org/copyright). Any application displaying or
  redistributing it **must provide appropriate OpenStreetMap attribution**.
* The extractor therefore always emits `source="OSM-Overpass"`,
  `data_source="imported"`, `verification_status="unverified"` and never
  marks an OSM station as verified. `source_id` is the OSM object identity
  (`node/<id>`, `way/<id>`, `relation/<id>`), making imports idempotent.

**How it works:**

* One query per state using the state's exact OSM administrative area
  (`area["ISO3166-2"="NG-XX"]`), with a padded bounding-box fallback and
  several public Overpass mirrors (`--endpoints` to override).
* Requests are strictly sequential and rate-limited; failures are retried
  with backoff; a failed state is recorded in the report and never stops
  the other states.
* OSM ways/relations use the representative `center` coordinate returned by
  Overpass. Fuel types are mapped strictly from OSM tags
  (`fuel:petrol`/`gasoline`/`pms`/`octane_*` → PMS, `fuel:diesel`/`ago`/
  `hgv_diesel`/`biodiesel`/`gtl_diesel` → AGO, `fuel:kerosene`/`kerosine`/
  `dpk` → DPK, `fuel:lpg`/`gas`/`cooking_gas` → LPG, `fuel:cng`/
  `natural_gas`/`methane*` → CNG). Anything unlisted is ignored — fuels are
  never guessed; unknown/absent fuel info yields `"fuel_type_codes": []`.
* Addresses are built only from actual OSM address tags
  (`addr:housenumber`, `addr:street`, `addr:full`, `addr:housename`);
  `city` comes from `addr:city`/`addr:town`/`addr:suburb`. Missing values
  stay `None` — nothing is invented.
* OSM objects without a `name` tag cannot satisfy the importer's
  required-name rule, and the extractor never invents names for them: they
  are counted and reported as excluded instead of being renamed.
* State names are normalised to exactly the application's `NIGERIAN_STATES`
  (including FCT spellings and common variants such as "Nassarawa"); when
  OSM tags say nothing recognisable, the element is attributed to the state
  whose area it was queried inside.
* Duplicates are removed by `source_id` and by identical name within ~100 m
  (the richer record is kept).

**Running it:**

```bash
# small test extraction (25 records, FCT only)
python scripts/data/extract_nigeria_osm_fuel.py --states FCT --limit 25 --overwrite

# full Nigeria extraction (36 states + FCT)
python scripts/data/extract_nigeria_osm_fuel.py --overwrite

# replay a previous extraction from the local response cache (no network)
python scripts/data/extract_nigeria_osm_fuel.py --use-cache --overwrite
```

Outputs (created automatically; never overwritten unless `--overwrite`):

* `scripts/data/output/nigeria_osm_fuel_stations.json` — `{"meta": …,
  "records": […]}`; `records` is directly submittable to
  `POST /api/v1/stations/import`.
* `scripts/data/output/nigeria_osm_fuel_stations.csv` — the same records.
* `scripts/data/output/nigeria_osm_fuel_report.json` — full extraction
  statistics (successful/failed states, per-state and per-fuel counts,
  duplicates, exclusions, endpoints used, errors).
* `scripts/data/output/cache/` — raw Overpass responses per state
  (provenance / replay).

The extractor never writes to the database; submit the JSON through the
staff-only import endpoint (or `import_stations_sync`) after review.

## Frontend presentation

- `types/station.ts` — `StationDataSource`, `StationVerificationStatus` and
  label maps (`VERIFICATION_STATUS_LABELS`, `DATA_SOURCE_LABELS`).
- `components/stations/StationProvenanceBadge.tsx` — pill rendered on list
  rows, the "Closest to you" card, the station detail panel and map popups.
- Seed rows read "Unverified Demo Data" (gray) — informative, not alarming;
  verified rows read "Verified" (green); community-derived reports carry their
  own workflow statuses (pending/under review/verified/rejected) in the
  reports feed and "My reports".
