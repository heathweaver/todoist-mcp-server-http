#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key || process.env[key]) continue;
    const value = line.slice(idx + 1).trim();
    const trimmed = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    process.env[key] = trimmed;
  }
}

const baseUrl = process.env.MCP_BASE_URL || 'https://todoist.ssc.one';
const accessToken = process.env.MCP_ACCESS_TOKEN;

if (!accessToken) {
  console.error('Missing MCP_ACCESS_TOKEN environment variable.');
  process.exit(1);
}

const argTaskId = process.argv[2] || process.env.MCP_TASK_ID;
const argProjectId = process.argv[3] || process.env.MCP_PROJECT_ID;
const argSectionIdRaw = process.argv[4] ?? process.env.MCP_SECTION_ID;

if (!argTaskId || !argProjectId) {
  console.error('Usage: node scripts/manual/repro-update-task.mjs <task_id> <project_id> [section_id|null]');
  process.exit(1);
}

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function ensureUlid(value, field) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const stringValue = String(value);
  if (!ULID_REGEX.test(stringValue)) {
    throw new Error(`${field} must be a ULID (received ${stringValue})`);
  }
  return stringValue;
}

const taskId = ensureUlid(argTaskId, 'task_id');
const projectId = ensureUlid(argProjectId, 'project_id');
const sectionId = argSectionIdRaw === undefined
  ? undefined
  : ensureUlid(argSectionIdRaw === null || String(argSectionIdRaw).toLowerCase() === 'null' ? null : argSectionIdRaw, 'section_id');

let requestId = 0;

function nextRequestId() {
  requestId += 1;
  return requestId;
}

function parseEventStream(text) {
  return text
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice(6))
    .filter(Boolean)
    .map(chunk => {
      try {
        return JSON.parse(chunk);
      } catch (error) {
        return { parseError: error instanceof Error ? error.message : String(error), raw: chunk };
      }
    });
}

async function sendMcpRequest(method, params, sessionId) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${accessToken}`,
  };

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const envelope = {
    jsonrpc: '2.0',
    id: nextRequestId(),
    method,
    params,
  };

  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(envelope, null, 2),
  });

  const resultText = await response.text();
  const events = parseEventStream(resultText);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    events,
    raw: resultText,
  };
}

async function main() {
  console.log('== MCP debug script ==');
  console.log('Base URL:', baseUrl);

  // Step 1: initialize session
  const initResponse = await sendMcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'todoist-update-debug',
      version: '1.0.0',
    },
  });
  const sessionId = initResponse.headers.get('mcp-session-id');

  if (!sessionId) {
    console.error('Failed to obtain MCP session ID. Response:', initResponse);
    process.exit(1);
  }

  console.log('\n-- initialize response --');
  console.log('Status:', initResponse.status, initResponse.statusText);
  console.log('Session ID:', sessionId);
  initResponse.events.forEach((event, index) => {
    console.log(`Event[${index}]:`, JSON.stringify(event, null, 2));
  });

  // Step 2: fetch current task
  const getTasksParams = {
    name: 'todoist_get_tasks',
    arguments: {
      ids: [String(argTaskId)],
      limit: 10,
    },
  };

  const getTasksResponse = await sendMcpRequest('tools/call', getTasksParams, sessionId);
  console.log('\n-- todoist_get_tasks response --');
  console.log('Status:', getTasksResponse.status, getTasksResponse.statusText);
  getTasksResponse.events.forEach((event, index) => {
    console.log(`Event[${index}]:`, JSON.stringify(event, null, 2));
  });

  // Step 3: attempt move
  const updateArgs = {
    task_id: taskId,
    project_id: projectId,
  };

  if (sectionId !== undefined) {
    updateArgs.section_id = sectionId;
  }

  const updateResponse = await sendMcpRequest('tools/call', {
    name: 'todoist_update_task',
    arguments: updateArgs,
  }, sessionId);
  console.log('\n-- todoist_update_task response --');
  console.log('Status:', updateResponse.status, updateResponse.statusText);
  updateResponse.events.forEach((event, index) => {
    console.log(`Event[${index}]:`, JSON.stringify(event, null, 2));
  });

  if (!updateResponse.ok) {
    process.exitCode = 1;
  }

  // Step 4: fetch again to verify
  const postCheckResponse = await sendMcpRequest('tools/call', getTasksParams, sessionId);
  console.log('\n-- post-update todoist_get_tasks response --');
  console.log('Status:', postCheckResponse.status, postCheckResponse.statusText);
  postCheckResponse.events.forEach((event, index) => {
    console.log(`Event[${index}]:`, JSON.stringify(event, null, 2));
  });
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

