import JiraApi from 'jira-client';
import dotenv from 'dotenv';

dotenv.config();

interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  issueType: string;
  customFields: any;
}

interface ParsedIssueForTests {
  issue: string;
  summary: string;
  description: string;
  urls: string[];
  selectors: string[] | null;
  fullIssue: any;
}

/**
 * Initializes and returns a Jira client
 */
export function createJiraClient(): JiraApi {
  return new JiraApi({
    protocol: 'https',
    host: process.env.JIRA_HOST || '',
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN,
    apiVersion: '2',
    strictSSL: true
  });
}

/**
 * Fetches a Jira issue by key and extracts relevant information
 */
export async function getJiraIssue(issueKey: string): Promise<JiraIssue> {
  const jira = createJiraClient();

  try {
    const issue = await jira.findIssue(issueKey);

    return {
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description,
      status: issue.fields.status.name,
      issueType: issue.fields.issuetype.name,
      customFields: issue.fields
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error fetching Jira issue ${issueKey}:`, errorMessage);
    throw error;
  }
}

/**
 * Parses the issue description to extract test URLs and selectors
 */
export function parseIssueForTests(issue: JiraIssue): ParsedIssueForTests {
  const description = issue.description || '';

  // Extract URLs from description (basic regex pattern)
  const urlPattern = /https?:\/\/[^\s)]+/g;
  const urls = description.match(urlPattern) || [process.env.TARGET_URL].filter(Boolean) as string[];

  // Extract potential CSS selectors (look for patterns like .class, #id, [attr])
  const selectorPattern = /(?:selector|element|target):\s*([.#[][\w\-\[\]="']+)/gi;
  const selectorMatches = [...description.matchAll(selectorPattern)];
  const selectors = selectorMatches.map(match => match[1]);

  return {
    issue: issue.key,
    summary: issue.summary,
    description: issue.description,
    urls: [...new Set(urls)], // Remove duplicates
    selectors: selectors.length > 0 ? selectors : null,
    fullIssue: issue
  };
}
