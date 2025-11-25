/**
 * GitHub Issues Manager for accessibility violations
 * Creates and updates issues, avoiding duplicates
 */

import { Octokit } from '@octokit/rest';
import type { ViolationGroup } from './violationGrouper.js';
import { generateGroupSummary, generateLabels } from './violationGrouper.js';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface IssueResult {
  signature: string;
  action: 'created' | 'updated' | 'unchanged';
  issueNumber: number;
  url: string;
}

/**
 * Manages GitHub issues for accessibility violations
 */
export class GitHubIssueManager {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.owner = config.owner;
    this.repo = config.repo;
  }

  /**
   * Creates or updates issues for violation groups
   */
  async syncIssues(groups: ViolationGroup[]): Promise<IssueResult[]> {
    const results: IssueResult[] = [];

    // Get existing a11y issues
    const existingIssues = await this.getExistingA11yIssues();

    for (const group of groups) {
      const existingIssue = this.findMatchingIssue(group, existingIssues);

      if (existingIssue) {
        // Update existing issue
        const result = await this.updateIssue(existingIssue.number, group);
        results.push(result);
      } else {
        // Create new issue
        const result = await this.createIssue(group);
        results.push(result);
      }
    }

    // Close issues that no longer have violations
    await this.closeResolvedIssues(existingIssues, groups);

    return results;
  }

  /**
   * Gets all existing accessibility issues
   */
  private async getExistingA11yIssues(): Promise<Array<{ number: number; body: string; title: string; state: string }>> {
    const issues: Array<{ number: number; body: string; title: string; state: string }> = [];
    let page = 1;

    while (true) {
      const response = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        labels: 'accessibility',
        state: 'open',
        per_page: 100,
        page
      });

      issues.push(...response.data.map(issue => ({
        number: issue.number,
        body: issue.body || '',
        title: issue.title,
        state: issue.state
      })));

      if (response.data.length < 100) break;
      page++;
    }

    return issues;
  }

  /**
   * Finds an existing issue that matches a violation group
   */
  private findMatchingIssue(
    group: ViolationGroup,
    existingIssues: Array<{ number: number; body: string; title: string }>
  ): { number: number; body: string } | null {
    for (const issue of existingIssues) {
      // Check if signature matches
      if (issue.body.includes(`Signature: \`${group.signature}\``)) {
        return issue;
      }

      // Fallback: check if rule ID matches in title
      if (issue.title.includes(group.ruleId)) {
        return issue;
      }
    }

    return null;
  }

  /**
   * Creates a new issue for a violation group
   */
  private async createIssue(group: ViolationGroup): Promise<IssueResult> {
    const title = `[A11y] ${group.ruleId}: ${group.description.substring(0, 80)}`;
    const body = generateGroupSummary(group);
    const labels = generateLabels(group);

    const response = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels
    });

    console.log(`✅ Created issue #${response.data.number}: ${title}`);

    return {
      signature: group.signature,
      action: 'created',
      issueNumber: response.data.number,
      url: response.data.html_url
    };
  }

  /**
   * Updates an existing issue with new violation data
   */
  private async updateIssue(issueNumber: number, group: ViolationGroup): Promise<IssueResult> {
    const body = generateGroupSummary(group);
    const labels = generateLabels(group);

    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
      labels
    });

    // Add comment about the update
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: `🔄 **Updated**: This issue was updated with the latest scan results.\n\n` +
            `- Total occurrences: ${group.totalOccurrences}\n` +
            `- Pages affected: ${group.occurrences.length}\n\n` +
            `*Updated at: ${new Date().toISOString()}*`
    });

    console.log(`🔄 Updated issue #${issueNumber}`);

    return {
      signature: group.signature,
      action: 'updated',
      issueNumber,
      url: `https://github.com/${this.owner}/${this.repo}/issues/${issueNumber}`
    };
  }

  /**
   * Closes issues that no longer have violations
   */
  private async closeResolvedIssues(
    existingIssues: Array<{ number: number; body: string; title: string }>,
    currentGroups: ViolationGroup[]
  ): Promise<void> {
    const currentSignatures = new Set(currentGroups.map(g => g.signature));

    for (const issue of existingIssues) {
      // Extract signature from issue body
      const signatureMatch = issue.body.match(/Signature: `([^`]+)`/);
      if (!signatureMatch) continue;

      const signature = signatureMatch[1];

      // If this violation no longer exists, close the issue
      if (!currentSignatures.has(signature)) {
        await this.octokit.issues.update({
          owner: this.owner,
          repo: this.repo,
          issue_number: issue.number,
          state: 'closed'
        });

        await this.octokit.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: issue.number,
          body: `✅ **Resolved**: This accessibility issue was not found in the latest scan and has been automatically closed.\n\n` +
                `If this was resolved manually, great work! If the issue still exists, please reopen this issue.\n\n` +
                `*Closed at: ${new Date().toISOString()}*`
        });

        console.log(`✅ Closed resolved issue #${issue.number}`);
      }
    }
  }

  /**
   * Creates a summary comment on a PR or issue
   */
  async createSummaryComment(
    issueNumber: number,
    results: IssueResult[],
    totalPages: number
  ): Promise<void> {
    const created = results.filter(r => r.action === 'created').length;
    const updated = results.filter(r => r.action === 'updated').length;

    let summary = `## 🔍 Accessibility Scan Results\n\n`;
    summary += `**Pages Scanned**: ${totalPages}\n`;
    summary += `**Unique Violations**: ${results.length}\n`;
    summary += `**New Issues**: ${created}\n`;
    summary += `**Updated Issues**: ${updated}\n\n`;

    if (results.length > 0) {
      summary += `### Issues Created/Updated:\n\n`;
      for (const result of results) {
        const emoji = result.action === 'created' ? '🆕' : '🔄';
        summary += `${emoji} #${result.issueNumber}\n`;
      }
    } else {
      summary += `✅ No accessibility issues found!\n`;
    }

    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: summary
    });
  }
}
