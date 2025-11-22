import { chromium, Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import type {
  AccessibilityTestResult,
  TestOptions,
  AxeViolation,
  ViolationWithContext,
  DOMContext,
  AccessibilityTestSummary
} from './types.js';

/**
 * Extracts DOM context for a violating element
 */
async function extractDOMContext(
  page: Page,
  target: string[],
  contextDepth: number = 3
): Promise<DOMContext> {
  const selector = target[0]; // Use the first target selector

  try {
    const context = await page.evaluate(
      ({ selector, depth }) => {
        const element = document.querySelector(selector);
        if (!element) {
          return null;
        }

        // Get the element's HTML
        const elementHTML = element.outerHTML;

        // Get ancestors up to specified depth
        const ancestors: string[] = [];
        let current = element.parentElement;
        let currentDepth = 0;

        while (current && currentDepth < depth) {
          ancestors.push(current.outerHTML);
          current = current.parentElement;
          currentDepth++;
        }

        // Get siblings for context
        const siblings: string[] = [];
        if (element.parentElement) {
          const parent = element.parentElement;
          Array.from(parent.children).forEach((child) => {
            if (child !== element) {
              siblings.push(child.outerHTML);
            }
          });
        }

        // Generate CSS selector path
        const getCSSPath = (el: Element): string => {
          const path: string[] = [];
          let currentEl: Element | null = el;

          while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
            let selector = currentEl.nodeName.toLowerCase();

            if (currentEl.id) {
              selector += `#${currentEl.id}`;
              path.unshift(selector);
              break;
            } else {
              let sibling: Element | null = currentEl;
              let nth = 1;

              while (sibling.previousElementSibling) {
                sibling = sibling.previousElementSibling;
                if (sibling.nodeName.toLowerCase() === selector) {
                  nth++;
                }
              }

              if (nth > 1) {
                selector += `:nth-of-type(${nth})`;
              }
            }

            path.unshift(selector);
            currentEl = currentEl.parentElement;
          }

          return path.join(' > ');
        };

        // Get XPath
        const getXPath = (el: Element): string => {
          if (el.id) {
            return `//*[@id="${el.id}"]`;
          }

          const parts: string[] = [];
          let currentEl: Element | null = el;

          while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
            let index = 0;
            let sibling: Element | null = currentEl.previousElementSibling;

            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === currentEl.nodeName) {
                index++;
              }
              sibling = sibling.previousElementSibling;
            }

            const tagName = currentEl.nodeName.toLowerCase();
            const pathIndex = index > 0 ? `[${index + 1}]` : '';
            parts.unshift(`${tagName}${pathIndex}`);

            currentEl = currentEl.parentElement;
          }

          return parts.length ? `/${parts.join('/')}` : '';
        };

        // Get computed styles for relevant properties
        const computedStyles = window.getComputedStyle(element);
        const relevantStyles: Record<string, string> = {
          display: computedStyles.display,
          visibility: computedStyles.visibility,
          opacity: computedStyles.opacity,
          color: computedStyles.color,
          backgroundColor: computedStyles.backgroundColor,
          fontSize: computedStyles.fontSize,
          fontFamily: computedStyles.fontFamily,
          width: computedStyles.width,
          height: computedStyles.height,
          position: computedStyles.position,
          zIndex: computedStyles.zIndex
        };

        return {
          element: elementHTML,
          parent: element.parentElement?.outerHTML,
          ancestors,
          siblings: siblings.slice(0, 5), // Limit siblings to 5 for brevity
          cssSelector: getCSSPath(element),
          xpath: getXPath(element),
          computedStyles: relevantStyles,
          contextDepth: depth
        };
      },
      { selector, depth: contextDepth }
    );

    if (!context) {
      // Fallback if element not found
      return {
        element: 'Element not found in DOM',
        cssSelector: selector,
        contextDepth: 0
      };
    }

    return context;
  } catch (error) {
    console.error('Error extracting DOM context:', error);
    return {
      element: 'Error extracting context',
      cssSelector: selector,
      contextDepth: 0
    };
  }
}

/**
 * Converts Axe violations to violations with enhanced context
 */
async function enhanceViolationsWithContext(
  page: Page,
  violations: any[],
  contextDepth: number
): Promise<ViolationWithContext[]> {
  const enhanced: ViolationWithContext[] = [];

  for (const violation of violations) {
    for (const node of violation.nodes) {
      const context = await extractDOMContext(page, node.target, contextDepth);

      enhanced.push({
        ruleId: violation.id,
        impact: violation.impact,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        wcagTags: violation.tags.filter((t: string) => t.startsWith('wcag')),
        target: node.target,
        html: node.html,
        context,
        failureSummary: node.failureSummary
      });
    }
  }

  return enhanced;
}

/**
 * Runs accessibility tests on a given URL
 */
export async function runAccessibilityTest(
  url: string,
  options: TestOptions = {}
): Promise<AccessibilityTestResult> {
  const {
    selectors = null,
    includeScreenshot = true,
    axeRules = null,
    contextDepth = 3
  } = options;

  console.log(`\n🔍 Testing accessibility for: ${url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle' });
    console.log('✓ Page loaded');

    // Run Axe accessibility scan
    let axeBuilder = new AxeBuilder({ page });

    // If specific Axe rules are provided, run only those rules
    if (axeRules && axeRules.length > 0) {
      console.log(`🎯 Focusing on Axe rules: ${axeRules.join(', ')}`);
      axeBuilder = axeBuilder.withRules(axeRules);
    }

    // If specific selectors are provided, focus on those elements
    if (selectors && selectors.length > 0) {
      console.log(`🎯 Focusing on selectors: ${selectors.join(', ')}`);
      selectors.forEach(selector => {
        axeBuilder = axeBuilder.include(selector);
      });
    }

    const results = await axeBuilder.analyze();
    console.log(`✓ Axe scan complete`);

    // Extract enhanced context for violations
    let violationsWithContext: ViolationWithContext[] | undefined;
    if (results.violations.length > 0) {
      console.log('🔍 Extracting DOM context for violations...');
      violationsWithContext = await enhanceViolationsWithContext(
        page,
        results.violations,
        contextDepth
      );
      console.log(`✓ Extracted context for ${violationsWithContext.length} violation(s)`);
    }

    // Take screenshot if requested
    let screenshot: string | null = null;
    if (includeScreenshot && results.violations.length > 0) {
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      screenshot = screenshotBuffer.toString('base64');
      console.log('✓ Screenshot captured');
    }

    await browser.close();

    const summary: AccessibilityTestSummary = {
      totalViolations: results.violations.length,
      criticalIssues: results.violations.filter(v => v.impact === 'critical').length,
      seriousIssues: results.violations.filter(v => v.impact === 'serious').length,
      moderateIssues: results.violations.filter(v => v.impact === 'moderate').length,
      minorIssues: results.violations.filter(v => v.impact === 'minor').length
    };

    return {
      url,
      timestamp: new Date().toISOString(),
      violations: results.violations as any,
      passes: results.passes,
      incomplete: results.incomplete,
      focusedRules: axeRules || null,
      summary,
      screenshot,
      violationsWithContext
    };
  } catch (error) {
    await browser.close();
    console.error(`Error testing ${url}:`, error);
    throw error;
  }
}

/**
 * Formats accessibility violations for readable output
 */
export function formatViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) {
    return '✅ No accessibility violations found!';
  }

  let report = `\n⚠️  Found ${violations.length} accessibility violation(s):\n\n`;

  violations.forEach((violation, index) => {
    report += `${index + 1}. ${violation.id} [${violation.impact?.toUpperCase()}]\n`;
    report += `   Description: ${violation.description}\n`;
    report += `   Help: ${violation.help}\n`;
    report += `   WCAG: ${violation.tags.filter(t => t.startsWith('wcag')).join(', ')}\n`;
    report += `   Affected elements (${violation.nodes.length}):\n`;

    violation.nodes.forEach((node, nodeIndex) => {
      report += `     ${nodeIndex + 1}. ${node.html.substring(0, 100)}${node.html.length > 100 ? '...' : ''}\n`;
      report += `        Target: ${node.target.join(' ')}\n`;
      if (node.failureSummary) {
        report += `        Issue: ${node.failureSummary.split('\n')[0]}\n`;
      }
    });

    report += `   More info: ${violation.helpUrl}\n\n`;
  });

  return report;
}

/**
 * Formats violations with context for the VS Code chat agent
 */
export function formatViolationsWithContext(violations: ViolationWithContext[]): string {
  if (violations.length === 0) {
    return '✅ No accessibility violations found!';
  }

  let report = `\n⚠️  Found ${violations.length} accessibility violation(s) with context:\n\n`;

  violations.forEach((violation, index) => {
    report += `${index + 1}. ${violation.ruleId} [${violation.impact?.toUpperCase()}]\n`;
    report += `   Description: ${violation.description}\n`;
    report += `   Help: ${violation.help}\n`;
    report += `   WCAG: ${violation.wcagTags.join(', ')}\n`;
    report += `   Target: ${violation.target.join(' ')}\n`;
    report += `   CSS Selector: ${violation.context.cssSelector}\n`;
    if (violation.context.xpath) {
      report += `   XPath: ${violation.context.xpath}\n`;
    }
    report += `   Element HTML:\n`;
    report += `   ${violation.html.substring(0, 200)}${violation.html.length > 200 ? '...' : ''}\n`;
    if (violation.failureSummary) {
      report += `   Issue: ${violation.failureSummary.split('\n')[0]}\n`;
    }
    report += `\n`;
  });

  return report;
}
