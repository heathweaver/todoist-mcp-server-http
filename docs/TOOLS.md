# Todoist MCP Server Tools

All tools in the Todoist MCP server now operate exclusively with Todoist ULID identifiers. ULIDs are 26-character, case-sensitive strings composed of digits and uppercase letters (excluding I, L, O, and U). Provide ULIDs for every project, task, section, and user reference—name-based lookups are no longer supported.

## Task Tools

### `todoist_create_task`
Create one or more tasks.

**Request Schema**
```json
{
  "tasks": [
    {
      "content": "string",
      "description": "string",
      "project_id": "ULID",
      "section_id": "ULID",
      "parent_id": "ULID",
      "labels": ["string"],
      "priority": 1,
      "due_string": "string",
      "due_date": "YYYY-MM-DD",
      "due_datetime": "RFC3339",
      "due_lang": "string",
      "assignee_id": "ULID",
      "duration": 30,
      "duration_unit": "minute"
    }
  ]
}
```
Supply at least one task entry. `content` is required. If you provide `duration`, you must also provide `duration_unit` (`minute` or `day`).

**Example**
```json
{
  "tasks": [
    {
      "content": "Draft project README",
      "project_id": "01J0M8KPV7Z2F4S9DX3T8HCN8G",
      "priority": 3,
      "due_string": "next Monday"
    }
  ]
}
```

### `todoist_get_tasks`
Retrieve tasks with optional filters.

**Parameters**
- `project_id`: ULID filter.
- `section_id`: ULID filter.
- `label`: Name of a Todoist label.
- `filter`: Todoist filter expression (e.g. `"today"`).
- `lang`: Filter language code.
- `ids`: Array of task ULIDs.
- `priority`: Integer 1–4.
- `limit`: Integer 1–200 (default behaves like Todoist default).

**Example**
```json
{
  "project_id": "01J0M8KPV7Z2F4S9DX3T8HCN8G",
  "priority": 4,
  "limit": 5
}
```

### `todoist_update_task`
Update one or more tasks. Each update requires a `task_id` ULID.

**Request Schema**
```json
{
  "tasks": [
    {
      "task_id": "ULID",
      "content": "string",
      "description": "string",
      "project_id": "ULID",
      "section_id": null,
      "parent_id": "ULID",
      "labels": ["string"],
      "priority": 2,
      "due_string": "string",
      "due_date": "YYYY-MM-DD",
      "due_datetime": "RFC3339",
      "due_lang": "string or null",
      "assignee_id": "ULID or null",
      "duration": 45,
      "duration_unit": "minute"
    }
  ]
}
```
Set `section_id` or `parent_id` to `null` to detach. If you move a task, provide the destination ULID.

**Example**
```json
{
  "tasks": [
    {
      "task_id": "01J0M8KPV7Z2F4S9DX3T8HCN8F",
      "due_string": "tomorrow",
      "priority": 4,
      "project_id": "01J0M8KPV7Z2F4S9DX3T8HCN8G"
    }
  ]
}
```

### `todoist_delete_task`
Delete tasks by ULID.

**Request Schema**
```json
{
  "tasks": [
    { "task_id": "ULID" }
  ]
}
```

### `todoist_complete_task`
Mark tasks as complete.

**Request Schema**
```json
{
  "tasks": [
    { "task_id": "ULID" }
  ]
}
```

## Project Tools

### `todoist_get_projects`
List projects, optionally including sections and hierarchy data.

**Parameters**
- `project_ids`: Array of project ULIDs to filter. Omit to fetch all accessible projects.
- `include_sections`: Boolean. When true, sections for each project are included.
- `include_hierarchy`: Boolean. When true, each project lists child project ULIDs.

**Example**
```json
{
  "include_sections": true,
  "include_hierarchy": true
}
```

### `todoist_create_project`
Create projects with optional parent relationships.

**Request Schema**
```json
{
  "projects": [
    {
      "name": "string",
      "parent_id": "ULID",
      "color": "string",
      "favorite": true,
      "view_style": "board"
    }
  ]
}
```

## Comment Tools

### `todoist_get_task_comments`
Fetch comments for tasks.

**Request Schema**
```json
{
  "tasks": [
    { "task_id": "ULID" }
  ]
}
```

### `todoist_create_task_comment`
Create comments for tasks.

**Request Schema**
```json
{
  "comments": [
    {
      "task_id": "ULID",
      "content": "string"
    }
  ]
}
```

## Section Tools

### `todoist_create_section`
Create sections under a project.

**Request Schema**
```json
{
  "sections": [
    {
      "project_id": "ULID",
      "name": "string",
      "order": 1
    }
  ]
}
```

### `todoist_rename_section`
Rename sections.

**Request Schema**
```json
{
  "sections": [
    {
      "section_id": "ULID",
      "new_name": "string"
    }
  ]
}
```

## Notes
- All IDs must be ULIDs issued by Todoist. Numeric IDs from legacy APIs are not accepted.
- Batch requests must include at least one entry.
- When setting or clearing relational fields (project, section, parent, assignee), provide the explicit ULID or `null` where allowed.
- Todoist API validation still applies—invalid combinations will surface as API errors returned by the tool.
