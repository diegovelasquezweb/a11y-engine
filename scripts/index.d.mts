// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface Finding {
  id: string;
  rule_id: string;
  title: string;
  severity: string;
  wcag: string;
  wcag_classification: string | null;
  wcag_criterion_id: string | null;
  category: string | null;
  area: string;
  url: string;
  selector: string;
  primary_selector: string;
  impacted_users: string;
  actual: string;
  expected: string;
  primary_failure_mode: string | null;
  relationship_hint: string | null;
  failure_checks: unknown[];
  related_context: unknown[];
  mdn: string | null;
  fix_description: string | null;
  fix_code: string | null;
  fix_code_lang: string | null;
  recommended_fix: string;
  evidence: unknown[];
  total_instances: number | null;
  effort: string | null;
  related_rules: string[];
  screenshot_path: string | null;
  false_positive_risk: string | null;
  guardrails: Record<string, unknown> | null;
  fix_difficulty_notes: string | string[] | null;
  framework_notes: string | null;
  cms_notes: string | null;
  file_search_pattern: string | null;
  ownership_status: string;
  ownership_reason: string | null;
  primary_source_scope: string[];
  search_strategy: string;
  managed_by_library: string | null;
  component_hint: string | null;
  verification_command: string | null;
  verification_command_fallback: string | null;
  check_data: Record<string, unknown> | null;
  source?: string;
  source_rule_id?: string | null;
  pages_affected?: number | null;
  affected_urls?: string[] | null;
}

export interface EnrichedFinding extends Finding {
  ruleId: string;
  sourceRuleId: string | null;
  fixDescription: string | null;
  fixCode: string | null;
  fixCodeLang: string | null;
  falsePositiveRisk: string | null;
  fixDifficultyNotes: string | string[] | null;
  screenshotPath: string | null;
  wcagCriterionId: string | null;
  impactedUsers: string | null;
}

export interface SeverityTotals {
  Critical: number;
  Serious: number;
  Moderate: number;
  Minor: number;
}

export interface PersonaGroup {
  label: string;
  count: number;
  icon: string;
}

export interface AuditSummary {
  totals: SeverityTotals;
  score: number;
  label: string;
  wcagStatus: "Pass" | "Conditional Pass" | "Fail";
  personaGroups: Record<string, PersonaGroup>;
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface ScanPayload {
  findings: Finding[] | Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

export interface ReportOptions {
  baseUrl?: string;
  target?: string;
}

export interface PDFReport {
  buffer: Buffer;
  contentType: "application/pdf";
}

export interface ChecklistReport {
  html: string;
  contentType: "text/html";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getEnrichedFindings(findings: Finding[]): EnrichedFinding[];
export function getEnrichedFindings(findings: Record<string, unknown>[]): EnrichedFinding[];

export function getAuditSummary(findings: EnrichedFinding[] | Record<string, unknown>[]): AuditSummary;

export function getPDFReport(
  payload: ScanPayload,
  options?: ReportOptions
): Promise<PDFReport>;

export function getChecklist(
  options?: Pick<ReportOptions, "baseUrl">
): Promise<ChecklistReport>;
