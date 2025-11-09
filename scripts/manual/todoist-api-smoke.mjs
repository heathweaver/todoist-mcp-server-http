#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

// Load .env lazily when available
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

const todoistToken = process.env.TODOIST_API_TOKEN;
if (!todoistToken) {
  console.error('Missing TODOIST_API_TOKEN. Set it in your environment or .env file.');
  process.exit(1);
}

const TODOIST_REST_BASE = 'https://api.todoist.com/rest/v2';
const TODOIST_SYNC_BASE = 'https://api.todoist.com/sync/v9';
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const NUMERIC_ID_REGEX = /^\d+$/;

function authHeaders(extra = {}) {
  return {
    'Authorization': `Bearer ${todoistToken}`,
    ...extra,
  };
}

async function assertOk(response, label) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${label} failed (${response.status}): ${body}`);
  }
}

function prettyPrint(title, data) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

function ensureUlid(value, label) {
  const stringValue = String(value);
  if (!ULID_REGEX.test(stringValue)) {
    throw new Error(`${label} is not a valid ULID: ${stringValue}`);
  }
  return stringValue;
}

function detectIdType(value) {
  const stringValue = String(value);
  if (ULID_REGEX.test(stringValue)) return 'ULID';
  if (NUMERIC_ID_REGEX.test(stringValue)) return 'numeric';
  return 'unknown';
}

async function testRestV2Move(taskId, targetProjectId) {
  console.log(`\n--- Testing REST v2 /move endpoint ---`);
  console.log(`Task ID: ${taskId} (${detectIdType(taskId)})`);
  console.log(`Target Project: ${targetProjectId} (${detectIdType(targetProjectId)})`);
  
  const response = await fetch(`${TODOIST_REST_BASE}/tasks/${taskId}/move`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ project_id: targetProjectId }),
  });

  const success = response.ok;
  const status = response.status;
  const body = await response.text().catch(() => '');

  console.log(`REST v2 /move result: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Status: ${status}`);
  if (!success) {
    console.log(`Error: ${body}`);
  }

  return { success, status, body, method: 'REST v2 /move' };
}

async function testSyncApiMove(taskId, targetProjectId) {
  console.log(`\n--- Testing Sync API v9 item_move ---`);
  console.log(`Task ID: ${taskId} (${detectIdType(taskId)})`);
  console.log(`Target Project: ${targetProjectId} (${detectIdType(targetProjectId)})`);

  const command = {
    type: 'item_move',
    uuid: randomUUID(),
    args: {
      id: taskId,
      project_id: targetProjectId
    }
  };

  const response = await fetch(`${TODOIST_SYNC_BASE}/sync`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ commands: [command] }),
  });

  const success = response.ok;
  const status = response.status;
  const result = success ? await response.json() : await response.text().catch(() => '');

  let commandSuccess = false;
  if (success && result.sync_status) {
    commandSuccess = result.sync_status[command.uuid] === 'ok';
  }

  console.log(`Sync API item_move result: ${commandSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`HTTP Status: ${status}`);
  if (commandSuccess) {
    console.log(`Command Status: ok`);
  } else {
    console.log(`Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`);
  }

  return { success: commandSuccess, status, body: result, method: 'Sync API v9 item_move' };
}

async function testBulkRestV2Move(taskIds, targetProjectId) {
  console.log(`\n--- Testing REST v2 /tasks/move (bulk) endpoint ---`);
  console.log(`Task IDs: ${taskIds.join(', ')}`);
  console.log(`Target Project: ${targetProjectId} (${detectIdType(targetProjectId)})`);
  
  const response = await fetch(`${TODOIST_REST_BASE}/tasks/move`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ 
      task_ids: taskIds,
      project_id: targetProjectId 
    }),
  });

  const success = response.ok;
  const status = response.status;
  const body = await response.text().catch(() => '');

  console.log(`REST v2 /tasks/move (bulk) result: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Status: ${status}`);
  if (!success) {
    console.log(`Error: ${body}`);
  }

  return { success, status, body, method: 'REST v2 /tasks/move (bulk)' };
}

async function main() {
  console.log('Todoist MCP API smoke test starting…');

  const timestamp = Date.now();
  const projectAName = `MCP Smoke Project A ${timestamp}`;
  const projectBName = `MCP Smoke Project B ${timestamp}`;
  const sectionName = `Smoke Section ${timestamp}`;
  const updatedSectionName = `${sectionName} (renamed)`;
  const taskContent = `Smoke Task ${timestamp}`;
  const commentContent = `Smoke comment ${timestamp}`;

  const cleanup = {
    projects: [],
    sections: [],
    tasks: [],
    comments: [],
  };

  const call = async (method, path, { body, label } = {}) => {
    const response = await fetch(`${TODOIST_REST_BASE}${path}`, {
      method,
      headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    await assertOk(response, label || `${method} ${path}`);
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const ensureCleanup = (type, id) => {
    if (!cleanup[type].includes(id)) {
      cleanup[type].push(id);
    }
  };

  let projectA;
  let projectB;
  let section;
  let task;
  let comment;

  try {
    projectA = await call('POST', '/projects', { body: { name: projectAName }, label: 'create project A' });
    console.log(`Project A ID: ${projectA.id} (${detectIdType(projectA.id)})`);
    ensureCleanup('projects', projectA.id);
    prettyPrint('Project A created', projectA);

    projectB = await call('POST', '/projects', { body: { name: projectBName }, label: 'create project B' });
    console.log(`Project B ID: ${projectB.id} (${detectIdType(projectB.id)})`);
    ensureCleanup('projects', projectB.id);
    prettyPrint('Project B created', projectB);

    // Test sub-project creation (parent_id with numeric ID)
    console.log('\n--- Testing Sub-Project Creation ---');
    const subProjectName = `${projectAName} - Child`;
    let subProject;
    try {
      subProject = await call('POST', '/projects', {
        body: { name: subProjectName, parent_id: projectA.id },
        label: 'create sub-project'
      });
      console.log(`✅ Sub-project created: ${subProject.id} (${detectIdType(subProject.id)}) under parent ${projectA.id}`);
      ensureCleanup('projects', subProject.id);
      prettyPrint('Sub-project created', subProject);
    } catch (error) {
      console.error(`❌ Sub-project creation failed: ${error instanceof Error ? error.message : error}`);
      console.log('This is expected if parent_id is numeric and API expects ULID');
    }

    const projects = await call('GET', '/projects', { label: 'get projects' });
    prettyPrint('Projects list', projects.filter(p => p.name.includes('MCP Smoke Project')));

    section = await call('POST', '/sections', {
      body: { name: sectionName, project_id: projectA.id },
      label: 'create section'
    });
    console.log(`Section ID: ${section.id} (${detectIdType(section.id)})`);
    ensureCleanup('sections', section.id);
    prettyPrint('Section created', section);

    await call('POST', `/sections/${section.id}`, {
      body: { name: updatedSectionName },
      label: 'rename section'
    });
    prettyPrint('Section renamed', { id: section.id, name: updatedSectionName });

    task = await call('POST', '/tasks', {
      body: {
        content: taskContent,
        project_id: projectA.id,
        section_id: section.id,
        due_string: 'tomorrow at 9am',
      },
      label: 'create task'
    });
    console.log(`Task ID: ${task.id} (${detectIdType(task.id)})`);
    ensureCleanup('tasks', task.id);
    prettyPrint('Task created', task);

    const tasksInProject = await call('GET', `/tasks?project_id=${projectA.id}`, { label: 'get tasks in project A' });
    prettyPrint('Tasks in Project A', tasksInProject);

    await call('POST', `/tasks/${task.id}`, {
      body: {
        content: `${taskContent} (updated)`,
        priority: 4,
        labels: ['smoke-test'],
      },
      label: 'update task'
    });
    prettyPrint('Task updated', { id: task.id });

    // === MOVE API TESTING SECTION ===
    console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          TESTING MOVE API ENDPOINTS (HYPOTHESIS)              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('\nHYPOTHESIS: REST v2 /move endpoint fails with 404 for numeric IDs,');
    console.log('            but Sync API v9 item_move works correctly.\n');

    // Test 1: Try REST v2 single task /move endpoint
    console.log('\n═══ TEST 1: REST v2 /tasks/{id}/move (single task) ═══');
    const restV2Result = await testRestV2Move(task.id, projectB.id);

    // Test 2: Try REST v2 bulk /tasks/move endpoint
    console.log('\n═══ TEST 2: REST v2 /tasks/move (bulk) ═══');
    const bulkRestV2Result = await testBulkRestV2Move([task.id], projectB.id);

    // Test 3: Try Sync API v9 item_move
    console.log('\n═══ TEST 3: Sync API v9 item_move ═══');
    const syncApiResult = await testSyncApiMove(task.id, projectB.id);

    // Verify the move actually happened
    console.log('\n═══ Verification: Check task location ═══');
    const verifyTask = await call('GET', `/tasks/${task.id}`, { label: 'verify task location' });
    console.log(`Current task location: Project ${verifyTask.project_id}`);
    console.log(`Expected location: Project ${projectB.id}`);
    const moveSucceeded = verifyTask.project_id === projectB.id;
    console.log(`Move verification: ${moveSucceeded ? '✅ SUCCESS' : '❌ FAILED'}`);

    // Summary
    console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      TEST RESULTS SUMMARY                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\nAccount ID Type: ${detectIdType(task.id)}`);
    console.log(`\nREST v2 /tasks/{id}/move:    ${restV2Result.success ? '✅ WORKS' : '❌ FAILS'} (Status: ${restV2Result.status})`);
    console.log(`REST v2 /tasks/move (bulk):  ${bulkRestV2Result.success ? '✅ WORKS' : '❌ FAILS'} (Status: ${bulkRestV2Result.status})`);
    console.log(`Sync API v9 item_move:       ${syncApiResult.success ? '✅ WORKS' : '❌ FAILS'} (Status: ${syncApiResult.status})`);
    console.log(`\nActual task moved:           ${moveSucceeded ? '✅ YES' : '❌ NO'}`);
    
    if (syncApiResult.success && !restV2Result.success) {
      console.log('\n🎯 HYPOTHESIS CONFIRMED: Sync API works, REST v2 fails for numeric IDs');
      console.log('   ➡️  Server should use Sync API fallback for move operations');
    } else if (restV2Result.success) {
      console.log('\n✨ REST v2 /move works! No fallback needed for this account.');
    } else if (!syncApiResult.success && !restV2Result.success) {
      console.log('\n⚠️  BOTH APIs FAILED - Further investigation needed');
    }
    
    console.log('\n╚════════════════════════════════════════════════════════════════╝\n');

    comment = await call('POST', '/comments', {
      body: { task_id: task.id, content: commentContent },
      label: 'create task comment'
    });
    console.log(`Comment ID: ${comment.id} (${detectIdType(comment.id)})`);
    ensureCleanup('comments', comment.id);
    prettyPrint('Comment created', comment);

    const comments = await call('GET', `/comments?task_id=${task.id}`, { label: 'get task comments' });
    prettyPrint('Task comments', comments);

    await call('POST', `/tasks/${task.id}/close`, { label: 'complete task' });
    prettyPrint('Task completed', { id: task.id });

    await call('POST', `/tasks/${task.id}/reopen`, { label: 'reopen task' });
    prettyPrint('Task reopened', { id: task.id });

    const finalState = await call('GET', `/tasks/${task.id}`, { label: 'fetch final task state' });
    prettyPrint('Final task state', finalState);

    await call('DELETE', `/tasks/${task.id}`, { label: 'delete task' });
    cleanup.tasks = cleanup.tasks.filter(id => id !== task.id);
    prettyPrint('Task deleted', { id: task.id });

    if (comment) {
      await call('DELETE', `/comments/${comment.id}`, { label: 'delete comment' });
      cleanup.comments = cleanup.comments.filter(id => id !== comment.id);
      prettyPrint('Comment deleted', { id: comment.id });
    }

    await call('DELETE', `/sections/${section.id}`, { label: 'delete section' });
    cleanup.sections = cleanup.sections.filter(id => id !== section.id);
    prettyPrint('Section deleted', { id: section.id });

    await call('DELETE', `/projects/${projectB.id}`, { label: 'delete project B' });
    cleanup.projects = cleanup.projects.filter(id => id !== projectB.id);
    prettyPrint('Project B deleted', { id: projectB.id });

    await call('DELETE', `/projects/${projectA.id}`, { label: 'delete project A' });
    cleanup.projects = cleanup.projects.filter(id => id !== projectA.id);
    prettyPrint('Project A deleted', { id: projectA.id });
  } finally {
    await safeCleanup(call, cleanup);
  }

  console.log('\n✅ Todoist MCP API smoke test completed');
}

async function safeCleanup(call, cleanup) {
  for (const commentId of cleanup.comments.splice(0)) {
    try {
      await call('DELETE', `/comments/${commentId}`, { label: 'cleanup comment' });
    } catch (error) {
      console.warn(`⚠️ cleanup comment ${commentId} failed: ${error.message}`);
    }
  }

  for (const taskId of cleanup.tasks.splice(0)) {
    try {
      await call('DELETE', `/tasks/${taskId}`, { label: 'cleanup task' });
    } catch (error) {
      console.warn(`⚠️ cleanup task ${taskId} failed: ${error.message}`);
    }
  }

  for (const sectionId of cleanup.sections.splice(0)) {
    try {
      await call('DELETE', `/sections/${sectionId}`, { label: 'cleanup section' });
    } catch (error) {
      console.warn(`⚠️ cleanup section ${sectionId} failed: ${error.message}`);
    }
  }

  for (const projectId of cleanup.projects.splice(0)) {
    try {
      await call('DELETE', `/projects/${projectId}`, { label: 'cleanup project' });
    } catch (error) {
      console.warn(`⚠️ cleanup project ${projectId} failed: ${error.message}`);
    }
  }
}

main().catch(error => {
  console.error('\n❌ Smoke test failed:', error);
  process.exit(1);
});

