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

export interface EngineAssets {
  intelligence: Record<string, unknown>;
  pa11yConfig: Record<string, unknown>;
  complianceConfig: Record<string, unknown>;
  wcagReference: Record<string, unknown>;
}

export function getAssets(): EngineAssets;

export function mapPa11yRuleToCanonical(
  ruleId: string,
  sourceRuleId?: string | null,
  checkData?: Record<string, unknown> | null
): string;

export function enrichFindings<T extends Record<string, unknown>>(
  findings: T[]
): T[];

export function computeScore(totals: SeverityTotals): ScoreResult;

export function computePersonaGroups(
  findings: Record<string, unknown>[]
): Record<string, PersonaGroup>;
