/**
 * LLM Client for identifying axe-core rules from Jira descriptions
 * Supports Azure OpenAI and Claude via Azure AI Foundry
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig } from './types.js';

// Comprehensive list of axe-core rule IDs
const AXE_CORE_RULES = [
  'aria-allowed-attr', 'aria-command-name', 'aria-conditional-attr', 'aria-deprecated-role',
  'aria-dialog-name', 'aria-hidden-body', 'aria-hidden-focus', 'aria-input-field-name',
  'aria-meter-name', 'aria-progressbar-name', 'aria-required-attr', 'aria-required-children',
  'aria-required-parent', 'aria-roledescription', 'aria-roles', 'aria-toggle-field-name',
  'aria-tooltip-name', 'aria-treeitem-name', 'aria-valid-attr-value', 'aria-valid-attr',
  'audio-caption', 'autocomplete-valid', 'avoid-inline-spacing', 'blink', 'button-name',
  'bypass', 'color-contrast', 'css-orientation-lock', 'definition-list', 'dlitem',
  'document-title', 'duplicate-id-active', 'duplicate-id-aria', 'duplicate-id',
  'empty-heading', 'empty-table-header', 'focus-order-semantics', 'form-field-multiple-labels',
  'frame-focusable-content', 'frame-tested', 'frame-title-unique', 'frame-title',
  'heading-order', 'hidden-content', 'html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch',
  'identical-links-same-purpose', 'image-alt', 'image-redundant-alt', 'input-button-name',
  'input-image-alt', 'label-content-name-mismatch', 'label-title-only', 'label',
  'landmark-banner-is-top-level', 'landmark-complementary-is-top-level', 'landmark-contentinfo-is-top-level',
  'landmark-main-is-top-level', 'landmark-no-duplicate-banner', 'landmark-no-duplicate-contentinfo',
  'landmark-no-duplicate-main', 'landmark-one-main', 'landmark-unique', 'link-in-text-block',
  'link-name', 'list', 'listitem', 'marquee', 'meta-refresh', 'meta-viewport-large',
  'meta-viewport', 'nested-interactive', 'no-autoplay-audio', 'object-alt', 'p-as-heading',
  'page-has-heading-one', 'presentation-role-conflict', 'region', 'role-img-alt',
  'scope-attr-valid', 'scrollable-region-focusable', 'select-name', 'server-side-image-map',
  'skip-link', 'svg-img-alt', 'tabindex', 'table-duplicate-name', 'table-fake-caption',
  'td-has-header', 'td-headers-attr', 'th-has-data-cells', 'valid-lang', 'video-caption'
];

const SYSTEM_PROMPT = `You are an accessibility expert analyzing Jira issue descriptions to identify relevant axe-core rule IDs.

Given a Jira issue description about accessibility problems, identify which axe-core rules are most likely violated.

Available axe-core rule IDs:
${AXE_CORE_RULES.join(', ')}

Common mappings:
- "required-owned elements" or "roles contain other roles" → aria-required-children
- "role requires a parent" or "must be contained by" → aria-required-parent
- "color contrast" → color-contrast
- "alt text" or "alternative text" → image-alt
- "form element" or "label" → label
- "heading order" → heading-order
- "link text" or "link must have" → link-name
- "button must have" → button-name
- "ARIA roles" or "ARIA attributes" → aria-* rules
- "list item" → listitem or aria-required-parent
- "tab index" or "keyboard" → tabindex
- "focus" → various focus-related rules

Analyze the description and return ONLY a JSON array of rule IDs, nothing else.
Example response: ["aria-required-children", "aria-required-parent"]

If no specific rules can be identified, return an empty array: []`;

/**
 * Creates an Azure OpenAI client
 */
function createAzureOpenAIClient(config: LLMConfig): OpenAI {
  if (!config.azureEndpoint || !config.apiKey) {
    throw new Error('Azure OpenAI endpoint and API key are required');
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: `${config.azureEndpoint}/openai/deployments/${config.deployment}`,
    defaultQuery: { 'api-version': '2024-08-01-preview' },
    defaultHeaders: { 'api-key': config.apiKey }
  });
}

/**
 * Creates an Anthropic client for Claude via Azure
 */
function createClaudeClient(config: LLMConfig): Anthropic {
  if (!config.azureEndpoint || !config.apiKey) {
    throw new Error('Azure Claude endpoint and API key are required');
  }

  return new Anthropic({
    baseURL: config.azureEndpoint,
    apiKey: config.apiKey
  });
}

/**
 * Identifies axe-core rules using Azure OpenAI
 */
async function identifyWithOpenAI(
  client: OpenAI,
  deployment: string,
  description: string,
  fullContent: string,
  temperature: number,
  maxTokens: number
): Promise<string[]> {
  const userPrompt = `Jira Issue Description:
${description}

Full Content:
${fullContent}

Which axe-core rule IDs are most relevant to this accessibility issue? Return only a JSON array.`;

  const response = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parse JSON response
  try {
    const parsed = JSON.parse(content);
    // Handle both {"rules": [...]} and direct array responses
    return Array.isArray(parsed) ? parsed : (parsed.rules || []);
  } catch (error) {
    console.error('Failed to parse OpenAI response:', content);
    return [];
  }
}

/**
 * Identifies axe-core rules using Claude
 */
async function identifyWithClaude(
  client: Anthropic,
  model: string,
  description: string,
  fullContent: string,
  temperature: number,
  maxTokens: number
): Promise<string[]> {
  const userPrompt = `Jira Issue Description:
${description}

Full Content:
${fullContent}

Which axe-core rule IDs are most relevant to this accessibility issue? Return only a JSON array.`;

  const response = await client.messages.create({
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: maxTokens,
    temperature,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userPrompt }
    ]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Extract JSON from response
  const text = content.text;
  try {
    // Look for JSON array in the response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (error) {
    console.error('Failed to parse Claude response:', text);
    return [];
  }
}

/**
 * Fallback keyword-based rule identification
 */
function identifyWithKeywords(description: string, fullContent: string): string[] {
  const rules: string[] = [];
  const lowerDesc = description.toLowerCase();
  const lowerContent = fullContent.toLowerCase();

  // ARIA roles that require owned elements
  if (lowerDesc.includes('required-owned elements') ||
      lowerDesc.includes('roles are designed to contain other roles') ||
      lowerDesc.includes('required owned elements')) {
    rules.push('aria-required-children');
  }

  // ARIA roles that require parent context
  if (lowerDesc.includes('role requires a parent') ||
      lowerDesc.includes('must be contained by') ||
      lowerContent.includes('listitem')) {
    rules.push('aria-required-parent');
  }

  // Color contrast issues
  if (lowerDesc.includes('color contrast') ||
      lowerDesc.includes('contrast ratio')) {
    rules.push('color-contrast');
  }

  // Missing alt text
  if (lowerDesc.includes('alt text') ||
      lowerDesc.includes('alternative text') ||
      lowerDesc.includes('image must have')) {
    rules.push('image-alt');
  }

  // Form labels
  if (lowerDesc.includes('form element') ||
      lowerDesc.includes('input must have') ||
      lowerDesc.includes('label')) {
    rules.push('label');
  }

  // Heading order
  if (lowerDesc.includes('heading order') ||
      lowerDesc.includes('heading levels')) {
    rules.push('heading-order');
  }

  // Link text
  if (lowerDesc.includes('link text') ||
      lowerDesc.includes('link must have')) {
    rules.push('link-name');
  }

  // Button text
  if (lowerDesc.includes('button must have') ||
      lowerDesc.includes('button text')) {
    rules.push('button-name');
  }

  return rules;
}

/**
 * Main function to identify axe-core rules from Jira description
 * Uses LLM if configured, falls back to keyword matching
 */
export async function identifyAxeRules(
  description: string,
  fullContent: string,
  llmConfig?: LLMConfig
): Promise<{ rules: string[]; usedLLM: boolean }> {
  // If no LLM config, use keyword matching
  if (!llmConfig) {
    const rules = identifyWithKeywords(description, fullContent);
    return { rules, usedLLM: false };
  }

  try {
    let rules: string[] = [];

    if (llmConfig.provider === 'openai') {
      if (!llmConfig.deployment) {
        throw new Error('Azure OpenAI deployment name is required');
      }
      const client = createAzureOpenAIClient(llmConfig);
      rules = await identifyWithOpenAI(
        client,
        llmConfig.deployment,
        description,
        fullContent,
        llmConfig.temperature || 0.3,
        llmConfig.maxTokens || 500
      );
    } else if (llmConfig.provider === 'claude') {
      const client = createClaudeClient(llmConfig);
      rules = await identifyWithClaude(
        client,
        llmConfig.model || 'claude-3-5-sonnet-20241022',
        description,
        fullContent,
        llmConfig.temperature || 0.3,
        llmConfig.maxTokens || 500
      );
    }

    // Validate that returned rules are actual axe-core rules
    const validRules = rules.filter(rule => AXE_CORE_RULES.includes(rule));

    if (validRules.length === 0) {
      console.warn('LLM returned no valid rules, falling back to keyword matching');
      const fallbackRules = identifyWithKeywords(description, fullContent);
      return { rules: fallbackRules, usedLLM: false };
    }

    return { rules: validRules, usedLLM: true };
  } catch (error) {
    console.error('LLM rule identification failed:', error);
    console.log('Falling back to keyword matching');
    const rules = identifyWithKeywords(description, fullContent);
    return { rules, usedLLM: false };
  }
}

export { AXE_CORE_RULES };
