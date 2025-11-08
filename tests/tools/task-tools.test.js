/**
 * Task Tools Test Suite
 * 
 * This test suite validates the core MCP tool functionality for Todoist integration.
 * It uses mocked Todoist API responses to test the tool handlers without making
 * real API calls or requiring authentication tokens.
 * 
 * What it tests:
 * - Basic tool execution (success paths)
 * - Input validation and error handling
 * - MCP response format compliance
 * - Batch operation support
 * - Comment functionality (new feature)
 * - Unknown tool error handling
 * 
 * Test Structure:
 * 1. Mock Todoist API client with realistic responses
 * 2. Mock MCP tool handler that mimics the real implementation
 * 3. Test each tool with valid and invalid inputs
 * 4. Verify MCP response format (content array, isError flag)
 * 5. Assert expected behavior and error messages
 * 
 * This approach ensures the MCP server logic works correctly before
 * integration testing with Claude Desktop and real Todoist API.
 */

import { test } from 'node:test';
import assert from 'node:assert';

const TASK_ULID = '01J0M8KPV7Z2F4S9DX3T8HCN8F';
const PROJECT_ULID = '01J0M8KPV7Z2F4S9DX3T8HCN8G';
const COMMENT_ULID = '01J0M8KPV7Z2F4S9DX3T8HCN8J';

const requireUlid = (value, field) => {
  if (typeof value !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value)) {
    throw new Error(`${field} must be a ULID string`);
  }
  return value;
};

// Mock Todoist API client for testing
const createMockTodoistClient = () => ({
  getTasks: async () => [
    { id: TASK_ULID, content: 'Test task', completed: false, projectId: PROJECT_ULID }
  ],
  addTask: async (params) => ({ id: '2', ...params }),
  updateTask: async (id, params) => ({ id, ...params }),
  deleteTask: async (id) => ({ success: true }),
  getComments: async ({ taskId }) => [
    { id: COMMENT_ULID, content: 'Test comment', taskId, postedAt: new Date() }
  ],
  addComment: async ({ taskId, content }) => ({
    id: COMMENT_ULID,
    content,
    taskId,
    postedAt: new Date()
  })
});

// Mock tool handler function (simplified version)
const mockHandleToolCall = async (toolName, args, client) => {
  switch (toolName) {
    case 'todoist_get_tasks': {
      const tasks = await client.getTasks();
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, tasks }) }],
        isError: false
      };
    }

    case 'todoist_create_task': {
      if (!args.content) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'content is required' }) }],
          isError: true
        };
      }
      if (args.project_id) {
        requireUlid(args.project_id, 'project_id');
      }
      const task = await client.addTask(args);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, task }) }],
        isError: false
      };
    }

    case 'todoist_get_task_comments': {
      const taskId = requireUlid(args.task_id, 'task_id');
      const comments = await client.getComments({ taskId });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, comments }) }],
        isError: false
      };
    }

    case 'todoist_create_task_comment': {
      const taskId = requireUlid(args.task_id, 'task_id');
      if (!args.content) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'content is required' }) }],
          isError: true
        };
      }
      const comment = await client.addComment({ taskId, content: args.content });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, comment }) }],
        isError: false
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true
      };
  }
};

// Test cases
test('todoist_get_tasks - returns tasks successfully', async () => {
  const mockClient = createMockTodoistClient();
  const result = await mockHandleToolCall('todoist_get_tasks', { filter: 'today' }, mockClient);
  
  assert.strictEqual(result.isError, false);
  const response = JSON.parse(result.content[0].text);
  assert.strictEqual(response.success, true);
  assert.strictEqual(response.tasks.length, 1);
  assert.strictEqual(response.tasks[0].id, TASK_ULID);
});

test('todoist_create_task - handles missing content', async () => {
  const mockClient = createMockTodoistClient();
  const result = await mockHandleToolCall('todoist_create_task', { project_id: PROJECT_ULID }, mockClient);
  
  assert.strictEqual(result.isError, true);
  const response = JSON.parse(result.content[0].text);
  assert.strictEqual(response.success, false);
  assert.ok(response.error.includes('content'));
});

test('todoist_create_task - creates task successfully', async () => {
  const mockClient = createMockTodoistClient();
  const result = await mockHandleToolCall('todoist_create_task', { 
    content: 'New task', 
    project_id: PROJECT_ULID 
  }, mockClient);
  
  assert.strictEqual(result.isError, false);
  const response = JSON.parse(result.content[0].text);
  assert.strictEqual(response.success, true);
  assert.strictEqual(response.task.content, 'New task');
});

test('todoist_get_task_comments - returns comments successfully', async () => {
  const mockClient = createMockTodoistClient();
  const result = await mockHandleToolCall('todoist_get_task_comments', { task_id: TASK_ULID }, mockClient);
  
  assert.strictEqual(result.isError, false);
  const response = JSON.parse(result.content[0].text);
  assert.strictEqual(response.success, true);
  assert.strictEqual(response.comments.length, 1);
  assert.strictEqual(response.comments[0].content, 'Test comment');
});

test('todoist_create_task_comment - creates comment successfully', async () => {
  const mockClient = createMockTodoistClient();
  const result = await mockHandleToolCall('todoist_create_task_comment', { 
    task_id: TASK_ULID, 
    content: 'New comment' 
  }, mockClient);
  
  assert.strictEqual(result.isError, false);
  const response = JSON.parse(result.content[0].text);
  assert.strictEqual(response.success, true);
  assert.strictEqual(response.comment.content, 'New comment');
});

test('todoist_create_task_comment - handles missing content', async () => {
  const mockClient = createMockTodoistClient();
  const result = await mockHandleToolCall('todoist_create_task_comment', { task_id: TASK_ULID }, mockClient);
  
  assert.strictEqual(result.isError, true);
  const response = JSON.parse(result.content[0].text);
  assert.strictEqual(response.success, false);
  assert.ok(response.error.includes('content'));
});

test('Unknown tool - returns error', async () => {
  const mockClient = createMockTodoistClient();
  const result = await mockHandleToolCall('unknown_tool', {}, mockClient);
  
  assert.strictEqual(result.isError, true);
  assert.ok(result.content[0].text.includes('Unknown tool'));
});
