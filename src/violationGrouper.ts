/**
 * Groups accessibility violations by unique code signature
 * Prevents duplicate issues for the same violation appearing on multiple pages
 */

import crypto from 'crypto';
import type { ViolationWithContext } from './types.js';

export interface ViolationGroup {
  signature: string;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  wcagTags: string[];
  // Key violation example
  exampleHtml: string;
  exampleSelector: string;
  // All pages where this violation occurs
  occurrences: Array<{
    url: string;
    selector: string;
    html: string;
  }>;
  totalOccurrences: number;
}

/**
 * Creates a unique signature for a violation based on its code characteristics
 * Same HTML structure = same signature, regardless of page
 */
function createViolationSignature(violation: ViolationWithContext): string {
  // Normalize HTML to ignore whitespace and dynamic attributes
  let normalizedHtml = violation.html
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Remove dynamic attributes that change between pages
  normalizedHtml = normalizedHtml
    // Remove aria-controls with dynamic IDs
    .replace(/aria-controls="[^"]*"/g, 'aria-controls=""')
    // Remove id attributes with dynamic values
    .replace(/\sid="[^"]*"/g, ' id=""')
    // Remove data attributes with dynamic values
    .replace(/\sdata-[a-z-]+="[^"]*"/g, '')
    // Remove class names that look generated (contain numbers/hashes)
    .replace(/\sclass="([^"]*)"/g, (_match, classes) => {
      const cleanClasses = classes
        .split(' ')
        .filter((c: string) => !/\d{3,}|[a-f0-9]{6,}/.test(c))
        .join(' ');
      return cleanClasses ? ` class="${cleanClasses}"` : '';
    });

  // Extract just the element structure (tag + key attributes)
  const elementMatch = normalizedHtml.match(/^<(\w+)([^>]*)>/);
  if (!elementMatch) {
    // Fallback if we can't parse
    return crypto.createHash('md5')
      .update(`${violation.ruleId}:${normalizedHtml.substring(0, 100)}`)
      .digest('hex');
  }

  const tagName = elementMatch[1];
  const attributes = elementMatch[2];

  // Keep only semantic attributes for signature
  const semanticAttrs = attributes.match(/(role|aria-[a-z]+|type|name|placeholder)="[^"]*"/g) || [];

  // Create signature from rule + tag + semantic attributes + CSS selector pattern
  const selectorPattern = violation.context.cssSelector
    .replace(/:\d+/g, '')  // Remove positional selectors
    .replace(/#[^\s>]+/g, '')  // Remove IDs
    .split(' > ')
    .slice(-3)  // Use last 3 levels
    .join(' > ');

  const signatureData = {
    ruleId: violation.ruleId,
    tagName,
    semanticAttributes: semanticAttrs.sort().join(' '),  // Sort for consistency
    selectorPattern,
    impact: violation.impact || 'unknown'
  };

  const signatureString = JSON.stringify(signatureData);
  return crypto.createHash('md5').update(signatureString).digest('hex');
}

/**
 * Groups violations from multiple pages by their unique code signature
 */
export function groupViolations(
  violationsByPage: Map<string, ViolationWithContext[]>
): ViolationGroup[] {
  const groups = new Map<string, ViolationGroup>();

  for (const [url, violations] of violationsByPage.entries()) {
    for (const violation of violations) {
      const signature = createViolationSignature(violation);

      if (!groups.has(signature)) {
        // Create new group
        groups.set(signature, {
          signature,
          ruleId: violation.ruleId,
          impact: violation.impact || 'unknown',
          description: violation.description,
          help: violation.help,
          helpUrl: violation.helpUrl,
          wcagTags: violation.wcagTags,
          exampleHtml: violation.html,
          exampleSelector: violation.context.cssSelector,
          occurrences: [],
          totalOccurrences: 0
        });
      }

      // Add this occurrence to the group
      const group = groups.get(signature)!;
      group.occurrences.push({
        url,
        selector: violation.context.cssSelector,
        html: violation.html
      });
      group.totalOccurrences++;
    }
  }

  // Convert to array and sort by impact and occurrence count
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    // Sort by impact first (critical > serious > moderate > minor)
    const impactOrder = { critical: 0, serious: 1, moderate: 2, minor: 3, unknown: 4 };
    const impactDiff = impactOrder[a.impact as keyof typeof impactOrder] -
                       impactOrder[b.impact as keyof typeof impactOrder];

    if (impactDiff !== 0) return impactDiff;

    // Then by occurrence count (most occurrences first)
    return b.totalOccurrences - a.totalOccurrences;
  });

  return sortedGroups;
}

/**
 * Generates a markdown summary for a violation group
 */
export function generateGroupSummary(group: ViolationGroup): string {
  const impactBadge = `![${group.impact}](https://img.shields.io/badge/impact-${group.impact}-${getImpactColor(group.impact)})`;
  const wcagBadges = group.wcagTags.map(tag =>
    `![${tag}](https://img.shields.io/badge/WCAG-${tag}-blue)`
  ).join(' ');

  let summary = `# ${group.ruleId}\n\n`;
  summary += `${impactBadge} ${wcagBadges}\n\n`;
  summary += `## Description\n\n${group.description}\n\n`;
  summary += `## How to Fix\n\n${group.help}\n\n`;
  summary += `📚 [Learn more](${group.helpUrl})\n\n`;
  summary += `## Impact\n\n`;
  summary += `- **Severity**: ${group.impact.toUpperCase()}\n`;
  summary += `- **Total Occurrences**: ${group.totalOccurrences}\n`;
  summary += `- **Pages Affected**: ${group.occurrences.length}\n\n`;

  summary += `## Example Violation\n\n`;
  summary += `**Selector**: \`${group.exampleSelector}\`\n\n`;
  summary += `**HTML**:\n\`\`\`html\n${group.exampleHtml.substring(0, 500)}\n\`\`\`\n\n`;

  summary += `## Pages Where This Occurs\n\n`;

  // Group by URL to show unique pages
  const uniquePages = new Map<string, number>();
  for (const occurrence of group.occurrences) {
    uniquePages.set(occurrence.url, (uniquePages.get(occurrence.url) || 0) + 1);
  }

  for (const [url, count] of uniquePages.entries()) {
    summary += `- [${url}](${url}) (${count} instance${count > 1 ? 's' : ''})\n`;
  }

  summary += `\n## Remediation Steps\n\n`;
  summary += `1. Search your codebase for: \`${group.exampleSelector}\`\n`;
  summary += `2. Look for HTML matching this pattern:\n`;
  summary += `   \`\`\`html\n   ${group.exampleHtml.substring(0, 100)}...\n   \`\`\`\n`;
  summary += `3. Apply the fix described in the "How to Fix" section\n`;
  summary += `4. Test the changes on all affected pages\n\n`;

  summary += `---\n\n`;
  summary += `*This issue was automatically generated by the accessibility scanner*\n`;
  summary += `*Signature: \`${group.signature}\`*\n`;

  return summary;
}

/**
 * Gets color for impact badge
 */
function getImpactColor(impact: string): string {
  const colors: Record<string, string> = {
    critical: 'red',
    serious: 'orange',
    moderate: 'yellow',
    minor: 'blue',
    unknown: 'gray'
  };
  return colors[impact] || 'gray';
}

/**
 * Generates labels for a violation group
 */
export function generateLabels(group: ViolationGroup): string[] {
  const labels = [
    'accessibility',
    `a11y:${group.ruleId}`,
    `impact:${group.impact}`
  ];

  // Add WCAG labels
  for (const tag of group.wcagTags) {
    if (tag.startsWith('wcag')) {
      labels.push(tag);
    }
  }

  return labels;
}
