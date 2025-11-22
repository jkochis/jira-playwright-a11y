import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Creates and initializes an MCP client for Playwright
 */
export async function createMCPClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-playwright']
  });

  const client = new Client({
    name: 'jira-playwright-a11y-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  await client.connect(transport);
  console.log('✓ MCP Playwright server connected');

  return client;
}

/**
 * Executes a Playwright action via MCP
 */
export async function executeMCPAction(
  client: Client,
  action: string,
  params: Record<string, any>
): Promise<any> {
  try {
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: action,
          arguments: params
        }
      },
      {} as any
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`MCP action ${action} failed:`, errorMessage);
    throw error;
  }
}

/**
 * Lists available Playwright tools from MCP server
 */
export async function listMCPTools(client: Client): Promise<any[]> {
  try {
    const result: any = await client.request(
      {
        method: 'tools/list'
      },
      {} as any
    );

    return result.tools || [];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to list MCP tools:', errorMessage);
    throw error;
  }
}

/**
 * Closes the MCP client connection
 */
export async function closeMCPClient(client: Client): Promise<void> {
  await client.close();
  console.log('✓ MCP client disconnected');
}
