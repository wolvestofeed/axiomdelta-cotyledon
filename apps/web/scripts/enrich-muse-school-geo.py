#!/usr/bin/env python3
"""
Impact OS — school prospect geo-enrichment.

Adds { lat, lng, geoSource } to every record in schools-compiled.json so the
Sales map tab can drop a pin per school. Free / in-house, no API key:

  1. Street-address geocode via the U.S. Census Geocoder (public, no key,
     public-domain results) — most schools have a real street address.
  2. Fallback to ZIP-code centroid (U.S. Census Gazetteer, public domain) when
     the address has a ZIP but doesn't geocode.
  3. Otherwise null (regional offices, "Northeast Austin", etc.) — not mapped.

No runtime external calls: coordinates are baked into the committed JSON.
Safe to re-run: if geocoding a row fails (e.g. no network), any existing
coordinates on that row are preserved rather than wiped.

Run:  pnpm muse:school-geo   (needs network for fresh geocoding)
  ZIP-centroid file via env CT_GAZ_ZCTA (default /tmp extraction).
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
JSON_PATH = os.path.join(REPO, "apps/web/src/app/(muse)/muse/_data/schools-compiled.json")
ZCTA_TXT = os.environ.get("CT_GAZ_ZCTA", "/tmp/czcta/2023_Gaz_zcta_national.txt")

CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"


def load_zcta():
    m = {}
    if not os.path.exists(ZCTA_TXT):
        return m
    with open(ZCTA_TXT) as f:
        next(f, None)
        for line in f:
            cols = line.split("\t")
            if len(cols) < 7:
                continue
            try:
                m[cols[0].strip()] = (float(cols[5]), float(cols[6]))
            except ValueError:
                pass
    return m


def census_geocode(address):
    """Return (lat, lng) or None."""
    qs = urllib.parse.urlencode(
        {"address": address, "benchmark": "Public_AR_Current", "format": "json"}
    )
    try:
        with urllib.request.urlopen(f"{CENSUS}?{qs}", timeout=20) as r:
            data = json.load(r)
        matches = data.get("result", {}).get("addressMatches", [])
        if matches:
            c = matches[0]["coordinates"]
            return (float(c["y"]), float(c["x"]))
    except Exception:
        return None
    return None


def has_street_number(loc):
    # First non-empty campus (addresses split on "/") and a leading number.
    first = loc.split("/")[0].strip()
    return bool(re.match(r"^\d+\s", first))


def main():
    zcta = load_zcta()
    with open(JSON_PATH) as f:
        dataset = json.load(f)

    by_addr = by_zip = kept = none = 0
    for s in dataset["schools"]:
        loc = (s.get("location") or "").strip()
        addr = loc.split("/")[0].strip()

        coord = None
        source = None
        if loc and has_street_number(loc):
            coord = census_geocode(addr)
            if coord:
                source = "address"
                time.sleep(0.15)  # be polite to the public endpoint

        if not coord:
            zc = zcta.get(s.get("zip") or "")
            if zc:
                coord, source = zc, "zip"

        if coord:
            s["lat"], s["lng"], s["geoSource"] = coord[0], coord[1], source
            if source == "address":
                by_addr += 1
            else:
                by_zip += 1
        elif s.get("lat") is not None:
            kept += 1  # preserve prior coordinates on failure
        else:
            s["lat"], s["lng"], s["geoSource"] = None, None, None
            none += 1

    with open(JSON_PATH, "w") as f:
        json.dump(dataset, f, indent=2)
        f.write("\n")
    print(
        f"geo-enriched {len(dataset['schools'])} schools — "
        f"address:{by_addr} zip:{by_zip} kept:{kept} none:{none}"
    )


if __name__ == "__main__":
    main()
