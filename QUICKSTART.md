# Quick Start Guide

Get up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
npm run install-browsers
```

## Step 2: Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your details:

```env
# For testing with a direct URL (easiest to start)
TARGET_URL=https://example.com

# For Jira integration (optional)
JIRA_HOST=your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_ISSUE_KEY=PROJ-123
```

## Step 3: Run Your First Test

Test any website:

```bash
npm test
```

## What You'll See

1. **Console output** showing:
   - Page loading progress
   - Violation counts by severity
   - Detailed accessibility issues

2. **JSON report** in `test-results/` with:
   - Complete violation details
   - Screenshots (when issues found)
   - WCAG guideline references

## Example Output

```
🚀 Jira + Playwright + Axe Accessibility Tester

🔍 Testing accessibility for: https://example.com
✓ Page loaded
✓ Axe scan complete
✓ Screenshot captured

================================================================================
📊 Results for https://example.com
================================================================================
Total Violations: 5
  Critical: 1
  Serious: 2
  Moderate: 1
  Minor: 1

⚠️  Found 5 accessibility violation(s):

1. color-contrast [SERIOUS]
   Description: Elements must have sufficient color contrast
   ...
```

## Next Steps

- Read the full [README.md](README.md) for advanced features
- Set up Jira integration to automatically test issues
- Configure MCP for enhanced Playwright control
- Customize Axe rules in `config.js`

## Common First-Time Issues

**"Cannot find module"**: Run `npm install` first

**"Executable doesn't exist"**: Run `npm run install-browsers`

**"URL required"**: Set `TARGET_URL` in your `.env` file

**Jira connection fails**: Make sure `JIRA_HOST` doesn't include `https://`
