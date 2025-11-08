/**
 * Integration Test Suite
 * 
 * Tests the actual running server at https://todoist.ssc.one
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { acquireTestServer, releaseTestServer } from '../helpers/test-server.js';

const DEFAULT_BASE_URL = 'https://todoist.ssc.one';
let baseUrl = process.env.TEST_BASE_URL || DEFAULT_BASE_URL;
let serverInfo;
let skipSuite = false;

before(async () => {
  try {
    serverInfo = await acquireTestServer();
    baseUrl = serverInfo.baseUrl;
  } catch (error) {
    skipSuite = true;
    console.warn(`⚠️  Skipping integration tests: ${error instanceof Error ? error.message : error}`);
  }
});

after(async () => {
  if (!skipSuite) {
  await releaseTestServer();
  }
});

function getAuthHeaders() {
  const token =
    serverInfo?.token ||
    process.env.GITHUB_OAUTH_BEARER_TOKEN ||
    process.env.MCP_ALLOWED_TOKENS?.split(',')[0]?.trim();
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}
test('Health check endpoint responds', async (t) => {
  if (skipSuite) {
    t.skip('Integration tests disabled (MCP test server unavailable)');
    return;
  }

  const response = await fetch(`${baseUrl}/health`);
  assert.strictEqual(response.ok, true, 'Health endpoint should return 200');
  
  const data = await response.json();
  assert.strictEqual(data.status, 'ok');
  assert.strictEqual(data.server, 'todoist-mcp-server-http');
});

test('MCP unauthorized without bearer token', async (t) => {
  if (skipSuite) {
    t.skip('Integration tests disabled (MCP test server unavailable)');
    return;
  }

  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    })
  });
  assert.strictEqual(response.status, 401, 'Unauthorized should return 401');
});

test('MCP initialize creates session (authorized)', async (t) => {
  if (skipSuite) {
    t.skip('Integration tests disabled (MCP test server unavailable)');
    return;
  }

  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    })
  });

  assert.strictEqual(response.ok, true, 'Initialize should return 200');
  
  const sessionId = response.headers.get('mcp-session-id');
  assert.ok(sessionId, 'Should return session ID in header');
  
  // MCP returns text/event-stream format
  const text = await response.text();
  const eventData = text.split('\n').find(line => line.startsWith('data: '));
  assert.ok(eventData, 'Should have event data');
  
  const data = JSON.parse(eventData.replace('data: ', ''));
  assert.strictEqual(data.result.serverInfo.name, 'todoist-mcp-server-http');
});

test('MCP tools/list includes ULID-only tools (authorized)', async (t) => {
  if (skipSuite) {
    t.skip('Integration tests disabled (MCP test server unavailable)');
    return;
  }

  // First initialize
  const initResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    })
  });

  const sessionId = initResponse.headers.get('mcp-session-id');
  assert.ok(sessionId, 'Should have session ID');

  // Then list tools
  const toolsResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Mcp-Session-Id': sessionId,
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    })
  });

  assert.strictEqual(toolsResponse.ok, true, 'tools/list should return 200');
  
  // MCP returns text/event-stream format
  const text = await toolsResponse.text();
  const eventData = text.split('\n').find(line => line.startsWith('data: '));
  assert.ok(eventData, 'Should have event data');
  
  const data = JSON.parse(eventData.replace('data: ', ''));
  const toolNames = data.result.tools.map(t => t.name);
  
  assert.ok(toolNames.includes('todoist_create_section'), 'Should include todoist_create_section');
  assert.ok(toolNames.includes('todoist_rename_section'), 'Should include todoist_rename_section');
  assert.ok(toolNames.includes('todoist_create_project'), 'Should include todoist_create_project');
  assert.ok(toolNames.includes('todoist_create_task'), 'Should include todoist_create_task');
  assert.ok(toolNames.every(name => name.startsWith('todoist_')), 'Tool names should be todoist_* prefixed');
  
  console.log(`✅ Found ${toolNames.length} tools including new section tools`);
});
