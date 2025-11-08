/**
 * Authentication Test Suite
 * 
 * Tests the GitHub OAuth authentication flow and bearer token validation
 * for the MCP server endpoints.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { acquireTestServer, releaseTestServer } from './helpers/test-server.js';

let serverInfo;
let skipSuite = false;

before(async () => {
  try {
  serverInfo = await acquireTestServer();
  } catch (error) {
    skipSuite = true;
    console.warn(`⚠️  Skipping auth tests: ${error instanceof Error ? error.message : error}`);
  }
});

after(async () => {
  if (!skipSuite) {
  await releaseTestServer();
  }
});

const BASE_URL = () => serverInfo?.baseUrl || process.env.TEST_BASE_URL || 'https://todoist.ssc.one';
const TEST_TOKEN = process.env.GITHUB_OAUTH_BEARER_TOKEN || 'test-token-for-auth-test';

test('Health check endpoint is public (no auth required)', async (t) => {
  if (skipSuite) {
    t.skip('Auth tests disabled (MCP test server unavailable)');
    return;
  }

  const response = await fetch(`${BASE_URL()}/health`);
  assert.strictEqual(response.ok, true, 'Health endpoint should return 200');
  
  const data = await response.json();
  assert.strictEqual(data.status, 'ok');
  assert.strictEqual(data.server, 'todoist-mcp-server-http');
});

test('OAuth login endpoint redirects to GitHub', async (t) => {
  if (skipSuite) {
    t.skip('Auth tests disabled (MCP test server unavailable)');
    return;
  }

  const response = await fetch(`${BASE_URL()}/auth/github/login`, {
    redirect: 'manual'
  });
  
  // Should redirect (302) to GitHub OAuth
  assert.ok(
    response.status === 302 || response.status === 301,
    `OAuth login should redirect, got ${response.status}`
  );
  
  const location = response.headers.get('location');
  assert.ok(location, 'Should have location header');
  assert.ok(
    location.includes('github.com/login/oauth/authorize'),
    'Should redirect to GitHub OAuth'
  );
});

test('OAuth callback endpoint requires code parameter', async (t) => {
  if (skipSuite) {
    t.skip('Auth tests disabled (MCP test server unavailable)');
    return;
  }

  const response = await fetch(`${BASE_URL()}/auth/github/callback`);
  
  // Should return error without code
  assert.ok(
    response.status >= 400,
    'Callback without code should return error'
  );
});

test('MCP endpoint requires bearer token (unauthorized without token)', async (t) => {
  if (skipSuite) {
    t.skip('Auth tests disabled (MCP test server unavailable)');
    return;
  }

  const response = await fetch(`${BASE_URL()}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
  
  assert.strictEqual(response.status, 401, 'Should return 401 Unauthorized');
  
  const wwwAuth = response.headers.get('www-authenticate');
  assert.ok(wwwAuth, 'Should include WWW-Authenticate header');
  assert.ok(wwwAuth?.includes('authorization_uri'), 'WWW-Authenticate should advertise authorization_uri');
  assert.ok(wwwAuth?.includes('token_uri'), 'WWW-Authenticate should advertise token_uri');
  assert.ok(wwwAuth?.includes('registration_uri'), 'WWW-Authenticate should advertise registration_uri');

  const data = await response.json();
  assert.strictEqual(data.error.code, -32001);
  assert.ok(
    data.error.message.includes('Missing bearer token') ||
      data.error.message.includes('Invalid or expired bearer token'),
    'Should provide meaningful unauthorized message'
  );
});

test('OAuth discovery endpoints are available', async (t) => {
  if (skipSuite) {
    t.skip('Auth tests disabled (MCP test server unavailable)');
    return;
  }

  const authzResponse = await fetch(`${BASE_URL()}/.well-known/oauth-authorization-server`);
  assert.strictEqual(authzResponse.ok, true, 'Authorization server metadata should be available');
  const authzData = await authzResponse.json();
  assert.ok(authzData.authorization_endpoint?.includes('/oauth/authorize'));
  assert.ok(authzData.token_endpoint?.includes('/oauth/token'));
  assert.ok(authzData.registration_endpoint?.includes('/oauth/register'));
  assert.ok(Array.isArray(authzData.scopes_supported), 'scopes_supported should be an array');

  const resourceResponse = await fetch(`${BASE_URL()}/.well-known/oauth-protected-resource`);
  assert.strictEqual(resourceResponse.ok, true, 'Protected resource metadata should be available');
  const resourceData = await resourceResponse.json();
  assert.ok(Array.isArray(resourceData.authorization_servers), 'authorization_servers should be an array');
  assert.ok(resourceData.authorization_servers[0]);

  const manifestResponse = await fetch(`${BASE_URL()}/.well-known/mcp/manifest.json`);
  assert.strictEqual(manifestResponse.ok, true, 'MCP manifest should be available');
  const manifestData = await manifestResponse.json();
  assert.strictEqual(manifestData.name, 'todoist-mcp-server-http');
  assert.ok(Array.isArray(manifestData.transports));
  assert.strictEqual(manifestData.oauth?.authorization_server?.token_endpoint, `${BASE_URL()}/oauth/token`);
});

test('MCP endpoint accepts valid bearer token (if token set in env)', async (t) => {
  if (skipSuite) {
    t.skip('Auth tests disabled (MCP test server unavailable)');
    return;
  }

  // Skip if no test token provided
  if (!process.env.GITHUB_OAUTH_BEARER_TOKEN && !process.env.MCP_ALLOWED_TOKENS) {
    console.log('⚠️  Skipping: No GITHUB_OAUTH_BEARER_TOKEN or MCP_ALLOWED_TOKENS set in env');
    return;
  }
  
  const token = process.env.GITHUB_OAUTH_BEARER_TOKEN || 
                process.env.MCP_ALLOWED_TOKENS?.split(',')[0]?.trim();
  
  const response = await fetch(`${BASE_URL()}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
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
  
  assert.strictEqual(response.ok, true, 'Should accept valid bearer token');
  const sessionId = response.headers.get('mcp-session-id');
  assert.ok(sessionId, 'Should return session ID in header');
});

