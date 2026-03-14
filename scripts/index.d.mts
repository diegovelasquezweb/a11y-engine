export interface SeverityTotals {
  Critical: number;
  Serious: number;
  Moderate: number;
  Minor: number;
}

export interface ScoreResult {
  score: number;
  label: string;
  wcagStatus: "Pass" | "Conditional Pass" | "Fail";
}

export interface PersonaGroup {
  label: string;
  count: number;
  icon: string;
}

export function enrichFindings<T extends Record<string, unknown>>(
  findings: T[]
): T[];

export function computeScore(totals: SeverityTotals): ScoreResult;

export function computePersonaGroups(
  findings: Record<string, unknown>[]
): Record<string, PersonaGroup>;

export interface ScanPayload {
  findings: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

export interface ReportOptions {
  baseUrl?: string;
  target?: string;
}

export function generatePDF(
  payload: ScanPayload,
  options?: ReportOptions
): Promise<Buffer>;

export function generateChecklist(
  options?: Pick<ReportOptions, "baseUrl">
): Promise<string>;
