/**
 * Programmatic API for VS Code Chat Agent Integration
 * This module provides functions that can be called by external agents
 */

import { writeFileSync } from 'fs';
import { parseJiraMarkdown, formatForTesting } from './jiraParser.js';
import { runAccessibilityTest } from './a11yTester.js';
import { config } from './config.js';
import type {
  AnalysisResult,
  AnalyzeAccessibilityOptions,
  LLMConfig,
  ViolationWithContext,
  AccessibilityTestResult
} from './types.js';

/**
 * Main API function for analyzing accessibility issues from Jira content
 * This is the primary function that VS Code chat agents should call
 *
 * @param options - Configuration options for the analysis
 * @returns Structured results with violations and context for code remediation
 */
export async function analyzeAccessibility(
  options: AnalyzeAccessibilityOptions
): Promise<AnalysisResult> {
  const {
    jiraContent,
    useLLM = config.llm.enabled,
    contextDepth = config.test.contextDepth,
    includeScreenshots = config.test.includeScreenshots
  } = options;

  // Prepare LLM config if enabled
  let llmConfig: LLMConfig | undefined;
  if (useLLM) {
    if (config.llm.provider === 'openai') {
      llmConfig = {
        provider: 'openai',
        azureEndpoint: config.llm.azureOpenAI.endpoint || '',
        apiKey: config.llm.azureOpenAI.apiKey || '',
        deployment: config.llm.azureOpenAI.deployment,
        temperature: config.llm.temperature,
        maxTokens: config.llm.maxTokens
      };
    } else if (config.llm.provider === 'claude') {
      llmConfig = {
        provider: 'claude',
        azureEndpoint: config.llm.azureClaude.endpoint || '',
        apiKey: config.llm.azureClaude.apiKey || '',
        model: config.llm.azureClaude.model,
        temperature: config.llm.temperature,
        maxTokens: config.llm.maxTokens
      };
    }
  }

  // Step 1: Parse Jira content and identify rules using LLM
  // Write content to a temp file for parsing
  const tempFilePath = `/tmp/jira-content-${Date.now()}.md`;
  writeFileSync(tempFilePath, jiraContent);

  const parsedData = await parseJiraMarkdown(tempFilePath, llmConfig);
  const testConfig = formatForTesting(parsedData);

  console.log(`✓ Identified ${parsedData.axeRules?.length || 0} accessibility rule(s)${parsedData.llmUsed ? ' (via LLM)' : ''}`);
  if (parsedData.axeRules) {
    console.log(`  Rules: ${parsedData.axeRules.join(', ')}`);
  }

  // Step 2: Run accessibility tests on all URLs
  const allViolations: ViolationWithContext[] = [];
  const allResults: AccessibilityTestResult[] = [];

  for (const url of testConfig.urls) {
    console.log(`\n🔍 Testing: ${url}`);

    const result = await runAccessibilityTest(url, {
      selectors: testConfig.selectors,
      axeRules: testConfig.axeRules,
      includeScreenshot: includeScreenshots,
      contextDepth
    });

    allResults.push(result);

    // Collect violations with context
    if (result.violationsWithContext) {
      allViolations.push(...result.violationsWithContext);
    }

    console.log(`  Found ${result.summary.totalViolations} violation(s)`);
  }

  // Step 3: Aggregate results
  const summary = {
    totalUrls: testConfig.urls.length,
    totalViolations: allResults.reduce((sum, r) => sum + r.summary.totalViolations, 0),
    criticalIssues: allResults.reduce((sum, r) => sum + r.summary.criticalIssues, 0),
    seriousIssues: allResults.reduce((sum, r) => sum + r.summary.seriousIssues, 0),
    moderateIssues: allResults.reduce((sum, r) => sum + r.summary.moderateIssues, 0),
    minorIssues: allResults.reduce((sum, r) => sum + r.summary.minorIssues, 0)
  };

  // Return structured results for the chat agent
  return {
    identifiedRules: parsedData.axeRules || [],
    violations: allViolations,
    urls: testConfig.urls,
    summary,
    llmUsed: parsedData.llmUsed,
    timestamp: new Date().toISOString()
  };
}

/**
 * Formats analysis results as a human-readable report
 * Useful for displaying results in chat interfaces
 */
export function formatAnalysisReport(result: AnalysisResult): string {
  let report = '# Accessibility Analysis Report\n\n';

  report += `**Timestamp:** ${result.timestamp}\n`;
  report += `**LLM Used:** ${result.llmUsed ? 'Yes' : 'No'}\n\n`;

  // Summary
  report += '## Summary\n\n';
  report += `- **Total URLs Tested:** ${result.summary.totalUrls}\n`;
  report += `- **Total Violations:** ${result.summary.totalViolations}\n`;
  report += `- **Critical Issues:** ${result.summary.criticalIssues}\n`;
  report += `- **Serious Issues:** ${result.summary.seriousIssues}\n`;
  report += `- **Moderate Issues:** ${result.summary.moderateIssues}\n`;
  report += `- **Minor Issues:** ${result.summary.minorIssues}\n\n`;

  // Identified Rules
  if (result.identifiedRules.length > 0) {
    report += '## Identified Accessibility Rules\n\n';
    result.identifiedRules.forEach(rule => {
      report += `- \`${rule}\`\n`;
    });
    report += '\n';
  }

  // Violations with Context
  if (result.violations.length > 0) {
    report += '## Violations with Context\n\n';
    result.violations.forEach((violation, index) => {
      report += `### ${index + 1}. ${violation.ruleId} [${violation.impact?.toUpperCase()}]\n\n`;
      report += `**Description:** ${violation.description}\n\n`;
      report += `**Help:** ${violation.help}\n\n`;
      report += `**WCAG:** ${violation.wcagTags.join(', ')}\n\n`;
      report += `**CSS Selector:** \`${violation.context.cssSelector}\`\n\n`;

      if (violation.context.xpath) {
        report += `**XPath:** \`${violation.context.xpath}\`\n\n`;
      }

      report += '**Violating Element:**\n\n';
      report += '```html\n';
      report += violation.html.substring(0, 500);
      if (violation.html.length > 500) {
        report += '\n... (truncated)';
      }
      report += '\n```\n\n';

      if (violation.context.parent) {
        report += '**Parent Element:**\n\n';
        report += '```html\n';
        report += violation.context.parent.substring(0, 300);
        if (violation.context.parent.length > 300) {
          report += '\n... (truncated)';
        }
        report += '\n```\n\n';
      }

      report += `**More Info:** ${violation.helpUrl}\n\n`;
      report += '---\n\n';
    });
  }

  return report;
}

/**
 * Export configuration for external use
 */
export { config };

/**
 * Export all types for TypeScript consumers
 */
export * from './types.js';
