# Task Move Functionality - Investigation & Fix

## TL;DR

**Problem**: Move operations failed with 404 NOT_FOUND  
**Root Cause**: REST v2 `/move` endpoint doesn't work with numeric IDs  
**Solution**: Implemented Sync API v9 fallback  
**Status**: ✅ **PROVEN via smoke test** - Ready for deployment

---

## Hypothesis & Test Results

### Hypothesis
REST v2 `/move` endpoint fails with 404 for accounts using legacy numeric IDs, but Sync API v9 `item_move` command works.

### Test Method
Enhanced `scripts/manual/todoist-api-smoke.mjs` to test all three move approaches:
1. REST v2 `/tasks/{id}/move` (single task)
2. REST v2 `/tasks/move` (bulk)
3. Sync API v9 `item_move`

### Test Results (Nov 8, 2025)

```
╔════════════════════════════════════════════════════════════════╗
║                      TEST RESULTS SUMMARY                      ║
╚════════════════════════════════════════════════════════════════╝

Account ID Type: numeric

REST v2 /tasks/{id}/move:    ❌ FAILS (Status: 404)
REST v2 /tasks/move (bulk):  ❌ FAILS (Status: 400)
Sync API v9 item_move:       ✅ WORKS (Status: 200)

Actual task moved:           ✅ YES

🎯 HYPOTHESIS CONFIRMED: Sync API works, REST v2 fails for numeric IDs
   ➡️  Server should use Sync API fallback for move operations
```

**Full test output**: See smoke test execution above - task successfully moved from Project A to Project B using Sync API.

---

## How Move Detection Works

### Automatic Move Detection

When AI calls `todoist_update_task`, the server automatically separates move operations from regular updates:

**Move Operations** (use special endpoint):
- `project_id` - Moving to different project
- `section_id` - Moving to different section (or `null` to remove)
- `parent_id` - Making subtask (or `null` to remove parent)

**Regular Updates** (use standard endpoint):
- `content`, `description`, `labels`, `priority`, `due_string`, `assignee_id`, `duration`, etc.

### Implementation Flow

```
todoist_update_task called
        ↓
Parse arguments into:
  - updateParams (content, description, etc.)
  - moveOptions (project_id, section_id, parent_id)
        ↓
If updateParams has fields:
  → Call todoistClient.updateTask()
        ↓
If moveOptions has fields:
  → Try REST v2 /move endpoint
  → If 404, fallback to Sync API v9
        ↓
Return combined success/failure
```

---

## Implementation Details

### Code Location: `src/index.ts`

#### Main Handler: `handleUpdateTasks()` (~lines 1001-1090)
Separates update params from move options and calls both APIs if needed.

#### Primary Move Function: `moveTodoistTask()` (~lines 478-566)
```typescript
private async moveTodoistTask(taskId: string, options: {
  projectId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
}) {
  // 1. Verify task exists
  const task = await this.todoistClient.getTask(taskId);
  console.log('Task exists, current location:', { ... });
  
  // 2. Try REST v2 /move first
  const restResponse = await fetch(
    `https://api.todoist.com/rest/v2/tasks/${taskId}/move`,
    { method: 'POST', body: JSON.stringify(payload) }
  );
  
  if (restResponse.ok) {
    return result; // Success!
  }
  
  // 3. If 404, fallback to Sync API
  if (restResponse.status === 404) {
    return await this.moveTodoistTaskViaSyncApi(taskId, payload);
  }
  
  // 4. Other errors throw immediately
  throw new Error(...);
}
```

#### Sync API Fallback: `moveTodoistTaskViaSyncApi()` (~lines 568-629)
```typescript
private async moveTodoistTaskViaSyncApi(taskId: string, payload: {...}) {
  const command = {
    type: 'item_move',
    uuid: randomUUID(),
    args: {
      id: taskId,
      project_id: payload.project_id,
      section_id: payload.section_id,
      parent_id: payload.parent_id
    }
  };
  
  const syncResponse = await fetch('https://api.todoist.com/sync/v9/sync', {
    method: 'POST',
    body: JSON.stringify({ commands: [command] })
  });
  
  const syncResult = await syncResponse.json();
  
  // Check command-level status
  if (syncResult.sync_status[command.uuid] !== 'ok') {
    throw new Error(...);
  }
  
  return syncResult;
}
```

---

## Example Usage

### Move Task to Different Project

**AI Request**:
```json
{
  "tasks": [{
    "task_id": "8951709409",
    "project_id": "2037432791"
  }]
}
```

**Server Logs** (with fallback):
```
Task exists, current location: { taskId: '8951709409', currentProjectId: '1879065690' }
Attempting REST v2 move: { url: '.../tasks/8951709409/move' }
REST v2 move failed, trying Sync API fallback: { status: 404 }
Attempting Sync API v9 move: { command: { type: 'item_move', ... } }
Sync API move succeeded: { taskId: '8951709409' }
```

### Move and Update Simultaneously

**AI Request**:
```json
{
  "tasks": [{
    "task_id": "8951709409",
    "content": "Updated title",
    "project_id": "2037432791",
    "priority": 3
  }]
}
```

**What Happens**:
1. Update: `{ content, priority }` → `POST /tasks/8951709409`
2. Move: `{ project_id }` → `POST /tasks/8951709409/move` (tries REST v2, falls back to Sync API if 404)

---

## Testing

### Run Smoke Test

```bash
cd /Users/heathweaver/Development/todoist-mcp-server-extended
node scripts/manual/todoist-api-smoke.mjs
```

**What It Tests**:
1. Creates two test projects (A and B)
2. Creates a task in Project A
3. Tests all three move APIs
4. Verifies task actually moved to Project B
5. Cleans up all test data

**Expected Output**:
```
🎯 HYPOTHESIS CONFIRMED: Sync API works, REST v2 fails for numeric IDs
✅ Todoist MCP API smoke test completed
```

### Manual Test via AI

Ask ChatGPT or Claude:
```
Move task 8951709409 to project 2037432791
```

Watch Docker logs:
```bash
docker logs -f todoist-mcp-server
```

Expected to see Sync API fallback triggered and succeed.

---

## Deployment Checklist

- [x] Hypothesis tested via smoke test
- [x] Sync API v9 confirmed to work
- [x] REST v2 confirmed to fail for numeric IDs
- [x] Fallback logic implemented
- [x] Code builds successfully
- [ ] **Deploy Docker container**
- [ ] **Test via AI interface**
- [ ] **Verify logs show Sync API fallback**
- [ ] **Confirm task moves in Todoist**

### Deploy Commands

```bash
cd /Users/heathweaver/Development/todoist-mcp-server-extended
docker-compose build
docker-compose up -d
docker logs -f todoist-mcp-server
```

---

## Why This Works

### REST v2 Failure
- Documentation claims `/move` supports numeric IDs
- In practice, returns 404 for numeric task IDs
- Appears to be Todoist API bug for pre-ULID accounts
- Bulk `/tasks/move` also fails (400 Bad Request)

### Sync API Success
- Designed for numeric IDs (older API)
- Proven stable for years
- `item_move` command explicitly supports numeric IDs
- Proper error handling via `sync_status`

### Fallback Strategy
1. **Try REST v2 first** - Works for ULID accounts
2. **Detect 404** - Endpoint incompatibility
3. **Fallback to Sync API** - Works for numeric accounts
4. **Future-proof** - When account migrates to ULIDs, REST v2 will work and fallback won't trigger

---

## ID Format Compatibility

Both implementations accept **both formats**:
- **ULIDs**: `01J0M8KPV7Z2F4S9DX3T8HCN8F` (26-char alphanumeric)
- **Numeric**: `8951709409` (legacy format)

All validated via `ensureUlid()` which accepts both patterns.

---

## Troubleshooting

### "Move failed (404)"
- **After deployment with Sync fallback**: Should not occur
- **Before deployment**: Expected - REST v2 doesn't work with numeric IDs
- **Check logs**: Should see "REST v2 move failed, trying Sync API fallback"

### "Move failed (other error)"
- Check task/project IDs are valid
- Verify authentication token
- Ensure write permissions on target project
- Review server logs for detailed error

### Silent Failure
- Check response: `success: false` with error details
- Each task in batch has individual success/error status
- Server logs contain full error context

---

## Investigation History

**Background**: Move operations consistently failed with 404 NOT_FOUND  
**Initial attempts**: Tried REST v2 `/move` endpoint as documented  
**Discovery**: Enhanced logging showed task exists but move fails  
**Hypothesis**: REST v2 doesn't work with numeric IDs  
**Proof**: Smoke test confirmed Sync API works, REST v2 fails  
**Solution**: Implemented automatic fallback to Sync API v9  

**Previous investigation files**: Consolidated into this document

