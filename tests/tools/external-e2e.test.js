import { test } from 'node:test';
import assert from 'node:assert';

const ENABLED = process.env.MCP_E2E_ENABLED === '1';

if (!ENABLED) {
  test.skip('MCP end-to-end test disabled (set MCP_E2E_ENABLED=1 to enable)', () => {});
} else {
  const BASE_URL = process.env.MCP_E2E_BASE_URL || process.env.TEST_BASE_URL || 'https://todoist.ssc.one';
  const BEARER_TOKEN = process.env.MCP_E2E_BEARER_TOKEN
    || process.env.GITHUB_OAUTH_BEARER_TOKEN
    || process.env.MCP_ALLOWED_TOKENS?.split(',')[0]?.trim();
  const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN;
  const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  const TODOIST_REST_BASE = 'https://api.todoist.com/rest/v2';

  if (!BEARER_TOKEN) {
    test.skip('MCP end-to-end test disabled (no bearer token provided)');
  } else {
    const headersBase = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${BEARER_TOKEN}`,
    };

    const createdResources = {
      projectIds: [],
      sectionIds: [],
      taskIds: [],
      commentIds: [],
    };

    function ensureUlid(value, label) {
      assert.ok(ULID_REGEX.test(value), `${label} must be a ULID (received ${value})`);
      return value;
    }

    function parseEventStream(text) {
      return text
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6))
        .filter(Boolean)
        .map(chunk => JSON.parse(chunk));
    }

    function extractResult(events) {
      const resultEvent = events.find(evt => Object.prototype.hasOwnProperty.call(evt, 'result'));
      if (!resultEvent) {
        const errorEvent = events.find(evt => Object.prototype.hasOwnProperty.call(evt, 'error'));
        if (errorEvent) {
          throw new Error(errorEvent.error?.message || 'Tool call returned error');
        }
        throw new Error('No result returned from tool');
      }
      return resultEvent.result;
    }

    async function sendMcpRequest(method, params, sessionId) {
      const headers = { ...headersBase };
      if (sessionId) {
        headers['Mcp-Session-Id'] = sessionId;
      }

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      });

      const text = await response.text();
      return { response, events: parseEventStream(text) };
    }

    async function callTool(sessionId, name, args) {
      const { response, events } = await sendMcpRequest('tools/call', { name, arguments: args }, sessionId);
      assert.ok(response.ok, `tools/call ${name} should succeed (${response.status})`);
      return extractResult(events);
    }

    async function cleanupTodoist() {
      if (!TODOIST_API_TOKEN) {
        return;
      }
      const authHeaders = {
        Authorization: `Bearer ${TODOIST_API_TOKEN}`,
        'Content-Type': 'application/json',
      };

      async function safeDelete(path) {
        try {
          const response = await fetch(`${TODOIST_REST_BASE}${path}`, {
            method: 'DELETE',
            headers: authHeaders,
          });
          if (!response.ok && response.status !== 404) {
            console.warn(`⚠️  Cleanup failed for ${path}: ${response.status}`);
          }
        } catch (error) {
          console.warn(`⚠️  Cleanup error for ${path}: ${error instanceof Error ? error.message : error}`);
        }
      }

      for (const commentId of createdResources.commentIds.splice(0)) {
        await safeDelete(`/comments/${commentId}`);
      }
      for (const taskId of createdResources.taskIds.splice(0)) {
        await safeDelete(`/tasks/${taskId}`);
      }
      for (const sectionId of createdResources.sectionIds.splice(0)) {
        await safeDelete(`/sections/${sectionId}`);
      }
      for (const projectId of createdResources.projectIds.splice(0)) {
        await safeDelete(`/projects/${projectId}`);
      }
    }

    test('MCP ULID end-to-end workflow', async (t) => {
      t.after(cleanupTodoist);

      const init = await sendMcpRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ulid-e2e-test', version: '1.0.0' },
      });

      assert.ok(init.response.ok, 'initialize should succeed');
      const sessionId = init.response.headers.get('mcp-session-id');
      assert.ok(sessionId, 'Session ID should be returned');

      const toolsList = await sendMcpRequest('tools/list', {}, sessionId);
      assert.ok(toolsList.response.ok, 'tools/list should succeed');
      const toolNames = extractResult(toolsList.events).tools.map(tool => tool.name);
      ['todoist_create_project', 'todoist_create_task', 'todoist_get_tasks', 'todoist_create_section', 'todoist_create_task_comment'].forEach(tool => {
        assert.ok(toolNames.includes(tool), `${tool} should be available`);
      });

      const timestamp = Date.now();
      const projectName = `MCP E2E Project ${timestamp}`;
      const sectionName = `MCP E2E Section ${timestamp}`;
      const taskContent = `MCP E2E Task ${timestamp}`;
      const commentContent = `MCP E2E Comment ${timestamp}`;

      // Create Project
      const projectResult = await callTool(sessionId, 'todoist_create_project', {
        projects: [{ name: projectName }],
      });
      const projectSummary = projectResult.results?.[0];
      assert.ok(projectSummary?.success, 'Project creation should succeed');
      const projectId = ensureUlid(projectSummary.project_id, 'project_id');
      createdResources.projectIds.push(projectId);

      // Create Section
      const sectionResult = await callTool(sessionId, 'todoist_create_section', {
        sections: [{ project_id: projectId, name: sectionName }],
      });
      const sectionSummary = sectionResult.results?.[0];
      assert.ok(sectionSummary?.success, 'Section creation should succeed');
      const sectionId = ensureUlid(sectionSummary.section_id, 'section_id');
      createdResources.sectionIds.push(sectionId);

      // Create Task
      const taskResult = await callTool(sessionId, 'todoist_create_task', {
        tasks: [{
          content: taskContent,
          project_id: projectId,
          section_id: sectionId,
          priority: 3,
        }],
      });
      const taskSummary = taskResult.results?.[0];
      assert.ok(taskSummary?.success, 'Task creation should succeed');
      const taskId = ensureUlid(taskSummary.task_id, 'task_id');
      createdResources.taskIds.push(taskId);

      // Fetch Tasks filtered by project
      const getTasks = await callTool(sessionId, 'todoist_get_tasks', {
        project_id: projectId,
        limit: 20,
      });
      assert.ok(getTasks.tasks.some(task => task.id === taskId), 'Created task should be retrievable');

      // Update task content and priority
      const updateTask = await callTool(sessionId, 'todoist_update_task', {
        tasks: [{
          task_id: taskId,
          content: `${taskContent} (updated)`,
          priority: 4,
        }],
      });
      const updateSummary = updateTask.results?.[0];
      assert.ok(updateSummary?.success, 'Task update should succeed');

      // Comment on the task
      const commentResult = await callTool(sessionId, 'todoist_create_task_comment', {
        comments: [{
          task_id: taskId,
          content: commentContent,
        }],
      });
      const commentSummary = commentResult.results?.[0];
      assert.ok(commentSummary?.success, 'Comment creation should succeed');
      const commentId = ensureUlid(commentSummary.comment?.id, 'comment_id');
      createdResources.commentIds.push(commentId);

      // Fetch comments via tool
      const commentsResult = await callTool(sessionId, 'todoist_get_task_comments', {
        tasks: [{ task_id: taskId }],
      });
      const taskComments = commentsResult.results?.[0]?.comments || [];
      assert.ok(taskComments.some(comment => comment.id === commentId), 'Created comment should be retrievable');

      // Complete the task
      const completeResult = await callTool(sessionId, 'todoist_complete_task', {
        tasks: [{ task_id: taskId }],
      });
      assert.ok(completeResult.results?.[0]?.success, 'Task completion should succeed');

      // Delete the task
      const deleteResult = await callTool(sessionId, 'todoist_delete_task', {
        tasks: [{ task_id: taskId }],
      });
      assert.ok(deleteResult.results?.[0]?.success, 'Task deletion should succeed');
      createdResources.taskIds = createdResources.taskIds.filter(id => id !== taskId);

      // All operations completed successfully
      console.log('✅ MCP ULID end-to-end workflow completed successfully');
    });
  }
}
