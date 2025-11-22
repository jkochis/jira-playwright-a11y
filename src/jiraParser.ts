import { readFileSync } from 'fs';
import { identifyAxeRules } from './llmClient.js';
import type { ParsedJiraIssue, TestConfig, LLMConfig } from './types.js';

/**
 * Parses a local markdown file that contains a Jira issue description
 */
export async function parseJiraMarkdown(
  filePath: string,
  llmConfig?: LLMConfig
): Promise<ParsedJiraIssue & { llmUsed: boolean }> {
  const content = readFileSync(filePath, 'utf-8');

  // Extract URLs from the content
  const urlPattern = /https?:\/\/[^\s)]+/g;
  const urls = content.match(urlPattern) || [];

  // Filter out Jira/Siteimprove admin URLs, keep only target URLs
  const targetUrls = urls.filter(url => {
    const lowerUrl = url.toLowerCase();
    return !lowerUrl.includes('atlassian.net') &&
           !lowerUrl.includes('siteimprove.com') &&
           !lowerUrl.includes('jira');
  });

  // Extract WCAG criteria
  const wcagPattern = /Success criteria:\s*([\d.]+):\s*([^\n]+)/i;
  const wcagMatch = content.match(wcagPattern);

  // Extract conformance level
  const conformancePattern = /Conformance:\s*([A-Z]+)/i;
  const conformanceMatch = content.match(conformancePattern);

  // Extract the main description (first few lines after "Description")
  const descriptionMatch = content.match(/Description\s*\n\s*\n(.*?)(?:\n\n|Learn more)/is);
  const description = descriptionMatch
    ? descriptionMatch[1].trim()
    : content.split('\n').slice(2, 5).filter(line => line.trim()).join(' ').trim();

  // Extract difficulty
  const difficultyPattern = /Difficulty:\s*([^\n]+)/i;
  const difficultyMatch = content.match(difficultyPattern);

  // Extract occurrences
  const occurrencesPattern = /Occurrences:\s*(\d+)/i;
  const occurrencesMatch = content.match(occurrencesPattern);

  // Use LLM to identify Axe rules
  const { rules: axeRules, usedLLM: llmUsed } = await identifyAxeRules(
    description,
    content,
    llmConfig
  );

  return {
    description,
    urls: [...new Set(targetUrls)], // Remove duplicates
    wcag: wcagMatch ? {
      criterion: wcagMatch[1],
      name: wcagMatch[2].trim()
    } : null,
    conformanceLevel: conformanceMatch ? conformanceMatch[1] : null,
    difficulty: difficultyMatch ? difficultyMatch[1].trim() : null,
    occurrences: occurrencesMatch ? parseInt(occurrencesMatch[1], 10) : null,
    axeRules: axeRules.length > 0 ? axeRules : null,
    fullContent: content,
    llmUsed
  };
}

/**
 * Formats parsed Jira data for testing
 */
export function formatForTesting(
  parsedData: ParsedJiraIssue & { llmUsed?: boolean }
): TestConfig {
  return {
    issue: 'local-mock',
    summary: parsedData.description,
    description: parsedData.fullContent,
    urls: parsedData.urls,
    selectors: null, // Could be enhanced to extract selectors if provided
    wcagInfo: parsedData.wcag,
    conformanceLevel: parsedData.conformanceLevel,
    axeRules: parsedData.axeRules,
    metadata: {
      difficulty: parsedData.difficulty || undefined,
      occurrences: parsedData.occurrences || undefined
    }
  };
}
