# Dual ID Format Support

## Quick Summary

✅ **The MCP server now accepts BOTH ULID and legacy numeric ID formats for all identifier fields**  
✅ **All responses always contain ULIDs, regardless of input format**  
✅ **AIs can freely use either format when calling tools**

## For AI Clients (Claude, ChatGPT, etc.)

When using this MCP server, you can provide identifiers in **either format**:

### ULID Format (Modern)
```json
{
  "task_id": "01J0M8KPV7Z2F4S9DX3T8HCN8F"
}
```

### Legacy Numeric Format
```json
{
  "task_id": "2995104339"
}
```

Both are equally valid. The server will:
1. Accept your request regardless of which format you use
2. Process it correctly
3. Return responses with **ULID identifiers only**

## Example Usage

### Creating a Task with Legacy Project ID
```json
{
  "tool": "todoist_create_task",
  "arguments": {
    "tasks": [{
      "content": "New task",
      "project_id": "2995104339"  // ← Legacy numeric ID works!
    }]
  }
}
```

**Response** (always contains ULIDs):
```json
{
  "success": true,
  "task": {
    "id": "01J0M8KPV7Z2F4S9DX3T8HCN8G",
    "content": "New task",
    "project_id": "01J0M8KPV7Z2F4S9DX3T8HCN8F"  // ← Converted to ULID
  }
}
```

### Getting Tasks by Legacy ID
```json
{
  "tool": "todoist_get_tasks",
  "arguments": {
    "ids": ["2995104339", "2995104340"]  // ← Legacy IDs work!
  }
}
```

**Response** (always ULIDs):
```json
{
  "success": true,
  "tasks": [
    {
      "id": "01J0M8KPV7Z2F4S9DX3T8HCN8F",
      "content": "Task 1",
      "project_id": "01J0M8KPV7Z2F4S9DX3T8HCN8G"
    },
    {
      "id": "01J0M8KPV7Z2F4S9DX3T8HCN8H",
      "content": "Task 2",
      "project_id": "01J0M8KPV7Z2F4S9DX3T8HCN8G"
    }
  ]
}
```

## Why This Matters

### For Users with Legacy Accounts
Some Todoist accounts still receive numeric IDs from the Todoist API instead of ULIDs. Without dual format support, AIs would have to:
1. Recognize the legacy format
2. Convert it themselves (which they can't)
3. Or fail the request entirely

**Now**: AIs can use whatever IDs they receive from Todoist directly, and the server handles the conversion.

### For Users with Modern Accounts
If your Todoist account already uses ULIDs natively:
- Everything works seamlessly
- No conversion overhead
- The server just passes ULIDs through

## Technical Details

### What Gets Accepted (Input)
- **ULIDs**: 26-character alphanumeric strings (e.g., `01J0M8KPV7Z2F4S9DX3T8HCN8F`)
- **Legacy IDs**: Numeric strings (e.g., `2995104339`)

### What Gets Returned (Output)
- **Always ULIDs**: All responses contain ULID identifiers
- Consistent format regardless of input

### Validation
The server validates that inputs are **either**:
- A valid ULID (matching `^[0-9A-HJKMNP-TV-Z]{26}$`)
- A valid legacy numeric ID (matching `^\d+$`)

Invalid formats (empty strings, special characters, etc.) will be rejected.

## Tools That Support Dual Format

**All 11 tools accept both formats**:
1. `todoist_create_task` - project_id, section_id, parent_id, assignee_id
2. `todoist_get_tasks` - project_id, section_id, ids[]
3. `todoist_update_task` - task_id, project_id, section_id, parent_id, assignee_id
4. `todoist_delete_task` - task_id
5. `todoist_complete_task` - task_id
6. `todoist_get_projects` - project_ids[]
7. `todoist_create_project` - parent_id
8. `todoist_get_task_comments` - task_id
9. `todoist_create_task_comment` - task_id
10. `todoist_create_section` - project_id
11. `todoist_rename_section` - section_id

## Migration Recommendation

While the server fully supports legacy IDs, users with legacy accounts should consider:
1. Requesting a migration to ULIDs via Todoist support
2. This eliminates the need for runtime ID mapping
3. Slightly improves performance (no extra API calls)

However, **there's no urgency**—the dual format support ensures everything works seamlessly regardless of account type.

## See Also

- `doc/legacy-id-mapping.md` - Technical details on the conversion system
- `CHANGELOG.md` - Version history and changes

