/**
 * Type definitions for jira-playwright-a11y
 */

// LLM Provider Types
export type LLMProvider = 'openai' | 'claude';

export interface LLMConfig {
  provider: LLMProvider;
  azureEndpoint: string;
  apiKey: string;
  deployment?: string; // For Azure OpenAI
  model?: string; // For Claude
  temperature?: number;
  maxTokens?: number;
}

// Jira Issue Types
export interface WCAGInfo {
  criterion: string;
  name: string;
}

export interface JiraIssueMetadata {
  difficulty?: string;
  occurrences?: number;
  responsibility?: string;
  abilitiesAffected?: string;
  pages?: number;
  points?: number;
}

export interface ParsedJiraIssue {
  description: string;
  urls: string[];
  wcag: WCAGInfo | null;
  conformanceLevel: string | null;
  difficulty: string | null;
  occurrences: number | null;
  axeRules: string[] | null;
  fullContent: string;
}

export interface TestConfig {
  issue: string | null;
  summary: string;
  description: string;
  urls: string[];
  selectors: string[] | null;
  wcagInfo: WCAGInfo | null;
  conformanceLevel: string | null;
  axeRules: string[] | null;
  metadata: JiraIssueMetadata;
}

// Axe/Accessibility Types
export interface AxeViolationNode {
  html: string;
  target: string[];
  failureSummary?: string;
  impact?: string;
  any?: Array<{ id: string; data: any; relatedNodes?: any[] }>;
  all?: Array<{ id: string; data: any; relatedNodes?: any[] }>;
  none?: Array<{ id: string; data: any; relatedNodes?: any[] }>;
}

export interface AxeViolation {
  id: string;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeViolationNode[];
}

export interface DOMContext {
  element: string; // The violating element HTML
  parent?: string; // Parent element HTML
  ancestors?: string[]; // Array of ancestor elements
  siblings?: string[]; // Sibling elements for context
  cssSelector: string; // Full CSS selector path
  xpath?: string; // XPath to element
  computedStyles?: Record<string, string>; // Relevant computed styles
  contextDepth: number; // How many levels of context were captured
}

export interface ViolationWithContext {
  ruleId: string;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  help: string;
  helpUrl: string;
  wcagTags: string[];
  target: string[]; // CSS selectors
  html: string; // The violating element
  context: DOMContext; // Enhanced context information
  failureSummary?: string;
}

export interface AccessibilityTestSummary {
  totalViolations: number;
  criticalIssues: number;
  seriousIssues: number;
  moderateIssues: number;
  minorIssues: number;
}

export interface AccessibilityTestResult {
  url: string;
  timestamp: string;
  violations: AxeViolation[];
  passes: any[];
  incomplete: any[];
  focusedRules: string[] | null;
  summary: AccessibilityTestSummary;
  screenshot: string | null; // Base64 encoded
  violationsWithContext?: ViolationWithContext[]; // Enhanced violations
}

export interface TestOptions {
  selectors?: string[] | null;
  axeRules?: string[] | null;
  includeScreenshot?: boolean;
  contextDepth?: number; // How many ancestor levels to capture
  includeStyles?: boolean; // Whether to capture computed styles
}

// API Response Types (for VS Code agent integration)
export interface AnalysisResult {
  identifiedRules: string[];
  violations: ViolationWithContext[];
  urls: string[];
  summary: {
    totalUrls: number;
    totalViolations: number;
    criticalIssues: number;
    seriousIssues: number;
    moderateIssues: number;
    minorIssues: number;
  };
  llmUsed: boolean;
  timestamp: string;
}

export interface AnalyzeAccessibilityOptions {
  jiraContent: string;
  useLLM?: boolean;
  contextDepth?: number;
  includeScreenshots?: boolean;
}

// Config Types
export interface Config {
  jira: {
    host?: string;
    email?: string;
    apiToken?: string;
    issueKey?: string;
  };
  test: {
    targetUrl?: string;
    headless: boolean;
    timeout: number;
    includeScreenshots: boolean;
    contextDepth: number;
  };
  mcp: {
    enabled: boolean;
    serverUrl: string;
  };
  axe: {
    rules: string[] | null;
    wcagLevel: string;
    tags: string[];
  };
  llm: {
    enabled: boolean;
    provider: LLMProvider;
    azureOpenAI: {
      endpoint?: string;
      apiKey?: string;
      deployment?: string;
    };
    azureClaude: {
      endpoint?: string;
      apiKey?: string;
      model?: string;
    };
    temperature: number;
    maxTokens: number;
  };
}

// MCP Types
export interface MCPClient {
  request: (params: { method: string; params?: any }) => Promise<any>;
  close: () => Promise<void>;
}
