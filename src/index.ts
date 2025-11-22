#!/usr/bin/env node

import dotenv from 'dotenv';
import { getJiraIssue, parseIssueForTests } from './jiraClient.js';
import { parseJiraMarkdown, formatForTesting } from './jiraParser.js';
import { runAccessibilityTest, formatViolations, formatViolationsWithContext } from './a11yTester.js';
import { createMCPClient, closeMCPClient, listMCPTools } from './mcpClient.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from './config.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { TestConfig, AccessibilityTestResult, LLMConfig } from './types.js';

dotenv.config();

/**
 * Main workflow: Fetch Jira issue, run accessibility tests, and report results
 */
async function main() {
  console.log('🚀 Jira + Playwright + Axe Accessibility Tester\n');

  const issueKey = process.env.JIRA_ISSUE_KEY;
  const targetUrl = process.env.TARGET_URL;
  const jiraFilePath = process.env.JIRA_FILE_PATH;
  const useMCP = process.env.USE_MCP === 'true';

  if (!issueKey && !targetUrl && !jiraFilePath) {
    console.error('❌ Error: Please provide either JIRA_ISSUE_KEY, TARGET_URL, or JIRA_FILE_PATH in .env file');
    process.exit(1);
  }

  let mcpClient: Client | null = null;

  try {
    // Step 1: Initialize MCP if enabled
    if (useMCP) {
      console.log('📡 Initializing MCP Playwright server...');
      mcpClient = await createMCPClient();

      const tools = await listMCPTools(mcpClient);
      console.log(`Available MCP tools: ${tools.map(t => t.name).join(', ')}\n`);
    }

    // Step 2: Fetch Jira issue or parse local file
    let testConfig: TestConfig = {
      urls: targetUrl ? [targetUrl] : [],
      selectors: null,
      issue: null,
      summary: 'Manual test',
      description: '',
      wcagInfo: null,
      conformanceLevel: null,
      axeRules: null,
      metadata: {}
    };

    let llmUsed = false;

    if (jiraFilePath) {
      // Parse local Jira markdown file
      console.log(`📄 Parsing local Jira file: ${jiraFilePath}`);

      if (!existsSync(jiraFilePath)) {
        console.error(`❌ Error: File not found: ${jiraFilePath}`);
        process.exit(1);
      }

      // Prepare LLM config if enabled
      let llmConfig: LLMConfig | undefined;
      if (config.llm.enabled) {
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

      const parsedData = await parseJiraMarkdown(jiraFilePath, llmConfig);
      testConfig = formatForTesting(parsedData);
      llmUsed = parsedData.llmUsed;

      console.log(`✓ Issue: ${testConfig.summary}`);
      if (testConfig.wcagInfo) {
        console.log(`   WCAG: ${testConfig.wcagInfo.criterion} - ${testConfig.wcagInfo.name}`);
      }
      if (testConfig.conformanceLevel) {
        console.log(`   Conformance: Level ${testConfig.conformanceLevel}`);
      }
      console.log(`✓ Parsed ${testConfig.urls.length} URL(s) from file`);
      if (testConfig.axeRules) {
        console.log(`✓ Identified specific accessibility rules${llmUsed ? ' (via LLM)' : ''}: ${testConfig.axeRules.join(', ')}`);
      }
      if (testConfig.selectors) {
        console.log(`✓ Found selectors: ${testConfig.selectors.join(', ')}`);
      }
    } else if (issueKey) {
      // Fetch from Jira API
      console.log(`📋 Fetching Jira issue: ${issueKey}`);
      const issue = await getJiraIssue(issueKey);
      console.log(`✓ Issue: ${issue.summary}`);
      console.log(`   Status: ${issue.status}`);

      testConfig = parseIssueForTests(issue) as unknown as TestConfig;
      console.log(`✓ Parsed ${testConfig.urls.length} URL(s) from issue`);
      if (testConfig.selectors) {
        console.log(`✓ Found selectors: ${testConfig.selectors.join(', ')}`);
      }
    }

    // Step 3: Run accessibility tests on each URL
    const allResults: AccessibilityTestResult[] = [];

    for (const url of testConfig.urls) {
      const result = await runAccessibilityTest(url, {
        selectors: testConfig.selectors,
        axeRules: testConfig.axeRules,
        includeScreenshot: config.test.includeScreenshots,
        contextDepth: config.test.contextDepth
      });

      allResults.push(result);

      // Display results
      console.log('\n' + '='.repeat(80));
      console.log(`📊 Results for ${url}`);
      console.log('='.repeat(80));
      console.log(`Total Violations: ${result.summary.totalViolations}`);
      console.log(`  Critical: ${result.summary.criticalIssues}`);
      console.log(`  Serious: ${result.summary.seriousIssues}`);
      console.log(`  Moderate: ${result.summary.moderateIssues}`);
      console.log(`  Minor: ${result.summary.minorIssues}`);

      // Show violations with context if available
      if (result.violationsWithContext && result.violationsWithContext.length > 0) {
        console.log(formatViolationsWithContext(result.violationsWithContext));
      } else {
        console.log(formatViolations(result.violations));
      }
    }

    // Step 4: Save results to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFilename = `a11y-report-${testConfig.issue || 'manual'}-${timestamp}.json`;
    const reportPath = join(process.cwd(), 'test-results', reportFilename);

    // Create test-results directory if it doesn't exist
    try {
      mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
    } catch (err) {
      // Directory already exists
    }

    const report = {
      testConfig,
      timestamp: new Date().toISOString(),
      llmUsed,
      results: allResults,
      summary: {
        totalUrls: testConfig.urls.length,
        totalViolations: allResults.reduce((sum, r) => sum + r.summary.totalViolations, 0),
        criticalIssues: allResults.reduce((sum, r) => sum + r.summary.criticalIssues, 0),
        seriousIssues: allResults.reduce((sum, r) => sum + r.summary.seriousIssues, 0),
        moderateIssues: allResults.reduce((sum, r) => sum + r.summary.moderateIssues, 0),
        minorIssues: allResults.reduce((sum, r) => sum + r.summary.minorIssues, 0)
      }
    };

    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);

    // Step 5: Summary
    console.log('\n' + '='.repeat(80));
    console.log('🎯 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total URLs tested: ${report.summary.totalUrls}`);
    console.log(`Total violations: ${report.summary.totalViolations}`);
    console.log(`  Critical: ${report.summary.criticalIssues}`);
    console.log(`  Serious: ${report.summary.seriousIssues}`);
    console.log(`  Moderate: ${report.summary.moderateIssues}`);
    console.log(`  Minor: ${report.summary.minorIssues}`);
    if (llmUsed) {
      console.log(`\n🤖 LLM was used to identify accessibility rules`);
    }

    if (report.summary.totalViolations === 0) {
      console.log('\n✅ All tests passed! No accessibility issues found.');
    } else {
      console.log('\n⚠️  Accessibility issues detected. Please review the report.');
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('\n❌ Error:', errorMessage);
    console.error(errorStack);
    process.exit(1);
  } finally {
    // Cleanup
    if (mcpClient) {
      await closeMCPClient(mcpClient);
    }
  }
}

// Run the main function
main();
