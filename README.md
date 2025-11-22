# Jira + Playwright + Axe Accessibility Tester with LLM Integration

Automated accessibility testing using Jira descriptions, Playwright, and Axe with LLM-powered rule identification via Azure AI Foundry.

## Features

- **LLM-Powered Rule Identification**: Uses Azure OpenAI or Claude to intelligently identify axe-core rules from Jira issue descriptions
- **Enhanced DOM Context Extraction**: Captures detailed HTML context including ancestors, siblings, CSS selectors, and XPath for code remediation
- **VS Code Chat Agent Integration**: Designed as a sub-job service for VS Code chat agents
- **Multiple Input Sources**: Supports Jira API, local markdown files, or direct URL testing
- **Comprehensive Reporting**: Generates detailed JSON reports with violations and context
- **TypeScript**: Fully typed for better developer experience and integration

## Installation

```bash
npm install
npm run install-browsers
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# LLM Configuration (Required for intelligent rule identification)
USE_LLM=true
LLM_PROVIDER=openai  # or 'claude'

# Azure OpenAI (default provider)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4

# Azure Claude (optional alternative)
AZURE_CLAUDE_ENDPOINT=https://your-claude-endpoint
AZURE_CLAUDE_API_KEY=your-api-key
AZURE_CLAUDE_MODEL=claude-3-5-sonnet-20241022

# Test Configuration
JIRA_FILE_PATH=./example/jira.md
CONTEXT_DEPTH=3  # How many ancestor levels to capture
```

## Usage

### As a Standalone CLI Tool

```bash
# Using local Jira markdown file (recommended)
npm run dev

# Or build and run
npm run build
npm start
```

### As a Programmatic API (for VS Code Chat Agents)

```typescript
import { analyzeAccessibility, formatAnalysisReport } from './src/api.js';

// Analyze accessibility from Jira content
const result = await analyzeAccessibility({
  jiraContent: jiraMarkdownContent,
  useLLM: true,
  contextDepth: 3,
  includeScreenshots: true
});

// result contains:
// - identifiedRules: string[] - Axe rules identified by LLM
// - violations: ViolationWithContext[] - Violations with DOM context
// - urls: string[] - URLs tested
// - summary: TestSummary - Aggregated statistics
// - llmUsed: boolean - Whether LLM was used

// Format results for display
const report = formatAnalysisReport(result);
console.log(report);
```

### Violation Context Structure

Each violation includes enhanced context for code remediation:

```typescript
{
  ruleId: 'aria-required-children',
  impact: 'critical',
  description: 'Some roles require owned elements',
  help: 'Certain ARIA roles must contain particular children',
  wcagTags: ['wcag2a', 'wcag21a'],
  target: ['#nav > ul'],
  html: '<ul role="list">...</ul>',
  context: {
    element: '<ul role="list">...</ul>',  // Violating element
    parent: '<nav id="nav">...</nav>',    // Parent element
    ancestors: ['<div class="header">...', '<body>...'],  // Ancestor chain
    siblings: ['<div class="logo">...'],  // Sibling elements
    cssSelector: 'body > div.header > nav#nav > ul:nth-of-type(1)',
    xpath: '/html/body/div[1]/nav/ul[1]',
    computedStyles: { display: 'block', visibility: 'visible', ... },
    contextDepth: 3
  },
  failureSummary: 'Fix any of the following...'
}
```

## How It Works

1. **Input**: VS Code chat agent reads Jira issue and sends description to this tool
2. **LLM Analysis**: Azure OpenAI/Claude analyzes the description and identifies relevant axe-core rules
3. **Playwright Testing**: Tests URLs from the description for the identified rule violations
4. **Context Extraction**: Captures HTML elements + surrounding DOM context for each violation
5. **Output**: Returns structured results to the chat agent
6. **Code Remediation**: Chat agent uses the HTML context to locate files in the codebase and suggest fixes

## LLM Rule Identification

The LLM is provided with:
- Complete list of axe-core rules
- Common issue-to-rule mappings
- WCAG criteria from the Jira description
- Issue description and full content

Example prompt flow:
```
Input: "Some roles are designed to contain other roles. This element has 
this type of role, but it doesn't contain any required-owned elements."

LLM identifies: ["aria-required-children", "aria-required-parent"]

Playwright tests only these specific rules, making tests faster and more focused.
```

## Project Structure

```
src/
├── api.ts              # Programmatic API for external integration
├── types.ts            # TypeScript type definitions
├── llmClient.ts        # LLM integration (Azure OpenAI/Claude)
├── jiraParser.ts       # Jira markdown parser with LLM integration
├── a11yTester.ts       # Playwright + Axe testing with context extraction
├── config.ts           # Configuration management
├── index.ts            # CLI entry point
├── jiraClient.ts       # Jira API client (optional)
└── mcpClient.ts        # MCP integration (optional)
```

## Scripts

```bash
npm run dev          # Run in development mode (tsx)
npm run build        # Compile TypeScript
npm start            # Run compiled code
npm run typecheck    # Type check without compiling
npm run clean        # Remove dist folder
npm test             # Run accessibility tests
```

## TypeScript Integration

All modules are fully typed and export their types:

```typescript
import type {
  AnalysisResult,
  ViolationWithContext,
  DOMContext,
  LLMConfig,
  TestConfig
} from './src/api.js';
```

## Output

Results are saved to `test-results/a11y-report-*.json` with complete violation data and DOM context.

## VS Code Chat Agent Integration Example

```typescript
// In your VS Code chat agent
import { analyzeAccessibility } from 'jira-playwright-a11y/dist/api.js';

async function handleJiraIssue(jiraContent: string) {
  // Step 1: Analyze with LLM and Playwright
  const analysis = await analyzeAccessibility({
    jiraContent,
    useLLM: true
  });

  // Step 2: Use violations context to find code
  for (const violation of analysis.violations) {
    const cssSelector = violation.context.cssSelector;
    const htmlSnippet = violation.context.element;
    
    // Search codebase for matching HTML/components
    const files = await searchCodebase(htmlSnippet);
    
    // Suggest fixes based on violation.ruleId and violation.help
    await suggestFix(files, violation);
  }
}
```

## License

ISC
