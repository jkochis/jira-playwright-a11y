# Integration Instructions: Jira Playwright A11y Package

## Overview
Integrate the `jira-playwright-a11y` accessibility testing tool into the monorepo as a reusable package and VS Code extension tool.

## Prerequisites
- Repository: https://github.com/jkochis/jira-playwright-a11y
- Target monorepo structure: `packages/` for shared code, `apps/extension/` for VS Code extension

## Step 1: Add Package to Monorepo

### 1.1 Clone the accessibility testing package into packages directory
```bash
cd packages/
git clone https://github.com/jkochis/jira-playwright-a11y.git
cd jira-playwright-a11y
rm -rf .git  # Remove git history since it's now part of the monorepo
```

### 1.2 Update package.json for monorepo compatibility
Edit `packages/jira-playwright-a11y/package.json`:

```json
{
  "name": "@repo/jira-playwright-a11y",
  "version": "1.0.0",
  "description": "LLM-powered accessibility testing tool",
  "main": "dist/api.js",
  "types": "dist/api.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "exports": {
    ".": {
      "types": "./dist/api.d.ts",
      "import": "./dist/api.js"
    },
    "./types": {
      "types": "./dist/types.d.ts",
      "import": "./dist/types.js"
    }
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.70.1",
    "@axe-core/playwright": "^4.10.0",
    "dotenv": "^16.4.5",
    "openai": "latest",
    "playwright": "^1.48.0"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "tsx": "^4.20.6",
    "typescript": "^5.9.3"
  }
}
```

### 1.3 Create a clean main export
Create/update `packages/jira-playwright-a11y/src/api.ts` to ensure it exports everything needed:

```typescript
/**
 * Main API exports for VS Code extension integration
 */
export { analyzeAccessibility, formatAnalysisReport, config } from './api.js';
export type {
  AnalysisResult,
  ViolationWithContext,
  DOMContext,
  AnalyzeAccessibilityOptions,
  LLMConfig,
  TestConfig
} from './types.js';
```

### 1.4 Update workspace configuration
Edit `pnpm-workspace.yaml` at the root:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 1.5 Install dependencies
```bash
cd ../../  # Back to monorepo root
pnpm install
```

## Step 2: Create VS Code Extension Tool

### 2.1 Create the accessibility tool wrapper
Create `apps/extension/src/tools/a11y.ts`:

```typescript
import * as vscode from 'vscode';
import { 
  analyzeAccessibility, 
  formatAnalysisReport,
  type AnalysisResult,
  type ViolationWithContext 
} from '@repo/jira-playwright-a11y';

/**
 * Tool for analyzing accessibility issues from Jira descriptions
 * Uses LLM to identify axe-core rules and Playwright to test URLs
 * Returns detailed DOM context for code remediation
 */
export async function runAccessibilityAnalysis(
  jiraContent: string,
  options?: {
    useLLM?: boolean;
    contextDepth?: number;
  }
): Promise<AnalysisResult> {
  try {
    const result = await analyzeAccessibility({
      jiraContent,
      useLLM: options?.useLLM ?? true,
      contextDepth: options?.contextDepth ?? 3,
      includeScreenshots: false // Skip screenshots in VS Code context
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Accessibility analysis failed: ${errorMessage}`);
  }
}

/**
 * Formats violations for display in VS Code chat
 */
export function formatViolationsForChat(
  violations: ViolationWithContext[]
): string {
  if (violations.length === 0) {
    return '✅ No accessibility violations found!';
  }

  let output = `Found ${violations.length} accessibility violation(s):\n\n`;

  violations.forEach((violation, index) => {
    output += `### ${index + 1}. ${violation.ruleId} [${violation.impact?.toUpperCase()}]\n\n`;
    output += `**Description:** ${violation.description}\n\n`;
    output += `**How to fix:** ${violation.help}\n\n`;
    output += `**Location:**\n`;
    output += `- CSS Selector: \`${violation.context.cssSelector}\`\n`;
    if (violation.context.xpath) {
      output += `- XPath: \`${violation.context.xpath}\`\n`;
    }
    output += `\n**HTML Element:**\n\`\`\`html\n${violation.html.substring(0, 200)}\n\`\`\`\n\n`;
    output += `[More info](${violation.helpUrl})\n\n---\n\n`;
  });

  return output;
}

/**
 * Searches workspace for code matching violation context
 */
export async function findViolationInWorkspace(
  violation: ViolationWithContext
): Promise<vscode.Uri[]> {
  const htmlPattern = violation.html
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .substring(0, 100); // Use first 100 chars for search

  const files = await vscode.workspace.findFiles('**/*.{html,jsx,tsx,vue}');
  const matches: vscode.Uri[] = [];

  for (const file of files) {
    const document = await vscode.workspace.openTextDocument(file);
    const text = document.getText();
    
    // Simple search - could be enhanced with fuzzy matching
    if (text.includes(violation.html.substring(0, 50))) {
      matches.push(file);
    }
  }

  return matches;
}
```

### 2.2 Register the tool in agent provider
Update `apps/extension/src/providers/agentProvider.ts`:

```typescript
import { runAccessibilityAnalysis, formatViolationsForChat, findViolationInWorkspace } from '../tools/a11y';

// Add to your existing tool registrations
export function registerAccessibilityTool(context: vscode.ExtensionContext) {
  const a11yTool = vscode.lm.registerTool('accessibility-analyzer', {
    name: 'accessibility-analyzer',
    description: 'Analyzes Jira accessibility issues using LLM and Playwright. Identifies specific axe-core rule violations and provides detailed DOM context including CSS selectors, XPath, and HTML snippets for code remediation.',
    inputSchema: {
      type: 'object',
      properties: {
        jiraContent: {
          type: 'string',
          description: 'The complete Jira issue content in markdown format'
        },
        useLLM: {
          type: 'boolean',
          description: 'Whether to use LLM for intelligent rule identification (default: true)'
        }
      },
      required: ['jiraContent']
    },
    async invoke(input, token) {
      const { jiraContent, useLLM = true } = input as { 
        jiraContent: string; 
        useLLM?: boolean; 
      };

      // Run accessibility analysis
      const result = await runAccessibilityAnalysis(jiraContent, { useLLM });

      // Format results for chat
      const formattedReport = formatViolationsForChat(result.violations);

      // Find code locations for each violation
      const codeLocations = [];
      for (const violation of result.violations) {
        const files = await findViolationInWorkspace(violation);
        codeLocations.push({
          violation: violation.ruleId,
          files: files.map(f => f.fsPath)
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: formattedReport
          },
          {
            type: 'text',
            text: `\n\n**Code Locations Found:**\n${JSON.stringify(codeLocations, null, 2)}`
          }
        ],
        metadata: {
          result,
          codeLocations
        }
      };
    }
  });

  context.subscriptions.push(a11yTool);
  return a11yTool;
}
```

### 2.3 Call the registration in extension activation
Update `apps/extension/src/extension.ts`:

```typescript
import { registerAccessibilityTool } from './providers/agentProvider';

export function activate(context: vscode.ExtensionContext) {
  // ... existing activation code ...
  
  // Register accessibility analyzer tool
  registerAccessibilityTool(context);
  
  // ... rest of activation ...
}
```

## Step 3: Configure Environment Variables

### 3.1 Create configuration provider
Create `apps/extension/src/config/a11y.ts`:

```typescript
import * as vscode from 'vscode';

export function getA11yConfig() {
  const config = vscode.workspace.getConfiguration('jiraA11y');
  
  return {
    llm: {
      enabled: config.get<boolean>('llm.enabled', true),
      provider: config.get<'openai' | 'claude'>('llm.provider', 'openai'),
      azureOpenAI: {
        endpoint: config.get<string>('llm.azureOpenAI.endpoint', ''),
        apiKey: config.get<string>('llm.azureOpenAI.apiKey', ''),
        deployment: config.get<string>('llm.azureOpenAI.deployment', '')
      }
    },
    test: {
      contextDepth: config.get<number>('test.contextDepth', 3)
    }
  };
}
```

### 3.2 Add configuration schema to package.json
Update `apps/extension/package.json`:

```json
{
  "contributes": {
    "configuration": {
      "title": "Jira Accessibility Testing",
      "properties": {
        "jiraA11y.llm.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable LLM-powered rule identification"
        },
        "jiraA11y.llm.provider": {
          "type": "string",
          "enum": ["openai", "claude"],
          "default": "openai",
          "description": "LLM provider to use"
        },
        "jiraA11y.llm.azureOpenAI.endpoint": {
          "type": "string",
          "default": "",
          "description": "Azure OpenAI endpoint URL"
        },
        "jiraA11y.llm.azureOpenAI.apiKey": {
          "type": "string",
          "default": "",
          "description": "Azure OpenAI API key"
        },
        "jiraA11y.llm.azureOpenAI.deployment": {
          "type": "string",
          "default": "",
          "description": "Azure OpenAI deployment name"
        },
        "jiraA11y.test.contextDepth": {
          "type": "number",
          "default": 3,
          "description": "How many ancestor levels to capture for DOM context"
        }
      }
    }
  }
}
```

### 3.3 Update the tool to use VS Code configuration
Modify `apps/extension/src/tools/a11y.ts` to use config:

```typescript
import { getA11yConfig } from '../config/a11y';

// Update the runAccessibilityAnalysis function
export async function runAccessibilityAnalysis(
  jiraContent: string,
  options?: {
    useLLM?: boolean;
    contextDepth?: number;
  }
): Promise<AnalysisResult> {
  const config = getA11yConfig();
  
  // Set environment variables for the package
  process.env.USE_LLM = String(options?.useLLM ?? config.llm.enabled);
  process.env.LLM_PROVIDER = config.llm.provider;
  process.env.AZURE_OPENAI_ENDPOINT = config.llm.azureOpenAI.endpoint;
  process.env.AZURE_OPENAI_API_KEY = config.llm.azureOpenAI.apiKey;
  process.env.AZURE_OPENAI_DEPLOYMENT = config.llm.azureOpenAI.deployment;
  process.env.CONTEXT_DEPTH = String(options?.contextDepth ?? config.test.contextDepth);

  try {
    const result = await analyzeAccessibility({
      jiraContent,
      useLLM: options?.useLLM ?? config.llm.enabled,
      contextDepth: options?.contextDepth ?? config.test.contextDepth,
      includeScreenshots: false
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Accessibility analysis failed: ${errorMessage}`);
  }
}
```

## Step 4: Build and Test

### 4.1 Build the package
```bash
cd packages/jira-playwright-a11y
pnpm build
```

### 4.2 Build the extension
```bash
cd ../../apps/extension
pnpm build
```

### 4.3 Test the integration
1. Open VS Code with the extension
2. Configure settings:
   - Open Settings (Cmd+,)
   - Search for "Jira Accessibility"
   - Add your Azure OpenAI credentials
3. Use the chat agent with a Jira issue description

## Step 5: Usage Example

### Agent Usage Flow
```typescript
// User in VS Code Chat:
// "Analyze this Jira accessibility issue: [paste jira.md content]"

// Agent response will:
// 1. Call accessibility-analyzer tool with Jira content
// 2. LLM identifies relevant axe-core rules
// 3. Playwright tests the URLs
// 4. Returns violations with DOM context
// 5. Searches workspace for matching code
// 6. Suggests fixes based on violation rules
```

## Expected Tool Output

The tool returns:
- **Identified Rules**: Array of axe-core rule IDs (e.g., `["aria-required-children"]`)
- **Violations**: Array of violations with:
  - CSS selector path
  - XPath
  - HTML element and context
  - Parent/ancestor elements
  - Fix guidance
- **Code Locations**: Files in workspace that contain the violating code

## Troubleshooting

### Package not found
```bash
pnpm install
pnpm build --filter @repo/jira-playwright-a11y
```

### Type errors
Ensure `packages/jira-playwright-a11y/tsconfig.json` has `"declaration": true`

### LLM errors
Check VS Code settings have valid Azure OpenAI credentials

## Files Created/Modified

**New Files:**
- `packages/jira-playwright-a11y/` (entire package)
- `apps/extension/src/tools/a11y.ts`
- `apps/extension/src/config/a11y.ts`

**Modified Files:**
- `pnpm-workspace.yaml`
- `apps/extension/package.json` (configuration schema)
- `apps/extension/src/providers/agentProvider.ts` (tool registration)
- `apps/extension/src/extension.ts` (activation)

## Next Steps

After integration:
1. Test with real Jira accessibility issues
2. Enhance workspace search with fuzzy matching
3. Add automated fix suggestions
4. Create tests for the tool wrapper
5. Document usage in extension README
