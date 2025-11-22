import dotenv from 'dotenv';
import type { Config, LLMProvider } from './types.js';

dotenv.config();

export const config: Config = {
  jira: {
    host: process.env.JIRA_HOST,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    issueKey: process.env.JIRA_ISSUE_KEY
  },
  test: {
    targetUrl: process.env.TARGET_URL,
    headless: process.env.HEADLESS !== 'false',
    timeout: parseInt(process.env.TIMEOUT || '30000', 10),
    includeScreenshots: process.env.INCLUDE_SCREENSHOTS !== 'false',
    contextDepth: parseInt(process.env.CONTEXT_DEPTH || '3', 10)
  },
  mcp: {
    enabled: process.env.USE_MCP === 'true',
    serverUrl: process.env.MCP_SERVER_URL || 'http://localhost:3000'
  },
  axe: {
    rules: process.env.AXE_RULES ? JSON.parse(process.env.AXE_RULES) : null,
    wcagLevel: process.env.WCAG_LEVEL || 'AA',
    tags: process.env.AXE_TAGS
      ? JSON.parse(process.env.AXE_TAGS)
      : ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  },
  llm: {
    enabled: process.env.USE_LLM === 'true',
    provider: (process.env.LLM_PROVIDER || 'openai') as LLMProvider,
    azureOpenAI: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT
    },
    azureClaude: {
      endpoint: process.env.AZURE_CLAUDE_ENDPOINT,
      apiKey: process.env.AZURE_CLAUDE_API_KEY,
      model: process.env.AZURE_CLAUDE_MODEL || 'claude-3-5-sonnet-20241022'
    },
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '500', 10)
  }
};

export default config;
