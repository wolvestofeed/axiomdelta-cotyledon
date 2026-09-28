#!/usr/bin/env python3
"""
Cotyledon — Scope 3 food emission factors generator.

Reads the Poore & Nemecek (2018) meta-analysis workbook (Science 360:987–992,
Data S2 "Life Cycle Assessment of Food & Drink Products: Meta-Analysis Model")
from the git-ignored research folder and emits a committed, attributed JSON
compilation of per-product means the Sustainability engine consumes.

Method: for each of the study's 43 top-level products (numbered rows in the
Database sheet), the mean is the observation-weighted average of the adjusted
retail-weight impact using the study's own final `Weight` column (weights sum
to 1.0 within each product). Nothing is fabricated; every value is arithmetic
on the study's rows. The raw workbook stays local; only this derived
compilation is versioned.

Run:  pnpm farm:input-factors   (needs python3 + openpyxl and the local .xlsx)
"""

import datetime as dt
import json
import os
import re
import sys

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required: pip install openpyxl")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.join(
    REPO, "docs/farm/confidential/Research/Poore_Namecek_Food_Supply_LCA.xlsx"
)
OUT = os.path.join(REPO, "src/data/input-factors-compiled.json")

# Database sheet column indexes (0-based), from the workbook's header rows.
COL_NUM, COL_REF, COL_PRODUCT, COL_COUNTRY = 0, 1, 2, 8
COL_WEIGHT = 22
COL_LAND, COL_GHG, COL_EUTR, COL_WATER = 44, 65, 108, 118
COL_GHG_STAGES = list(range(67, 76))  # LUC burn … Loss; must sum to COL_GHG
STAGE_KEYS = ["lucBurn", "lucCStock", "feed", "farm", "processing", "transportStorage", "packaging", "retail", "loss"]


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main() -> None:
    if not os.path.exists(SRC):
        sys.exit(f"source workbook not found: {SRC}")
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb["Database"]
    groups, cur = [], None
    used = bad = 0
    for row in ws.iter_rows(min_row=6, values_only=True):
        if row[COL_NUM] not in (None, "") and row[COL_REF] and not row[COL_PRODUCT]:
            cur = {"num": int(row[COL_NUM]), "product": str(row[COL_REF]).strip(), "n": 0,
                   "w": 0.0, "ghg": 0.0, "land": 0.0, "eutr": 0.0, "water": 0.0, "countries": set(),
                   "stages": {k: 0.0 for k in STAGE_KEYS}}
            groups.append(cur)
            continue
        if cur is None or not row[COL_PRODUCT]:
            continue
        w, g = row[COL_WEIGHT], row[COL_GHG]
        if not isinstance(w, (int, float)) or not isinstance(g, (int, float)):
            continue
        used += 1
        stages = sum(x for x in (row[k] for k in COL_GHG_STAGES) if isinstance(x, (int, float)))
        if abs(stages - g) > 1e-6:
            bad += 1
        cur["n"] += 1
        cur["w"] += w
        cur["ghg"] += w * g
        for k, col in zip(STAGE_KEYS, COL_GHG_STAGES):
            v = row[col]
            if isinstance(v, (int, float)):
                cur["stages"][k] += w * v
        for key, col in (("land", COL_LAND), ("eutr", COL_EUTR), ("water", COL_WATER)):
            v = row[col]
            if isinstance(v, (int, float)):
                cur[key] += w * v
        if row[COL_COUNTRY]:
            cur["countries"].add(row[COL_COUNTRY])
    if bad:
        sys.exit(f"{bad} rows where the GHG total does not equal its stage components")
    products = []
    for gp in groups:
        if abs(gp["w"] - 1.0) > 1e-3:
            sys.exit(f"weights for {gp['product']} sum to {gp['w']:.4f}, not 1.0")
        products.append({
            "num": gp["num"],
            "product": gp["product"],
            "category": slug(gp["product"]),
            "n": gp["n"],
            "countries": len(gp["countries"]),
            "ghgKgCo2ePerKg": round(gp["ghg"], 4),
            "landM2yPerKg": round(gp["land"], 4),
            "eutrKgPo4ePerKg": round(gp["eutr"], 5),
            "waterLPerKg": round(gp["water"], 2),
            "ghgStagesKgCo2ePerKg": {k: round(v, 4) for k, v in gp["stages"].items()},
        })
    out = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "note": "Observation-weighted means per top-level product, computed from the study's own Database sheet and final Weight column. Retail-weight functional unit (per kg or litre of product at retail, losses included). ghgStagesKgCo2ePerKg splits the GHG mean by the study's nine stages (land-use-change burning, land-use-change carbon stock, feed, farm, processing, transport and storage, packaging, retail, loss); the stages sum to the mean. Derived compilation; the raw workbook is not republished.",
        "source": {
            "name": "Poore & Nemecek (2018), Reducing food's environmental impacts through producers and consumers",
            "citation": "Science 360(6392), 987–992",
            "doi": "https://doi.org/10.1126/science.aaq0216",
            "workbook": "Data S2 — Life Cycle Assessment of Food & Drink Products: Meta-Analysis Model v0",
            "observationsUsed": used,
            "products": len(products),
        },
        "products": products,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    print(f"wrote {OUT}: {len(products)} products from {used} observations")


if __name__ == "__main__":
    main()
