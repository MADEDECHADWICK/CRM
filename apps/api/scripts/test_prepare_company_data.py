import tempfile
import unittest
from pathlib import Path
import zipfile

from prepare_company_data import extract, read_workbook, source_key


def workbook(path, sheets):
    from xml.sax.saxutils import escape
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + "".join(
            f'<sheet name="{escape(name)}" sheetId="{index}" r:id="r{index}"/>' for index, name in enumerate(sheets, 1)) + '</sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships>' + "".join(
            f'<Relationship Id="r{index}" Target="worksheets/sheet{index}.xml"/>' for index in range(1, len(sheets) + 1)) + '</Relationships>')
        for index, rows in enumerate(sheets.values(), 1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(
                f'<row r="{number}">' + "".join(f'<c r="{col}{number}" t="inlineStr"><is><t>{escape(value)}</t></is></c>' for col, value in row.items()) + '</row>'
                for number, row in rows) + '</sheetData></worksheet>')


class ImportTests(unittest.TestCase):
    def prepare(self, customer_rows=None, total="1"):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        prospect_path, customer_path = Path(folder.name) / "prospects.xlsx", Path(folder.name) / "customers.xlsx"
        prospect = {"A": "Target Ltd", "B": "Finance", "C": "Kenya", "D": "Partner One", "F": "Advisory", "G": "4000000.0"}
        workbook(prospect_path, {
            "Firm Pool": [(1, {"A": "POOL"}), (2, {"A": "Accounts", "B": total}), (3, {"A": "Client name"}), (4, prospect)],
            "Partner One": [(1, {"A": "PARTNER PURSUITS | PARTNER ONE"}), (3, {"A": "Client name"}), (4, {**prospect, "E": "01 Flagship"})],
            "Country View": [(1, {"A": "COUNTRY VIEW"}), (4, prospect)],
        })
        workbook(customer_path, {"REGION": [(1, {"A": "CUSTOMERS"}), (2, {"B": "CUSTOMER NAME", "D": "LOCATION", "E": "CONTACT PERSON", "F": "CONTACT", "G": "EMAIL", "I": "TERMS OF PAYMENT", "K": "ACTIVE", "L": "EMAIL"})] + (customer_rows or [
            (3, {"B": "Branch Shop", "D": "Town A", "E": "Contact One", "F": "0712345678", "G": "hello@example.com", "L": "hello@example.com", "I": "30 DAYS CREDIT", "K": "ACTIVE"}),
            (4, {"B": "Branch Shop", "D": "Town B", "F": "712345679"}),
        ])})
        return prospect_path, customer_path

    def test_imports_master_once_and_enriches_partner_view(self):
        result = extract(*self.prepare())
        self.assertEqual(result["summary"]["prospectAccounts"], 1)
        target = result["accounts"][0]
        self.assertEqual(target["sourceData"]["pursuitOrder"], "01 Flagship")
        self.assertEqual(target["sourceData"]["planningFeeKES"], "4000000.0")
        self.assertEqual(len(target["sourceData"]["sources"]), 2)

    def test_preserves_branches_leading_zero_and_duplicate_email_headers(self):
        result = extract(*self.prepare())
        branches = result["accounts"][1:]
        self.assertEqual(len(branches), 2)
        self.assertNotEqual(branches[0]["sourceKey"], branches[1]["sourceKey"])
        self.assertEqual(branches[0]["phone"], "0712345678")
        self.assertEqual(branches[0]["contacts"][0]["email"], "hello@example.com")
        self.assertEqual(branches[0]["sourceData"]["customerStatus"], "ACTIVE")
        self.assertIsNone(branches[0]["country"])

    def test_flags_uncertain_phone_without_guessing(self):
        result = extract(*self.prepare())
        self.assertEqual(result["accounts"][2]["phone"], "712345679")
        self.assertEqual(result["summary"]["issuesByKind"]["phone_missing_possible_leading_zero"], 1)

    def test_invalid_email_retained_in_raw_source(self):
        result = extract(*self.prepare([(3, {"B": "Shop", "D": "Town", "G": "not-an-email"})]))
        account = result["accounts"][1]
        self.assertIsNone(account["email"])
        self.assertEqual(account["sourceData"]["sources"][0]["values"]["G"], "not-an-email")

    def test_control_total_mismatch_stops_preparation(self):
        with self.assertRaisesRegex(ValueError, "control total"):
            extract(*self.prepare(total="2"))

    def test_identity_ignores_case_and_whitespace_but_keeps_branches(self):
        self.assertEqual(source_key("customer", " Shop ", "Town A"), source_key("customer", "shop", "town a"))
        self.assertNotEqual(source_key("customer", "Shop", "Town A"), source_key("customer", "Shop", "Town B"))


if __name__ == "__main__":
    unittest.main()
