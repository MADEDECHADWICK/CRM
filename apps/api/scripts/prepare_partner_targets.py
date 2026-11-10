"""Prepare assignment identities from Firm Pool; never execute workbook content."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
from prepare_company_data import clean, read_workbook, source_key


def prepare(path, allocations):
    pool = read_workbook(path)["Firm Pool"]
    header = next(n for n, row in pool if clean(row.get("A")) == "Client name")
    known = {(a["sourcePartner"], a["country"]) for a in allocations}
    if len(known) != len(allocations):
        raise ValueError("Ambiguous source Partner mapping")
    records, excluded = [], []
    for row_number, row in pool:
        if row_number <= header or not clean(row.get("A")):
            continue
        name, country, lead = clean(row["A"]), clean(row.get("C")), clean(row.get("D"))
        record = {"row": row_number, "name": name, "country": country, "sourcePartner": lead,
                  "sourceKey": source_key("prospect", name, country)}
        (records if (lead, country) in known else excluded).append(record)
    if len({r["sourceKey"] for r in records + excluded}) != len(records + excluded):
        raise ValueError("Duplicate Firm Pool identities; reconcile the workbook first")
    return {"version": 1, "workbook": str(path.resolve()),
            "workbookSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "sheet": "Firm Pool", "allocations": allocations, "records": records,
            "excluded": excluded, "sourceRows": len(records) + len(excluded)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, required=True)
    parser.add_argument("--allocations", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.workbook, json.loads(args.allocations.read_text(encoding="utf-8")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"sourceRows": result["sourceRows"], "eligible": len(result["records"]),
                      "excluded": len(result["excluded"]),
                      "bySourcePartner": dict(Counter(r["sourcePartner"] for r in result["records"]))}, indent=2))
