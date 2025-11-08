# Legacy ID Mapping System

## Overview

This server is designed to work exclusively with Todoist's modern ULID (Universally Unique Lexicographically Sortable Identifiers) format internally. However, it **accepts both ULID and legacy numeric ID formats** in all API requests to maximize compatibility.

Some Todoist accounts—particularly those created before the ULID migration—still receive legacy numeric IDs from the Todoist REST API v2. The server implements an automatic ID conversion layer that transparently maps legacy numeric IDs to ULIDs, ensuring all responses contain ULIDs regardless of which format was provided in the request.

## How It Works

### 1. Input Acceptance
All MCP tool endpoints accept **both ULID and legacy numeric ID formats** for identifier fields:
- **ULIDs**: 26-character alphanumeric strings (e.g., `"01J0M8KPV7Z2F4S9DX3T8HCN8F"`)
- **Legacy IDs**: Numeric strings (e.g., `"2995104339"`)

The input validation (`ensureUlid()`) checks for either format and accepts both.

### 2. Response Detection
When the server receives responses from the Todoist API (`getTasks()`, `getProjects()`, etc.), it checks if any IDs match the legacy numeric format.

### 3. Conversion
If numeric IDs are detected, the server calls Todoist's Sync API v9 `id_mappings` endpoint:

```
GET https://api.todoist.com/sync/v9/id_mappings/{resource_type}/{comma_separated_ids}
```

Where `resource_type` is one of:
- `tasks`
- `projects`
- `sections`

The endpoint returns a mapping of legacy numeric IDs to their ULID equivalents:

```json
{
  "2995104339": "01J0M8KPV7Z2F4S9DX3T8HCN8F",
  "2995104340": "01J0M8KPV7Z2F4S9DX3T8HCN8G"
}
```

### 4. Caching
Converted mappings are cached in memory (`Map<string, string>`) to avoid redundant API calls. The cache persists for the lifetime of the server process.

### 5. Response Transformation
All IDs in responses are replaced with their ULID equivalents before being returned to the client. This includes:
- Task IDs
- Project IDs
- Section IDs
- Parent task IDs
- Parent project IDs

## Implementation Details

### Input Validation

#### `ensureUlid(value: unknown, field: string): string`
Validates that a value is either:
- A ULID (26-character alphanumeric matching `^[0-9A-HJKMNP-TV-Z]{26}$`)
- A legacy numeric ID (matching `/^\d+$/`)

Throws an error if neither format is matched.

### Response Conversion

#### `isLegacyNumericId(value: string | null | undefined): boolean`
Checks if a value matches the legacy numeric ID format (`/^\d+$/`).

#### `mapLegacyIdsToUlids(resourceType, ids): Promise<Record<string, string>>`
Calls the Sync API v9 `id_mappings` endpoint and caches the results.

#### `convertTaskIdsToUlids(tasks): Promise<void>`
Converts all task-related IDs (task, project, section, parent) to ULIDs.

#### `convertProjectIdsToUlids(projects): Promise<void>`
Converts all project-related IDs (project, parent) to ULIDs.

#### `convertSectionIdsToUlids(sections): Promise<void>`
Converts all section-related IDs (section, project) to ULIDs.

### Where Conversion Happens

The conversion is applied in the following handlers:
- **`handleGetTasks`**: After fetching tasks from the API
- **`handleGetProjects`**: After fetching projects and sections

### Performance Considerations

- **Batch API Calls**: The server batches multiple IDs into a single `id_mappings` request (comma-separated).
- **Parallel Fetching**: Uses `Promise.all()` to fetch mappings for different resource types concurrently.
- **Caching**: Each mapping is cached permanently (until server restart) to minimize API overhead.

## Why ULIDs?

ULIDs offer several advantages over numeric IDs:
1. **Collision Resistance**: 128-bit random space makes collisions virtually impossible
2. **Lexicographic Sorting**: Naturally sortable by creation time
3. **URL-Safe**: No special characters that require escaping
4. **Future-Proof**: Todoist's modern API standard

## Migration Path

### For Users with Legacy IDs

Your server will work seamlessly with legacy IDs. All responses will automatically contain ULIDs, and you can use those ULIDs for subsequent operations.

**Recommended**: Contact Todoist support to request migration of your account to native ULID support. This will:
- Eliminate the need for ID mapping API calls
- Improve performance slightly
- Future-proof your integration

### Testing ULID vs. Legacy

To check if your account uses legacy IDs:

```bash
curl -H "Authorization: Bearer $TODOIST_API_TOKEN" \
  https://api.todoist.com/rest/v2/tasks | jq '.[0].id'
```

**Legacy ID**: `"2995104339"` (numeric string)  
**ULID**: `"01J0M8KPV7Z2F4S9DX3T8HCN8F"` (26-character alphanumeric)

## Error Handling

If the `id_mappings` endpoint fails (e.g., network error, invalid ID), the server:
1. Logs a warning to console
2. Returns an empty mapping for that batch
3. Leaves the original numeric IDs unchanged in the response

This graceful degradation ensures the server remains operational even if the mapping service is unavailable.

## API Documentation

See [Todoist Sync API v9 Documentation](https://developer.todoist.com/sync/v9/#get-id-mappings) for details on the `id_mappings` endpoint.

