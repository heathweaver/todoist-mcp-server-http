# Testing Guidelines for Todoist MCP Server Extended

## Overview

Use Node.js built-in testing capabilities with simple, focused tests to ensure MCP server functionality and API integration quality.

## Testing Framework

- **Node.js Test Runner**: Built-in testing framework (Node 18+)
- **JavaScript Tests**: Use `.js` files for tests (Node.js doesn't natively support TypeScript)
- **No External Dependencies**: Keep testing simple and lightweight
- **Assert Module**: Use Node.js built-in `assert` for assertions
- **Manual Testing**: Focus on MCP tool functionality and API integration

**Note**: Unlike Deno, Node.js requires TypeScript compilation. For testing, we use JavaScript to avoid build steps.

## MCP Tool Testing

### Basic Tool Test

```javascript
import assert from 'node:assert';

// Mock the API for testing
const mockTodoistClient = {
  getTasks: async () => [
    { id: '1', content: 'Test task', completed: false }
  ],
  addTask: async (params: any) => ({ id: '2', ...params })
};

import { test } from 'node:test';
import assert from 'node:assert';

test("todoist_get_tasks - returns tasks successfully", async () => {
  // Arrange
  const toolName = "todoist_get_tasks";
  const args = { filter: "today" };
  
  // Act
  const result = await handleToolCall(toolName, args, mockTodoistClient);
  
  // Assert
  assert.strictEqual(result.isError, false);
  assert.ok(result.content[0].text.includes('Test task'));
});
```

### Tool Error Handling Test

```typescript
test("todoist_create_task - handles missing content", async () => {
  // Arrange
  const toolName = "todoist_create_task";
  const args = { project_id: "123" }; // Missing required content
  
  // Act
  const result = await handleToolCall(toolName, args, mockTodoistClient);
  
  // Assert
  assert.strictEqual(result.isError, true);
  assert.ok(result.content[0].text.includes('content'));
});
```

## API Integration Testing

### Todoist API Mock Test

```typescript
test("Todoist API integration - task creation", async () => {
  // Arrange
  const api = new TodoistApi('test-token');
  const taskData = {
    content: 'Test task',
    projectId: 'test-project'
  };
  
  // Act & Assert
  // Note: This would require actual API token for integration tests
  // For unit tests, use mocked responses
  assert.ok(typeof api.addTask === 'function');
});
```

### Batch Operation Test

```typescript
test("Batch task creation - handles multiple tasks", async () => {
  // Arrange
  const toolName = "todoist_create_task";
  const args = {
    tasks: [
      { content: 'Task 1', project_id: '123' },
      { content: 'Task 2', project_id: '123' }
    ]
  };
  
  // Act
  const result = await handleToolCall(toolName, args, mockTodoistClient);
  
  // Assert
  assert.strictEqual(result.isError, false);
  const response = JSON.parse(result.content[0].text);
  assert.strictEqual(response.summary.total, 2);
  assert.strictEqual(response.summary.succeeded, 2);
});
```

## Testing Requirements

### Every MCP Tool Must Have:

- [ ] **Basic functionality test** - Tool executes without errors
- [ ] **Input validation test** - Invalid inputs handled properly
- [ ] **Error handling test** - API errors handled gracefully
- [ ] **Batch operation test** - Batch operations work correctly
- [ ] **Type safety test** - TypeScript types work correctly

### Every API Integration Must Have:

- [ ] **Success path test** - API calls succeed
- [ ] **Error path test** - API errors handled
- [ ] **Rate limiting test** - Rate limits respected
- [ ] **Authentication test** - Token validation works

## Test File Organization

```
tests/
├── tools/
│   ├── task-tools.test.ts
│   ├── project-tools.test.ts
│   ├── label-tools.test.ts
│   └── comment-tools.test.ts
├── api/
│   ├── todoist-client.test.ts
│   └── integration.test.ts
└── utils/
    ├── typeguards.test.ts
    └── helpers.test.ts
```

## Running Tests

```bash
# Run all tests
node --test

# Run specific test file
node --test tests/tools/task-tools.test.ts

# Run tests in watch mode
node --test --watch

# Run tests with verbose output
node --test --reporter=verbose
```

## Test Naming Convention

- **Tool tests**: `tool-name.test.ts`
- **API tests**: `api-feature.test.ts`
- **Integration tests**: `integration-scenario.test.ts`

## Test Structure

```typescript
test("ToolName - specific behavior", async () => {
  // Arrange
  const toolName = "todoist_create_task";
  const args = { content: "Test task" };
  
  // Act
  const result = await handleToolCall(toolName, args, mockClient);
  
  // Assert
  assert.strictEqual(result.isError, false);
  assert.ok(result.content[0].text.includes('success'));
});
```

## Mocking Strategy

### API Client Mock

```typescript
const createMockTodoistClient = () => ({
  getTasks: async () => [],
  addTask: async (params: any) => ({ id: 'mock-id', ...params }),
  updateTask: async (id: string, params: any) => ({ id, ...params }),
  deleteTask: async (id: string) => ({ success: true }),
  getComments: async ({ taskId }: { taskId: string }) => [],
  addComment: async ({ taskId, content }: { taskId: string; content: string }) => ({
    id: 'comment-id',
    content,
    taskId
  })
});
```

## Best Practices

- **Test MCP protocol compliance** - Ensure tools follow MCP standards
- **Mock external APIs** - Don't make real API calls in unit tests
- **Test error scenarios** - Invalid inputs, API failures, network issues
- **Keep tests focused** - One tool/feature per test file
- **Use descriptive names** - Clear what behavior is being tested
- **Test batch operations** - Ensure batch functionality works correctly
- **Validate JSON responses** - Ensure MCP response format is correct

## Manual Testing

### MCP Server Testing

```bash
# Start the MCP server
npm run build
node dist/index.js

# Test with Claude Desktop
# Add server to claude_desktop_config.json and test tools
```

### Docker Testing

```bash
# Build Docker image
docker build -t todoist-mcp .

# Run with environment variable
docker run -e TODOIST_API_TOKEN=your_token todoist-mcp

# Test health check
docker run -e TODOIST_API_TOKEN=your_token todoist-mcp node -e "console.log('OK')"
```

## CI/CD Integration

- All tests must pass before PR merge
- Manual testing required for MCP integration
- Docker build must succeed
- No external API calls in CI tests
- Focus on unit tests and mocked integration tests
