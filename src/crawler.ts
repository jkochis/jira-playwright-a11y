/**
 * Web Crawler for discovering all pages on a website
 */

import { chromium, Page } from 'playwright';

export interface CrawlOptions {
  baseUrl: string;
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  respectRobotsTxt?: boolean;
}

export interface CrawlResult {
  url: string;
  depth: number;
  statusCode: number;
  title?: string;
}

/**
 * Crawls a website and discovers all accessible pages
 */
export async function crawlWebsite(options: CrawlOptions): Promise<CrawlResult[]> {
  const {
    baseUrl,
    maxPages = 100,
    maxDepth = 3,
    includePatterns = [],
    excludePatterns = [
      '/api/',
      '/admin/',
      '.pdf',
      '.zip',
      '.jpg',
      '.png',
      '.gif',
      '.svg',
      '/cdn-cgi/'
    ],
    respectRobotsTxt = true
  } = options;

  const visited = new Set<string>();
  const toVisit: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }];
  const results: CrawlResult[] = [];
  const baseUrlObj = new URL(baseUrl);

  // Fetch and parse robots.txt if needed
  let disallowedPaths: string[] = [];
  if (respectRobotsTxt) {
    disallowedPaths = await fetchRobotsTxt(baseUrl);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    while (toVisit.length > 0 && results.length < maxPages) {
      const { url, depth } = toVisit.shift()!;

      // Skip if already visited
      if (visited.has(url)) {
        continue;
      }

      // Skip if exceeds max depth
      if (depth > maxDepth) {
        continue;
      }

      // Skip if matches exclude patterns
      if (shouldExclude(url, excludePatterns, disallowedPaths)) {
        continue;
      }

      // Skip if doesn't match include patterns (if specified)
      if (includePatterns.length > 0 && !matchesAnyPattern(url, includePatterns)) {
        continue;
      }

      visited.add(url);

      console.log(`Crawling [${depth}]: ${url}`);

      const page = await context.newPage();

      try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        const statusCode = response?.status() || 0;

        if (statusCode >= 200 && statusCode < 400) {
          const title = await page.title();

          results.push({
            url,
            depth,
            statusCode,
            title
          });

          // Extract links from the page
          if (depth < maxDepth) {
            const links = await extractLinks(page, baseUrlObj);
            for (const link of links) {
              if (!visited.has(link)) {
                toVisit.push({ url: link, depth: depth + 1 });
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to crawl ${url}:`, error instanceof Error ? error.message : 'Unknown error');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nCrawl complete: Found ${results.length} pages`);
  return results;
}

/**
 * Extracts all internal links from a page
 */
async function extractLinks(page: Page, baseUrl: URL): Promise<string[]> {
  const links = await page.evaluate((baseHostname) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const urls: string[] = [];

    for (const anchor of anchors) {
      try {
        const href = anchor.getAttribute('href');
        if (!href) continue;

        // Convert relative URLs to absolute
        const url = new URL(href, window.location.href);

        // Only include same-origin links
        if (url.hostname === baseHostname) {
          // Remove hash fragments
          url.hash = '';
          urls.push(url.href);
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    return urls;
  }, baseUrl.hostname);

  return [...new Set(links)]; // Remove duplicates
}

/**
 * Fetches and parses robots.txt
 */
async function fetchRobotsTxt(baseUrl: string): Promise<string[]> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const response = await fetch(robotsUrl);

    if (!response.ok) {
      return [];
    }

    const text = await response.text();
    const disallowed: string[] = [];

    // Simple robots.txt parser - looks for Disallow directives
    const lines = text.split('\n');
    let isUserAgentAll = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('User-agent:')) {
        isUserAgentAll = trimmed.includes('*');
      }

      if (isUserAgentAll && trimmed.startsWith('Disallow:')) {
        const path = trimmed.substring('Disallow:'.length).trim();
        if (path) {
          disallowed.push(path);
        }
      }
    }

    return disallowed;
  } catch (error) {
    console.warn('Failed to fetch robots.txt:', error);
    return [];
  }
}

/**
 * Checks if URL should be excluded
 */
function shouldExclude(url: string, excludePatterns: string[], disallowedPaths: string[]): boolean {
  // Check exclude patterns
  for (const pattern of excludePatterns) {
    if (url.includes(pattern)) {
      return true;
    }
  }

  // Check robots.txt disallowed paths
  try {
    const urlObj = new URL(url);
    for (const path of disallowedPaths) {
      if (urlObj.pathname.startsWith(path)) {
        return true;
      }
    }
  } catch (e) {
    // Invalid URL
    return true;
  }

  return false;
}

/**
 * Checks if URL matches any include pattern
 */
function matchesAnyPattern(url: string, patterns: string[]): boolean {
  return patterns.some(pattern => url.includes(pattern));
}
