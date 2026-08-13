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
  community-derived; verify before promoting.
- **Partner CSV/JSON exports** — a cron job that POSTs batches or runs
  `import_stations_sync`.

**Verification policy:** `verification_status` should only become `verified`
when a human/moderator review (or an authoritative source with explicit
evidence) supports it. The importer's default (`unverified`) is correct for
every automated bulk import until reviewed.

## Frontend presentation

- `types/station.ts` — `StationDataSource`, `StationVerificationStatus` and
  label maps (`VERIFICATION_STATUS_LABELS`, `DATA_SOURCE_LABELS`).
- `components/stations/StationProvenanceBadge.tsx` — pill rendered on list
  rows, the "Closest to you" card, the station detail panel and map popups.
- Seed rows read "Unverified Demo Data" (gray) — informative, not alarming;
  verified rows read "Verified" (green); community-derived reports carry their
  own workflow statuses (pending/under review/verified/rejected) in the
  reports feed and "My reports".
