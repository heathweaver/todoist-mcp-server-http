import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createHash, randomUUID } from 'crypto';
import { acquireTestServer, releaseTestServer } from './helpers/test-server.js';

let serverInfo;
let registeredClient;

const originalFetch = globalThis.fetch;

function installGitHubFetchMock(login = 'github-user') {
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

    if (url.startsWith('https://github.com/login/oauth/access_token')) {
      return new Response(
        JSON.stringify({
          access_token: `github-token-${randomUUID()}`,
          token_type: 'bearer',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    if (url.startsWith('https://api.github.com/user')) {
      return new Response(
        JSON.stringify({
          login,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    return originalFetch(input, init);
  };
}

function restoreFetchMock() {
  globalThis.fetch = originalFetch;
}

function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createCodeChallenge(codeVerifier) {
  return toBase64Url(createHash('sha256').update(codeVerifier).digest());
}

async function runPkceAuthorization({
  clientId,
  redirectUri,
  clientState = 'openai-state',
  scope,
} = {}) {
  if (!clientId || !redirectUri || !scope) {
    throw new Error('Client must be registered before running PKCE authorization');
  }
  const codeVerifier = `verifier-${Math.random().toString(36).slice(2)}`;
  const codeChallenge = createCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: clientState,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope,
  });

  const authResponse = await fetch(`${serverInfo.baseUrl}/oauth/authorize?${params.toString()}`, {
    redirect: 'manual',
  });

  assert.strictEqual(authResponse.status, 302, 'authorize should redirect to GitHub');
  const location = authResponse.headers.get('location');
  assert.ok(location, 'authorize should include redirect location');

  const githubUrl = new URL(location);
  assert.ok(
    githubUrl.hostname.includes('github.com'),
    'authorize redirect should target GitHub'
  );

  const githubState = githubUrl.searchParams.get('state');
  assert.ok(githubState, 'GitHub state parameter should be present');

  installGitHubFetchMock();
  try {
    const callbackResponse = await fetch(
      `${serverInfo.baseUrl}/auth/github/callback?code=test-github-code&state=${githubState}`,
      { redirect: 'manual' }
    );

    assert.strictEqual(callbackResponse.status, 302, 'callback should redirect to client');
    const clientLocation = callbackResponse.headers.get('location');
    assert.ok(clientLocation, 'callback redirect should include location');

    const clientUrl = new URL(clientLocation);
    assert.strictEqual(clientUrl.origin + clientUrl.pathname, redirectUri, 'callback should redirect to client redirect_uri');
    assert.strictEqual(clientUrl.searchParams.get('state'), clientState, 'client state should be preserved');

    const authorizationCode = clientUrl.searchParams.get('code');
    assert.ok(authorizationCode, 'authorization code should be issued');

    return {
      authorizationCode,
      codeVerifier,
      clientId,
      redirectUri,
      scope,
    };
  } finally {
    restoreFetchMock();
  }
}

async function registerClient(options = {}) {
  const redirectUri = options.redirect_uri || 'com.openai.chat://oauth/callback';
  const scope = options.scope || 'todoist.read todoist.write';

  const response = await fetch(`${serverInfo.baseUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: options.client_name || 'OpenAI Integration Test',
      redirect_uris: [redirectUri],
      scope,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  assert.strictEqual(response.status, 201, 'client registration should succeed');
  const payload = await response.json();
  assert.ok(payload.client_id, 'client_id must be returned');
  assert.ok(Array.isArray(payload.redirect_uris));
  assert.strictEqual(payload.scope, scope);
  assert.strictEqual(payload.redirect_uris[0], redirectUri);

  return {
    clientId: payload.client_id,
    redirectUri,
    scope,
  };
}

before(async () => {
  serverInfo = await acquireTestServer();
  registeredClient = await registerClient();
});

after(async () => {
  await releaseTestServer();
  restoreFetchMock();
});

test('OpenAI PKCE flow produces usable access token for MCP calls', async () => {
  const { authorizationCode, codeVerifier, clientId, redirectUri, scope } = await runPkceAuthorization({
    clientId: registeredClient.clientId,
    redirectUri: registeredClient.redirectUri,
    scope: registeredClient.scope,
  });

  const tokenResponse = await fetch(`${serverInfo.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  assert.strictEqual(tokenResponse.ok, true, 'token endpoint should accept valid PKCE exchange');
  const tokenJson = await tokenResponse.json();
  assert.ok(tokenJson.access_token, 'access token should be returned');
  assert.strictEqual(tokenJson.token_type, 'Bearer');
  assert.strictEqual(tokenJson.scope, scope);

  const bearer = tokenJson.access_token;

  const initResponse = await fetch(`${serverInfo.baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'openai-test-client', version: '1.0.0' },
      },
    }),
  });

  assert.strictEqual(initResponse.ok, true, 'MCP initialize should succeed with issued token');
  const sessionId = initResponse.headers.get('mcp-session-id');
  assert.ok(sessionId, 'session id should be present when token is valid');

  const raw = await initResponse.text();
  const eventLine = raw.split('\n').find(line => line.startsWith('data: '));
  assert.ok(eventLine, 'initialize should stream JSON result');
  const data = JSON.parse(eventLine.replace('data: ', ''));
  assert.strictEqual(data.result.serverInfo.name, 'todoist-mcp-server-http');

  const replayResponse = await fetch(`${serverInfo.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  assert.strictEqual(replayResponse.status, 400, 'authorization codes must be single-use');
  const replayJson = await replayResponse.json();
  assert.strictEqual(replayJson.error, 'invalid_grant');
});

test('Rejects OAuth authorization request without PKCE parameters', async () => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: registeredClient.clientId,
    redirect_uri: registeredClient.redirectUri,
    state: 'openai-state',
  });

  const response = await fetch(`${serverInfo.baseUrl}/oauth/authorize?${params.toString()}`);
  assert.strictEqual(response.status, 400, 'PKCE parameters are required');

  const payload = await response.json();
  assert.strictEqual(payload.error, 'invalid_request');
  assert.ok(payload.error_description.includes('code_challenge'), 'error message should reference PKCE requirement');
});

test('Rejects token exchange when PKCE verifier does not match challenge', async () => {
  const { authorizationCode, codeVerifier, clientId, redirectUri, scope } = await runPkceAuthorization({
    clientId: registeredClient.clientId,
    redirectUri: registeredClient.redirectUri,
    scope: registeredClient.scope,
  });

  const response = await fetch(`${serverInfo.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: `${codeVerifier}-mismatch`,
    }),
  });

  assert.strictEqual(response.status, 400, 'Invalid PKCE verifier should be rejected');
  const payload = await response.json();
  assert.strictEqual(payload.error, 'invalid_grant');
  assert.ok(payload.error_description.includes('PKCE'));
});

test('Client registration validates metadata', async () => {
  const missingRedirectResponse = await fetch(`${serverInfo.baseUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Invalid client',
    }),
  });

  assert.strictEqual(missingRedirectResponse.status, 400, 'redirect_uris are required');
  const missingRedirectJson = await missingRedirectResponse.json();
  assert.strictEqual(missingRedirectJson.error, 'invalid_client_metadata');

  const unsupportedMethodResponse = await fetch(`${serverInfo.baseUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Secret client',
      redirect_uris: ['https://client.example/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    }),
  });

  assert.strictEqual(unsupportedMethodResponse.status, 400, 'unsupported auth method should be rejected');
  const unsupportedMethodJson = await unsupportedMethodResponse.json();
  assert.strictEqual(unsupportedMethodJson.error, 'invalid_client_metadata');
  assert.ok(unsupportedMethodJson.error_description.includes('public clients using PKCE'));
});

