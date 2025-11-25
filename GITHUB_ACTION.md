# GitHub Action: Website Accessibility Scanner

Automatically crawl your website, run accessibility tests, and create GitHub issues for violations.

## Features

- 🕷️ **Intelligent Crawling**: Discovers all pages on your website automatically
- 🔍 **Comprehensive Testing**: Runs axe-core accessibility tests on every page
- 📊 **Smart Grouping**: Combines identical violations across multiple pages into single issues
- 🎯 **Deduplication**: Prevents duplicate issues for the same code violation
- 🔄 **Auto-Update**: Updates existing issues when violations change
- ✅ **Auto-Close**: Closes issues when violations are fixed
- 📝 **Detailed Reports**: Provides CSS selectors, XPath, and HTML context for each violation

## Quick Start

### 1. Add Workflow to Your Repository

Create `.github/workflows/a11y-scan.yml`:

```yaml
name: Accessibility Scan

on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM UTC
  workflow_dispatch:     # Allow manual trigger

permissions:
  contents: read
  issues: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npx playwright install chromium --with-deps
      - run: npm run build
      - run: node dist/action.js
        env:
          WEBSITE_URL: ${{ secrets.WEBSITE_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Configure Repository Secrets

Go to **Settings → Secrets and variables → Actions** and add:

- `WEBSITE_URL`: Your website URL (e.g., `https://example.com`)

### 3. Run the Workflow

- **Automatic**: Runs weekly on schedule
- **Manual**: Go to **Actions** tab → **Accessibility Scan** → **Run workflow**

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WEBSITE_URL` | ✅ | - | Base URL of website to scan |
| `MAX_PAGES` | ❌ | `50` | Maximum number of pages to crawl |
| `MAX_DEPTH` | ❌ | `3` | Maximum crawl depth from base URL |
| `CONTEXT_DEPTH` | ❌ | `3` | DOM ancestor levels to capture |
| `INCLUDE_PATTERNS` | ❌ | `[]` | URL patterns to include (JSON array) |
| `EXCLUDE_PATTERNS` | ❌ | See below | URL patterns to exclude (JSON array) |

**Default Exclude Patterns**:
```json
["/api/", "/admin/", ".pdf", ".zip", ".jpg", ".png", ".gif", ".svg", "/cdn-cgi/"]
```

### Advanced Configuration

#### Custom Include/Exclude Patterns

```yaml
- run: node dist/action.js
  env:
    WEBSITE_URL: https://example.com
    INCLUDE_PATTERNS: '["/blog/", "/docs/"]'
    EXCLUDE_PATTERNS: '["/draft/", "/test/"]'
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### Workflow Dispatch Inputs

Allow manual customization:

```yaml
on:
  workflow_dispatch:
    inputs:
      website_url:
        description: 'Website URL to scan'
        required: true
        type: string
      max_pages:
        description: 'Maximum pages to crawl'
        required: false
        default: '50'
        type: string

jobs:
  scan:
    steps:
      - run: node dist/action.js
        env:
          WEBSITE_URL: ${{ inputs.website_url }}
          MAX_PAGES: ${{ inputs.max_pages }}
```

## How It Works

### 1. Crawling
The action discovers pages by:
- Starting at the base URL
- Following internal links
- Respecting `robots.txt`
- Applying include/exclude patterns
- Limiting by depth and page count

### 2. Testing
For each page:
- Loads page with Playwright
- Runs axe-core accessibility scan
- Captures DOM context (ancestors, siblings, CSS selectors)
- Records all violations

### 3. Grouping
Violations are grouped by **code signature**:
- Same HTML structure = same violation
- Even if on different pages
- Creates one issue listing all affected pages

**Example**:
```
Page A: <button>Click</button>  ← Missing accessible name
Page B: <button>Submit</button> ← Missing accessible name
Page C: <button>Go</button>     ← Missing accessible name

Result: ONE issue listing Pages A, B, and C
```

### 4. Issue Management
- **New violations** → Creates new issue
- **Existing violations** → Updates issue with latest data
- **Fixed violations** → Closes issue automatically

## Issue Format

Each issue includes:

### Header
```markdown
# aria-required-children

![impact-critical](badge) ![wcag2a](badge)
```

### Details
- **Description**: What the violation is
- **How to Fix**: Step-by-step guidance
- **Impact**: Severity level
- **WCAG Tags**: Relevant standards

### Code Location
```markdown
**Selector**: `body > div.header > nav#nav > ul:nth-of-type(1)`
**XPath**: `/html/body/div[1]/nav/ul[1]`

**HTML**:
```html
<ul role="list">...</ul>
```

### Affected Pages
```markdown
- [https://example.com/home](url) (2 instances)
- [https://example.com/about](url) (1 instance)
- [https://example.com/contact](url) (1 instance)
```

### Remediation Steps
1. Search codebase for CSS selector
2. Locate matching HTML
3. Apply suggested fix
4. Test on all affected pages

## Labels

Issues are automatically tagged with:
- `accessibility`
- `a11y:{rule-id}` (e.g., `a11y:button-name`)
- `impact:{level}` (e.g., `impact:critical`)
- WCAG tags (e.g., `wcag2a`, `wcag21aa`)

## Outputs

The action provides these outputs (for use in subsequent steps):

```yaml
- id: scan
  run: node dist/action.js
  
- run: echo "Scanned ${{ steps.scan.outputs.pages_scanned }} pages"
- run: echo "Found ${{ steps.scan.outputs.total_violations }} violations"
- run: echo "Created ${{ steps.scan.outputs.issues_created }} issues"
```

Available outputs:
- `pages_scanned`
- `total_violations`
- `unique_violations`
- `issues_created`
- `issues_updated`

## Example Workflows

### Weekly Scan with Notifications

```yaml
name: Weekly Accessibility Audit

on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 9 AM

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install && npm run build
      - id: scan
        run: node dist/action.js
        env:
          WEBSITE_URL: ${{ secrets.WEBSITE_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Notify team
        if: steps.scan.outputs.issues_created > 0
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "🚨 New accessibility issues found!",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Accessibility Scan Results*\n• Issues Created: ${{ steps.scan.outputs.issues_created }}\n• Total Violations: ${{ steps.scan.outputs.total_violations }}"
                  }
                }
              ]
            }
```

### Pre-Deployment Check

```yaml
name: Pre-Deploy A11y Check

on:
  pull_request:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install && npm run build
      
      # Deploy to staging
      - name: Deploy to staging
        run: ./deploy-staging.sh
        
      # Scan staging site
      - id: scan
        run: node dist/action.js
        env:
          WEBSITE_URL: https://staging.example.com
          MAX_PAGES: 20
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      # Fail if critical issues found
      - name: Check for critical issues
        run: |
          if [ "${{ steps.scan.outputs.issues_created }}" -gt "0" ]; then
            echo "❌ Critical accessibility issues found!"
            exit 1
          fi
```

## Troubleshooting

### Action Fails to Create Issues

**Problem**: `Error: Resource not accessible by integration`

**Solution**: Ensure workflow has `issues: write` permission:
```yaml
permissions:
  contents: read
  issues: write
```

### Crawl Finds No Pages

**Problem**: Crawler returns 0 pages

**Solutions**:
- Check `WEBSITE_URL` is correct and accessible
- Verify site allows crawling (check `robots.txt`)
- Increase `MAX_DEPTH` if site has deep navigation
- Check `EXCLUDE_PATTERNS` aren't too broad

### Too Many Issues Created

**Problem**: Action creates hundreds of issues

**Solutions**:
- Reduce `MAX_PAGES` initially: start with 10-20 pages
- Use `INCLUDE_PATTERNS` to focus on specific sections
- Fix widespread violations (like missing alt text) first
- Run locally before deploying action

### Duplicate Issues

**Problem**: Multiple issues for same violation

**This shouldn't happen!** The action uses code signatures to prevent duplicates.

If you see duplicates:
1. Check issue body for `Signature:` field
2. Report the bug with example violations
3. Manually close duplicate issues

## Performance Tips

1. **Start Small**: Use `MAX_PAGES: 10` initially
2. **Focus Areas**: Use `INCLUDE_PATTERNS` for specific sections
3. **Schedule Wisely**: Avoid peak hours
4. **Parallel Scans**: Run separate workflows for different site sections

## Local Testing

Test the action locally before deploying:

```bash
# Set environment variables
export WEBSITE_URL=https://example.com
export MAX_PAGES=5
export GITHUB_TOKEN=ghp_your_token
export GITHUB_REPOSITORY_OWNER=your-username
export GITHUB_REPOSITORY=your-username/your-repo

# Build and run
npm run build
node dist/action.js
```

## Best Practices

1. **Start with Manual Runs**: Use `workflow_dispatch` before scheduling
2. **Monitor First Run**: Check logs and issues carefully
3. **Triage Issues**: Label high-priority violations
4. **Regular Reviews**: Check closed issues to confirm fixes
5. **Update Exclusions**: Refine patterns based on results

## Integration with CI/CD

### Block Deployments on Critical Issues

```yaml
- id: scan
  run: node dist/action.js
  continue-on-error: true

- name: Check results
  run: |
    if [ "${{ steps.scan.outputs.issues_created }}" -gt "0" ]; then
      echo "::error::Accessibility issues found!"
      exit 1
    fi
```

### Require Review for Issues

```yaml
- run: gh pr review ${{ github.event.pull_request.number }} --comment --body "⚠️ Accessibility issues found. Review required."
  if: steps.scan.outputs.issues_created > 0
```

## Support

- **Issues**: [GitHub Issues](https://github.com/jkochis/jira-playwright-a11y/issues)
- **Docs**: [Main README](./README.md)
- **Integration**: [Integration Instructions](./INTEGRATION_INSTRUCTIONS.md)

## License

ISC
