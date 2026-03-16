



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

export interface EnrichedFinding {
  id: string;
  ruleId: string;
  source: string;
  sourceRuleId: string | null;
  title: string;
  severity: string;
  wcag: string;
  wcagCriterionId: string | null;
  wcagClassification: string | null;
  category: string | null;
  area: string;
  url: string;
  selector: string;
  primarySelector: string;
  impactedUsers: string | null;
  actual: string;
  expected: string;
  primaryFailureMode: string | null;
  relationshipHint: string | null;
  failureChecks: unknown[];
  relatedContext: unknown[];
  mdn: string | null;
  fixDescription: string | null;
  fixCode: string | null;
  fixCodeLang: string | null;
  recommendedFix: string;
  evidence: unknown[];
  totalInstances: number | null;
  effort: string;
  relatedRules: string[];
  screenshotPath: string | null;
  falsePositiveRisk: string | null;
  guardrails: Record<string, unknown> | null;
  fixDifficultyNotes: string | string[] | null;
  frameworkNotes: string | null;
  cmsNotes: string | null;
  fileSearchPattern: string | null;
  ownershipStatus: string;
  ownershipReason: string | null;
  primarySourceScope: string[];
  searchStrategy: string;
  managedByLibrary: string | null;
  componentHint: string | null;
  verificationCommand: string | null;
  verificationCommandFallback: string | null;
  checkData: Record<string, unknown> | null;
  pagesAffected: number | null;
  affectedUrls: string[] | null;
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

export interface DetectedStack {
  framework: string | null;
  cms: string | null;
  uiLibraries: string[];
}

export interface AuditSummary {
  totals: SeverityTotals;
  score: number;
  label: string;
  wcagStatus: "Pass" | "Conditional Pass" | "Fail";
  personaGroups: Record<string, PersonaGroup>;
  quickWins: EnrichedFinding[];
  targetUrl: string;
  detectedStack: DetectedStack;
  totalFindings: number;
}





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

export interface HTMLReport {
  html: string;
  contentType: "text/html";
}

export interface ChecklistReport {
  html: string;
  contentType: "text/html";
}

export interface RemediationGuide {
  markdown: string;
  contentType: "text/markdown";
}

export interface SourcePatternFinding {
  id: string;
  pattern_id: string;
  title: string;
  severity: string;
  wcag: string;
  wcag_criterion: string;
  wcag_level: string;
  type: string;
  fix_description: string | null;
  status: "confirmed" | "potential";
  file: string;
  line: number;
  match: string;
  context: string;
  source: "code-pattern";
}

export interface SourcePatternResult {
  findings: SourcePatternFinding[];
  summary: {
    total: number;
    confirmed: number;
    potential: number;
  };
}

export interface HTMLReportOptions extends ReportOptions {
  screenshotsDir?: string;
}

export interface RemediationOptions extends ReportOptions {
  patternFindings?: Record<string, unknown> | null;
}

export interface SourcePatternOptions {
  framework?: string;
  onlyPattern?: string;
}





export interface ScannerEngineHelp {
  id: "axe" | "cdp" | "pa11y" | string;
  label: string;
  description: string;
  coverage: string;
  speed: "Fast" | "Medium" | "Slow" | string;
  defaultEnabled: boolean;
}

export interface ScannerOptionHelp {
  id: string;
  label: string;
  description: string;
  defaultValue: unknown;
  type: string;
  allowedValues?: unknown[];
}

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface ConceptEntry {
  title: string;
  body: string;
  context?: string;
}

export interface PersonaReferenceItem {
  id: string;
  icon: string;
  label: string;
  description: string;
  keywords: string[];
  mappedRules: string[];
}

export interface PersonaReference {
  locale: string;
  version: string;
  personas: PersonaReferenceItem[];
}

export interface ScannerHelp {
  locale: string;
  version: string;
  title: string;
  engines: ScannerEngineHelp[];
  options: ScannerOptionHelp[];
}

export interface ConformanceLevel {
  id: "A" | "AA" | "AAA";
  label: string;
  tag: string;
  description: string;
  shortDescription: string;
  hint: string;
  tags: string[];
}

export interface WcagPrinciple {
  id: string;
  name: string;
  description: string;
  criterionPrefix: string;
  number: number;
}

export interface SeverityLevel {
  id: "Critical" | "Serious" | "Moderate" | "Minor";
  label: string;
  shortDescription: string;
  description: string;
  order: number;
}

export interface DocArticle {
  id: string;
  title: string;
  icon?: string;
  tag?: string;
  summary: string;
  body: string;
}

export interface DocGroup {
  id: string;
  label: string;
  articles: DocArticle[];
}

export interface DocSection {
  id: string;
  heading: string;
  articles?: DocArticle[];
  groups?: DocGroup[];
}

export interface KnowledgeDocs {
  sections: DocSection[];
}

export interface ConformanceLevelsResult {
  locale: string;
  version: string;
  conformanceLevels: ConformanceLevel[];
}

export interface WcagPrinciplesResult {
  locale: string;
  version: string;
  wcagPrinciples: WcagPrinciple[];
}

export interface SeverityLevelsResult {
  locale: string;
  version: string;
  severityLevels: SeverityLevel[];
}

export interface UiHelp {
  locale: string;
  version: string;
  concepts: Record<string, ConceptEntry>;
  glossary: GlossaryEntry[];
}

export interface EngineKnowledge {
  locale: string;
  version: string;
  scanner: {
    title: string;
    engines: ScannerEngineHelp[];
    options: ScannerOptionHelp[];
  };
  personas: PersonaReferenceItem[];
  concepts: Record<string, ConceptEntry>;
  glossary: GlossaryEntry[];
  docs: KnowledgeDocs;
  conformanceLevels: ConformanceLevel[];
  wcagPrinciples: WcagPrinciple[];
  severityLevels: SeverityLevel[];
}

export interface KnowledgeOptions {
  locale?: string;
}





export interface EngineSelection {
  axe?: boolean;
  cdp?: boolean;
  pa11y?: boolean;
}





export interface RunAuditOptions {
  baseUrl: string;
  maxRoutes?: number;
  crawlDepth?: number;
  routes?: string;
  waitMs?: number;
  timeoutMs?: number;
  headless?: boolean;
  waitUntil?: string;
  colorScheme?: string;
  viewport?: { width: number; height: number };
  axeTags?: string[];
  onlyRule?: string;
  excludeSelectors?: string[];
  ignoreFindings?: string[];
  framework?: string;
  projectDir?: string;
  repoUrl?: string;
  githubToken?: string;
  skipPatterns?: boolean;
  screenshotsDir?: string;
  engines?: EngineSelection;
  ai?: AiOptions;
  onProgress?: (step: string, status: string, extra?: Record<string, unknown>) => void;
}



export interface EnrichmentOptions {
  screenshotUrlBuilder?: (rawPath: string) => string;
}





export function runAudit(options: RunAuditOptions): Promise<ScanPayload>;

export function getFindings(
  input: ScanPayload,
  options?: EnrichmentOptions
): EnrichedFinding[];

export function getOverview(
  findings: EnrichedFinding[],
  payload?: ScanPayload | null
): AuditSummary;

export function getPDFReport(
  payload: ScanPayload,
  options?: ReportOptions
): Promise<PDFReport>;

export function getChecklist(
  options?: Pick<ReportOptions, "baseUrl">
): Promise<ChecklistReport>;

export function getHTMLReport(
  payload: ScanPayload,
  options?: HTMLReportOptions
): Promise<HTMLReport>;

export function getRemediationGuide(
  payload: ScanPayload & { incomplete_findings?: unknown[] },
  options?: RemediationOptions
): Promise<RemediationGuide>;

export function getSourcePatterns(
  projectDir: string,
  options?: SourcePatternOptions
): Promise<SourcePatternResult>;

export function getScannerHelp(options?: KnowledgeOptions): ScannerHelp;

export function getPersonaReference(options?: KnowledgeOptions): PersonaReference;

export function getUiHelp(options?: KnowledgeOptions): UiHelp;

export function getConformanceLevels(options?: KnowledgeOptions): ConformanceLevelsResult;

export function getWcagPrinciples(options?: KnowledgeOptions): WcagPrinciplesResult;

export function getSeverityLevels(options?: KnowledgeOptions): SeverityLevelsResult;

export function getKnowledge(options?: KnowledgeOptions): EngineKnowledge;

export const DEFAULT_AI_SYSTEM_PROMPT: string;

export interface ViewportPreset {
  label: string;
  width: number;
  height: number;
}

export const VIEWPORT_PRESETS: ViewportPreset[];

export interface AiOptions {
  enabled?: boolean;
  apiKey?: string;
  githubToken?: string;
  model?: string;
  systemPrompt?: string;
}
