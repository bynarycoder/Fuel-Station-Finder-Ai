"""
Original 18 seed stations: 15 Lagos + 3 FCT.

Kept verbatim (no edits to names, addresses or coordinates) for backward
compatibility — the production database already contains these rows, and the
seed's natural key ``(name, city)`` must match. The nationwide expansion in
:mod:`.nationwide` adds additional demo coverage; it never replaces these.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# Catalogue data: representative Nigerian filling stations.
#
# Coordinates are approximate, drawn from well-known neighbourhoods so that the
# dataset is geographically realistic for nearby-search testing. Phone numbers
# are intentionally omitted to avoid fabricating personal contact details.
# --------------------------------------------------------------------------- #

LAGOS_FCT_STATIONS: list[dict] = [
    # ---- Lagos ----
    {
        "name": "NNPC Retail Ikeja",
        "brand": "NNPC",
        "address": "Obafemi Awolowo Way, Ikeja",
        "city": "Ikeja",
        "state": "Lagos",
        "latitude": 6.6018,
        "longitude": 3.3515,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG", "CNG"],
    },
    {
        "name": "TotalEnergies Victoria Island",
        "brand": "TotalEnergies",
        "address": "Adeola Odeku Street, Victoria Island",
        "city": "Victoria Island",
        "state": "Lagos",
        "latitude": 6.4306,
        "longitude": 3.4217,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "Mobil Lekki Phase 1",
        "brand": "Mobil",
        "address": "Lekki-Epe Expressway, Lekki Phase 1",
        "city": "Lekki",
        "state": "Lagos",
        "latitude": 6.4474,
        "longitude": 3.4688,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Conoil Surulere",
        "brand": "Conoil",
        "address": "Adeniran Ogunsanya Street, Surulere",
        "city": "Surulere",
        "state": "Lagos",
        "latitude": 6.4922,
        "longitude": 3.3545,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Oando Yaba",
        "brand": "Oando",
        "address": "Herbert Macaulay Way, Yaba",
        "city": "Yaba",
        "state": "Lagos",
        "latitude": 6.4896,
        "longitude": 3.3733,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "MRS Oil Ikoyi",
        "brand": "MRS",
        "address": "Awolowo Road, Ikoyi",
        "city": "Ikoyi",
        "state": "Lagos",
        "latitude": 6.4476,
        "longitude": 3.4345,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "NIPCO Apapa",
        "brand": "NIPCO",
        "address": "Wharf Road, Apapa",
        "city": "Apapa",
        "state": "Lagos",
        "latitude": 6.4497,
        "longitude": 3.3625,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "Forte Oil Festac Town",
        "brand": "Forte Oil",
        "address": "1st Avenue, Festac Town",
        "city": "Festac",
        "state": "Lagos",
        "latitude": 6.4667,
        "longitude": 3.3167,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Bovas Agege",
        "brand": "Bovas",
        "address": "Agege-Ogba Road, Agege",
        "city": "Agege",
        "state": "Lagos",
        "latitude": 6.6167,
        "longitude": 3.3333,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "AA Rano Ikorodu",
        "brand": "AA Rano",
        "address": "Ikorodu-Sagamu Road, Ikorodu",
        "city": "Ikorodu",
        "state": "Lagos",
        "latitude": 6.6194,
        "longitude": 3.5106,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "NNPC Retail Alausa",
        "brand": "NNPC",
        "address": "Secretariat Road, Alausa, Ikeja",
        "city": "Alausa",
        "state": "Lagos",
        "latitude": 6.6160,
        "longitude": 3.3550,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "TotalEnergies Maryland",
        "brand": "TotalEnergies",
        "address": "Ikorodu Road, Maryland",
        "city": "Maryland",
        "state": "Lagos",
        "latitude": 6.5750,
        "longitude": 3.3680,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "Oando Ojuelegba",
        "brand": "Oando",
        "address": "Ojuelegba Roundabout, Surulere",
        "city": "Ojuelegba",
        "state": "Lagos",
        "latitude": 6.4970,
        "longitude": 3.3647,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Conoil Ojota",
        "brand": "Conoil",
        "address": "Ikorodu Road, Ojota",
        "city": "Ojota",
        "state": "Lagos",
        "latitude": 6.5556,
        "longitude": 3.3719,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Mobil Ojodu-Berger",
        "brand": "Mobil",
        "address": "Lagos-Ibadan Expressway, Ojodu-Berger",
        "city": "Berger",
        "state": "Lagos",
        "latitude": 6.6444,
        "longitude": 3.3567,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    # ---- FCT (Abuja) ----
    {
        "name": "NNPC Retail Wuse 2",
        "brand": "NNPC",
        "address": "Aminu Kano Crescent, Wuse 2, Abuja",
        "city": "Wuse 2",
        "state": "FCT",
        "latitude": 9.0820,
        "longitude": 7.4720,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "TotalEnergies Garki",
        "brand": "TotalEnergies",
        "address": "Area 1, Garki, Abuja",
        "city": "Garki",
        "state": "FCT",
        "latitude": 9.0250,
        "longitude": 7.4880,
        "fuel_types": ["PMS", "AGO", "DPK", "CNG"],
    },
    {
        "name": "Oando Maitama",
        "brand": "Oando",
        "address": "Aguiyi Ironsi Street, Maitama, Abuja",
        "city": "Maitama",
        "state": "FCT",
        "latitude": 9.0900,
        "longitude": 7.4900,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
]
