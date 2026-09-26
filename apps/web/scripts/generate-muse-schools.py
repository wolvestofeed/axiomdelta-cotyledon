#!/usr/bin/env python3
"""
Impact OS — prospective-customer school dataset generator.

Reads the internal research doc "Austin Charter Schools Analysis" (a .docx with
three CRM-shaped tables: public charters, Tier 1 private/parochial, Tier 2
micro/specialty) and emits a committed, typed JSON compilation the Sales page
consumes. The raw .docx stays in the git-ignored research folder; only this
derived compilation is versioned.

This is the operator's own prospect list (a CRM seed), not a republished public
database. Values are carried through verbatim; nothing is fabricated.

Run:  pnpm muse:schools   (needs python3 + python-docx and the local .docx)
"""

import json
import os
import re
import sys

try:
    import docx  # python-docx
except ImportError:
    sys.exit("python-docx is required: pip install python-docx")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = os.path.join(
    REPO,
    "docs/muse/confidential/Research/Austin Charter Schools Analysis 091126.docx",
)
OUT = os.path.join(
    REPO,
    "apps/web/src/app/(muse)/muse/_data/schools-compiled.json",
)

SEGMENTS = [
    ("charter", "Public Charter"),
    ("private-tier1", "Private — Tier 1"),
    ("private-tier2", "Private — Tier 2 / Micro"),
]

# Header label -> record key.
COLMAP = {
    "Name": "name",
    "Location": "location",
    "Core Theme and Educational Model": "model",
    "Phone": "phone",
    "Email": "email",
    "Website": "website",
    "Point of Contact": "pointOfContact",
    "Date of First Contact": "firstContact",
    "Customer Status": "status",
    "# of Students": "studentsRaw",
    "Grades": "grades",
    "Current Food Program": "foodProgram",
    "Parent-Pay Food Model": "parentPay",
}


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "school"


def parse_students(raw: str):
    """Return an int when the enrollment is a clean number ('654', '1,000+'),
    else None (ranges / non-numeric). The raw string is always preserved."""
    if not raw:
        return None
    digits = re.sub(r"[^0-9]", "", raw.split("-")[0])
    return int(digits) if digits else None


def parse_location(loc: str):
    """Best-effort city/state/zip from '..., Austin, TX 78723'. Raw kept as-is."""
    city = state = zipc = ""
    m = re.search(r",\s*([A-Za-z .]+),\s*([A-Z]{2})(?:\s+(\d{5}))?\s*$", loc or "")
    if m:
        city, state, zipc = m.group(1).strip(), m.group(2), (m.group(3) or "")
    return city, state, zipc


def main():
    if not os.path.exists(SRC):
        sys.exit(f"source doc not found: {SRC}")
    d = docx.Document(SRC)
    if len(d.tables) < 3:
        sys.exit(f"expected 3 tables, found {len(d.tables)}")

    schools = []
    seen = set()
    for ti, tbl in enumerate(d.tables[:3]):
        seg_id, seg_label = SEGMENTS[ti]
        header = [c.text.strip() for c in tbl.rows[0].cells]
        for row in tbl.rows[1:]:
            cells = [c.text.strip() for c in row.cells]
            rec = {}
            for h, v in zip(header, cells):
                key = COLMAP.get(h)
                if key:
                    rec[key] = v
            if not rec.get("name"):
                continue
            base = slugify(rec["name"])
            sid = base
            n = 2
            while sid in seen:
                sid = f"{base}-{n}"
                n += 1
            seen.add(sid)
            city, state, zipc = parse_location(rec.get("location", ""))
            schools.append(
                {
                    "id": sid,
                    "segment": seg_id,
                    "segmentLabel": seg_label,
                    "name": rec["name"],
                    "location": rec.get("location", ""),
                    "city": city,
                    "state": state,
                    "zip": zipc,
                    "model": rec.get("model", ""),
                    "phone": rec.get("phone", ""),
                    "email": rec.get("email", ""),
                    "website": rec.get("website", ""),
                    "pointOfContact": rec.get("pointOfContact", ""),
                    "firstContact": rec.get("firstContact", ""),
                    "status": rec.get("status", ""),
                    "studentsRaw": rec.get("studentsRaw", ""),
                    "students": parse_students(rec.get("studentsRaw", "")),
                    "grades": rec.get("grades", ""),
                    "foodProgram": rec.get("foodProgram", ""),
                    "parentPay": rec.get("parentPay", ""),
                }
            )

    by_segment = {seg: sum(1 for s in schools if s["segment"] == seg) for seg, _ in SEGMENTS}
    by_status = {}
    for s in schools:
        by_status[s["status"]] = by_status.get(s["status"], 0) + 1

    dataset = {
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "note": (
            "Operator prospect list (CRM seed) compiled from the internal "
            "'Austin Charter Schools Analysis' research document. Values carried "
            "through verbatim; nothing fabricated. Customer status, contacts, and "
            "notes are seeded here and become editable once the CRM data store lands."
        ),
        "source": {
            "name": "Austin Charter Schools Analysis (internal research)",
            "description": "Strategic market analysis of the K-12 independent & charter school food-service sector, Austin metro.",
            "dataAsOf": "2026-09-11",
        },
        "counts": {
            "total": len(schools),
            "charter": by_segment["charter"],
            "tier1": by_segment["private-tier1"],
            "tier2": by_segment["private-tier2"],
            "byStatus": by_status,
        },
        "schools": schools,
    }

    with open(OUT, "w") as f:
        json.dump(dataset, f, indent=2)
        f.write("\n")
    print(f"wrote {len(schools)} schools -> {os.path.relpath(OUT, REPO)}")
    print("  by segment:", by_segment)
    print("  by status:", by_status)


if __name__ == "__main__":
    main()
