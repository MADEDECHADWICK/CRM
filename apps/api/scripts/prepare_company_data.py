"""Read the supplied company workbooks without executing formulas or macros.

Only Firm Pool is an account source. Partner tabs enrich its pursuit order;
country/industry/coverage tabs are alternate views, not additional accounts.
Outputs contain private contact data and must stay outside version control.
"""
import argparse
from collections import Counter, defaultdict
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def key(*parts):
    return "|".join(clean(part).casefold() for part in parts)


def source_key(kind, *parts):
    return "company-2026:" + kind + ":" + hashlib.sha256(key(*parts).encode()).hexdigest()[:32]


def read_workbook(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(t.text or "" for t in si.findall(".//s:t", NS))
                       for si in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        relationships = {r.attrib["Id"]: r.attrib["Target"] for r in
                         ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        sheets = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).findall("s:sheets/s:sheet", NS):
            target = relationships[sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]]
            target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            rows = []
            for row in ET.fromstring(archive.read(target)).findall("s:sheetData/s:row", NS):
                values = {}
                for cell in row.findall("s:c", NS):
                    value = cell.find("s:v", NS)
                    text = value.text if value is not None and value.text else ""
                    if cell.attrib.get("t") == "s":
                        text = strings[int(text)] if text else ""
                    elif cell.attrib.get("t") == "inlineStr":
                        text = "".join(t.text or "" for t in cell.findall(".//s:t", NS))
                    if text:
                        values[re.sub(r"\d", "", cell.attrib["r"])] = text
                if values:
                    rows.append((int(row.attrib["r"]), values))
            sheets[sheet.attrib["name"]] = rows
        return sheets


def ref(path, sheet, row, values):
    return {"file": path.name, "sheet": sheet, "row": row, "values": values}


def extract(prospect_path, customer_path):
    prospects = read_workbook(prospect_path)
    customers = read_workbook(customer_path)
    if "Firm Pool" not in prospects:
        raise ValueError("Prospect workbook must contain Firm Pool; refusing to import alternate views.")
    pool = prospects["Firm Pool"]
    header = next((n for n, row in pool if clean(row.get("A")) == "Client name"), None)
    if header is None:
        raise ValueError("Firm Pool has no Client name header.")
    orders = defaultdict(list)
    for sheet, rows in prospects.items():
        if not rows or not clean(rows[0][1].get("A")).startswith("PARTNER PURSUITS"):
            continue
        for number, row in rows:
            if number > 3 and row.get("A") and row.get("C"):
                orders[key(row["A"], row["C"], row.get("D"))].append((row.get("E"), ref(prospect_path, sheet, number, row)))

    accounts = {}
    issues = []
    prospect_rows = 0
    for number, row in pool:
        if number <= header or not clean(row.get("A")):
            continue
        prospect_rows += 1
        name, country = clean(row["A"]), clean(row.get("C"))
        if not country:
            raise ValueError(f"Firm Pool row {number}: missing country.")
        identity = source_key("prospect", name, country)
        matches = orders.get(key(name, country, row.get("D")), [])
        amount = str(Decimal(row["G"])) if clean(row.get("G")) else None
        metadata = {"kind": "PROSPECT", "partnerLead": clean(row.get("D")),
                    "recommendedOffer": clean(row.get("F")), "planningFeeKES": amount,
                    "pursuitOrder": clean(matches[0][0]) if matches else clean(row.get("E")),
                    "sources": [ref(prospect_path, "Firm Pool", number, row)] + [r for _, r in matches]}
        if identity in accounts:
            accounts[identity]["sourceData"]["sources"].extend(metadata["sources"])
            issues.append({"kind": "duplicate_prospect", "row": number, "name": name, "country": country})
            continue
        accounts[identity] = {"sourceKey": identity, "name": name, "country": country,
                              "industry": clean(row.get("B")) or None, "isExistingClient": False,
                              "sourceData": metadata, "contacts": []}

    expected = next((int(Decimal(row["B"])) for _, row in pool if row.get("A") == "Accounts"), None)
    if expected is not None and expected != prospect_rows:
        raise ValueError(f"Firm Pool control total {expected} differs from {prospect_rows} account rows.")

    customer_rows = 0
    by_sheet = {}
    for sheet, rows in customers.items():
        header_row = next(((n, row) for n, row in rows if any(clean(v).upper() == "CUSTOMER NAME" for v in row.values())), None)
        if header_row is None:
            raise ValueError(f"Customer sheet {sheet!r} has no CUSTOMER NAME header.")
        header_number, headers = header_row
        name_col = next(c for c, value in headers.items() if clean(value).upper() == "CUSTOMER NAME")
        def columns(*names):
            return [c for c, value in headers.items() if clean(value).upper() in names]
        def first(row, cols):
            return next((clean(row.get(c)) for c in cols if clean(row.get(c))), "")
        sheet_count = 0
        for number, row in rows:
            if number <= header_number or not clean(row.get(name_col)):
                continue
            name = clean(row[name_col])
            location = first(row, columns("LOCATION"))
            identity = source_key("customer", name, location)
            customer_rows += 1
            sheet_count += 1
            emails = list(dict.fromkeys(clean(row.get(c)).lower() for c in columns("EMAIL") if clean(row.get(c))))
            valid_emails = [e for e in emails if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", e)]
            if len(valid_emails) != len(emails):
                issues.append({"kind": "invalid_email_preserved_in_source", "sheet": sheet, "row": number})
            phone = first(row, columns("CONTACT")) or None
            # Keep leading zeros and multi-number cells exactly as supplied.
            # Numeric cells with missing zeros are flagged, never guessed.
            if phone and re.fullmatch(r"\d{9}", phone):
                issues.append({"kind": "phone_missing_possible_leading_zero", "sheet": sheet, "row": number})
            # NYANZA has an extra ACTIVE header; its data lives in that column.
            status = first(row, columns("STATUS", "ACTIVE"))
            market = first(row, columns("MARKET"))
            if not market or market not in ("GT", "MT"):
                market = clean(row.get("C")) if "C" not in headers else ""
            metadata = {"kind": "CUSTOMER", "region": sheet.strip(), "location": location,
                        "marketSegment": market, "paymentTerms": first(row, columns("PAYMENT TERMS", "TERMS OF PAYMENT", "TERMS")),
                        "customerStatus": status,
                        "sources": [ref(customer_path, sheet, number, row)]}
            if identity not in accounts:
                accounts[identity] = {"sourceKey": identity, "name": name, "country": None,
                                      "address": location or None, "email": valid_emails[0] if valid_emails else None,
                                      "phone": phone, "isExistingClient": True,
                                      "sourceData": metadata, "contacts": []}
            else:
                accounts[identity]["sourceData"]["sources"].extend(metadata["sources"])
                issues.append({"kind": "duplicate_customer_branch", "sheet": sheet, "row": number, "name": name, "location": location})
            person = first(row, columns("CONTACT PERSON"))
            if person:
                contact = {"name": person, "email": valid_emails[0] if valid_emails else None, "phone": phone}
                if contact not in accounts[identity]["contacts"]:
                    accounts[identity]["contacts"].append(contact)
        by_sheet[sheet] = sheet_count

    records = list(accounts.values())
    prospect_names = {key(a["name"]) for a in records if not a["isExistingClient"]}
    overlaps = sorted({a["name"] for a in records if a["isExistingClient"] and key(a["name"]) in prospect_names})
    summary = {"prospectRows": prospect_rows, "customerRows": customer_rows,
               "prospectAccounts": sum(not a["isExistingClient"] for a in records),
               "customerBranches": sum(a["isExistingClient"] for a in records),
               "namedContacts": sum(len(a["contacts"]) for a in records),
               "customerSheets": by_sheet, "issuesByKind": dict(Counter(i["kind"] for i in issues)),
               "crossFileNameMatchesForReview": overlaps}
    return {"version": 1, "summary": summary, "accounts": records, "issues": issues}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prospects", type=Path, required=True)
    parser.add_argument("--customers", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = extract(args.prospects, args.customers)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data["summary"], indent=2))


if __name__ == "__main__":
    main()
