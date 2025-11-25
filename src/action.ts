#!/usr/bin/env node

/**
 * GitHub Action: Website Accessibility Scanner
 * Crawls a website, runs accessibility tests, groups violations, and creates GitHub issues
 */

import { crawlWebsite, type CrawlOptions } from './crawler.js';
import { runAccessibilityTest } from './a11yTester.js';
import { groupViolations } from './violationGrouper.js';
import { GitHubIssueManager } from './githubIssues.js';
import type { ViolationWithContext } from './types.js';

interface ActionConfig {
  // Website to scan
  websiteUrl: string;

  // Crawl settings
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];

  // GitHub settings
  githubToken: string;
  githubOwner: string;
  githubRepo: string;

  // Test settings
  contextDepth?: number;
}

/**
 * Main action entry point
 */
export async function runAction(config: ActionConfig): Promise<void> {
  console.log('🚀 Starting Accessibility Scanner GitHub Action\n');
  console.log(`Website: ${config.websiteUrl}`);
  console.log(`Repository: ${config.githubOwner}/${config.githubRepo}\n`);

  try {
    // Step 1: Crawl the website
    console.log('📡 Step 1: Crawling website...');
    const crawlOptions: CrawlOptions = {
      baseUrl: config.websiteUrl,
      maxPages: config.maxPages || 50,
      maxDepth: config.maxDepth || 3,
      includePatterns: config.includePatterns,
      excludePatterns: config.excludePatterns,
      respectRobotsTxt: true
    };

    const pages = await crawlWebsite(crawlOptions);
    console.log(`✅ Found ${pages.length} pages\n`);

    if (pages.length === 0) {
      console.log('⚠️  No pages found. Exiting.');
      return;
    }

    // Step 2: Run accessibility tests on all pages
    console.log('🔍 Step 2: Running accessibility tests...');
    const violationsByPage = new Map<string, ViolationWithContext[]>();
    let totalViolations = 0;

    for (const page of pages) {
      console.log(`Testing: ${page.url}`);

      try {
        const result = await runAccessibilityTest(page.url, {
          contextDepth: config.contextDepth || 3,
          includeScreenshot: false
        });

        if (result.violationsWithContext && result.violationsWithContext.length > 0) {
          violationsByPage.set(page.url, result.violationsWithContext);
          totalViolations += result.violationsWithContext.length;
          console.log(`  Found ${result.violationsWithContext.length} violation(s)`);
        } else {
          console.log(`  ✅ No violations`);
        }
      } catch (error) {
        console.error(`  ❌ Error testing ${page.url}:`, error);
      }
    }

    console.log(`\n✅ Completed tests: ${totalViolations} total violations found\n`);

    if (totalViolations === 0) {
      console.log('🎉 No accessibility issues found! Exiting.');
      return;
    }

    // Step 3: Group violations by unique code signature
    console.log('📊 Step 3: Grouping violations...');
    const groups = groupViolations(violationsByPage);
    console.log(`✅ Grouped into ${groups.length} unique violation(s)\n`);

    // Display summary
    console.log('Summary of unique violations:');
    for (const group of groups) {
      console.log(`  - ${group.ruleId} [${group.impact}]: ${group.totalOccurrences} occurrences on ${group.occurrences.length} page(s)`);
    }
    console.log('');

    // Step 4: Create/update GitHub issues
    console.log('📝 Step 4: Managing GitHub issues...');
    const issueManager = new GitHubIssueManager({
      token: config.githubToken,
      owner: config.githubOwner,
      repo: config.githubRepo
    });

    const issueResults = await issueManager.syncIssues(groups);
    console.log(`\n✅ Issue management complete\n`);

    // Display results
    const created = issueResults.filter(r => r.action === 'created').length;
    const updated = issueResults.filter(r => r.action === 'updated').length;

    console.log('📊 Final Summary:');
    console.log(`  Pages scanned: ${pages.length}`);
    console.log(`  Total violations: ${totalViolations}`);
    console.log(`  Unique violations: ${groups.length}`);
    console.log(`  Issues created: ${created}`);
    console.log(`  Issues updated: ${updated}`);
    console.log('');

    // Output results for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      const fs = await import('fs');
      const output = `pages_scanned=${pages.length}\n` +
                    `total_violations=${totalViolations}\n` +
                    `unique_violations=${groups.length}\n` +
                    `issues_created=${created}\n` +
                    `issues_updated=${updated}\n`;

      fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
    }

    console.log('✅ Action completed successfully!');

  } catch (error) {
    console.error('\n❌ Action failed:', error);
    throw error;
  }
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  // Get configuration from environment variables (GitHub Actions)
  const config: ActionConfig = {
    websiteUrl: process.env.WEBSITE_URL || process.env.INPUT_WEBSITE_URL || '',
    maxPages: parseInt(process.env.MAX_PAGES || process.env.INPUT_MAX_PAGES || '50'),
    maxDepth: parseInt(process.env.MAX_DEPTH || process.env.INPUT_MAX_DEPTH || '3'),
    includePatterns: process.env.INCLUDE_PATTERNS
      ? JSON.parse(process.env.INCLUDE_PATTERNS)
      : undefined,
    excludePatterns: process.env.EXCLUDE_PATTERNS
      ? JSON.parse(process.env.EXCLUDE_PATTERNS)
      : undefined,
    githubToken: process.env.GITHUB_TOKEN || '',
    githubOwner: process.env.GITHUB_REPOSITORY_OWNER || '',
    githubRepo: process.env.GITHUB_REPOSITORY?.split('/')[1] || '',
    contextDepth: parseInt(process.env.CONTEXT_DEPTH || process.env.INPUT_CONTEXT_DEPTH || '3')
  };

  // Validate required config
  if (!config.websiteUrl) {
    console.error('❌ Error: WEBSITE_URL is required');
    process.exit(1);
  }

  if (!config.githubToken) {
    console.error('❌ Error: GITHUB_TOKEN is required');
    process.exit(1);
  }

  runAction(config).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
