import type { Response } from "express";

export function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sendCsv(
  res: Response,
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const body = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
  res.send(`\uFEFF${body}`);
}

export function sendWord(
  res: Response,
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${c == null ? "" : String(c)}</td>`).join("")}</tr>`)
    .join("");
  const html =
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>` +
    `<head><meta charset='utf-8'><title>${title}</title></head><body>` +
    `<h2>${title}</h2>` +
    `<table border='1' cellspacing='0' cellpadding='6'><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `</body></html>`;
  res.setHeader("Content-Type", "application/msword");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.doc"`);
  res.send(html);
}
