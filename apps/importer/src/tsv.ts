import { isTrademarkClass, validateReading } from "@app/trademark";

/** 取り込み用 TSV の読み取りと検証（contracts/jobs-and-cli.md §3）。 */

export type ImportStatus = "pending" | "registered" | "dead";

export interface ImportRow {
  applicationNumber: string;
  registrationNumber: string | null;
  markText: string;
  readings: string[];
  holderName: string;
  classes: number[];
  status: ImportStatus;
}

export interface ImportError {
  line: number;
  message: string;
}

const REQUIRED = ["application_number", "mark_text", "holder_name", "classes", "status"] as const;
const STATUSES = new Set<string>(["pending", "registered", "dead"]);

export function parseImportTsv(content: string): { rows: ImportRow[]; errors: ImportError[] } {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  const header = (lines[0] ?? "").split("\t").map((h) => h.trim());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length > 0) return { rows: [], errors: [{ line: 1, message: `必須の列がない: ${missing.join(", ")}` }] };
  const col = (cells: string[], name: string) => {
    const i = header.indexOf(name);
    return i < 0 ? "" : (cells[i] ?? "").trim();
  };

  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  lines.slice(1).forEach((raw, index) => {
    const line = index + 2;
    if (raw.trim() === "") return;
    const cells = raw.split("\t");
    const status = col(cells, "status");
    const applicationNumber = col(cells, "application_number");
    const markText = col(cells, "mark_text");
    const holderName = col(cells, "holder_name");
    if (!applicationNumber || !markText || !holderName) {
      errors.push({ line, message: "application_number、mark_text、holder_name は必須である" });
      return;
    }
    if (!STATUSES.has(status)) {
      errors.push({ line, message: `status が不正である: ${status}` });
      return;
    }
    const classText = col(cells, "classes");
    const classes = classText === "" ? [] : classText.split(",").map((c) => Number(c.trim()));
    if (classes.some((c) => !isTrademarkClass(c)) || (status !== "dead" && classes.length === 0)) {
      errors.push({ line, message: `classes が不正である: ${classText}` });
      return;
    }
    const readings: string[] = [];
    for (const r of col(cells, "readings").split(";")) {
      if (r.trim() === "") continue;
      const v = validateReading(r);
      if (!v.ok) {
        errors.push({ line, message: `readings が不正である: ${r}` });
        return;
      }
      if (!readings.includes(v.reading)) readings.push(v.reading);
    }
    rows.push({
      applicationNumber,
      registrationNumber: col(cells, "registration_number") || null,
      markText,
      readings,
      holderName,
      classes: [...new Set(classes)].sort((a, b) => a - b),
      status: status as ImportStatus,
    });
  });
  return { rows, errors };
}
