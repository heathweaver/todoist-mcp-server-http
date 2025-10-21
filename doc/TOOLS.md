# Todoist MCP Server Tools

This document describes the available tools in the Todoist MCP Server. These tools allow Claude to interact with your Todoist account to manage projects, sections, tasks, and labels.

## Task Tools

### todoist_create_task

Create one or more tasks in Todoist with full parameter support.

#### Single Task Format

- `content` (string, required): The content/title of the task
- `description` (string): Detailed description of the task
- `project_id` (string): ID of the project to add the task to
- `section_id` (string): ID of the section to add the task to
- `parent_id` (string): ID of the parent task for subtasks
- `order` (number): Position in the project or parent task
- `labels` (array of strings): Array of label names to apply to the task
- `priority` (number): Task priority from 1 (normal) to 4 (urgent)
- `due_string` (string): Natural language due date like 'tomorrow', 'next Monday'
- `due_date` (string): Due date in YYYY-MM-DD format
- `due_datetime` (string): Due date and time in RFC3339 format
- `due_lang` (string): 2-letter language code for due date parsing
- `assignee_id` (string): User ID to assign the task to
- `duration` (number): The duration amount of the task
- `duration_unit` (string): The duration unit ('minute' or 'day')
- `deadline_date` (string): Deadline date in YYYY-MM-DD format
- `deadline_lang` (string): 2-letter language code for deadline parsing

#### Batch Format

- `tasks` (array): Array of task objects, each containing the same parameters as above

#### Example

```json
{
  "content": "Buy groceries",
  "priority": 2,
  "due_string": "tomorrow"
}
```

Or for batch operations:

```json
{
  "tasks": [
    {
      "content": "Buy milk",
      "project_id": "2203306141"
    },
    {
      "content": "Buy eggs",
      "project_id": "2203306141"
    }
  ]
}
```

### todoist_get_tasks

Get a list of tasks from Todoist with various filters.

#### Parameters

- `project_id` (string): Filter tasks by project ID
- `section_id` (string): Filter tasks by section ID
- `label` (string): Filter tasks by label name
- `filter` (string): Natural language filter like 'today', 'tomorrow', 'next week', 'priority 1', 'overdue'
- `lang` (string): IETF language tag defining what language filter is written in
- `ids` (array of strings): Array of specific task IDs to retrieve
- `priority` (number): Filter by priority level (1-4)
- `limit` (number, default 10): Maximum number of tasks to return

#### Example

```json
{
  "filter": "today",
  "priority": 4
}
```

### todoist_update_task

Update one or more tasks in Todoist.

#### Single Task Format

- `task_id` (string, preferred): ID of the task to update
- `task_name` (string): Name/content of the task to search for (if ID not provided)
- `content` (string): New content/title for the task
- `description` (string): New description for the task
- `project_id` (string): Move task to this project ID
- `section_id` (string): Move task to this section ID
- `labels` (array of strings): New array of label names for the task
- `priority` (number): New priority level from 1 (normal) to 4 (urgent)
- `due_string` (string): New due date in natural language
- `due_date` (string): New due date in YYYY-MM-DD format
- `due_datetime` (string): New due date and time in RFC3339 format
- `due_lang` (string): 2-letter language code for due date parsing
- `assignee_id` (string): New user ID to assign the task to
- `duration` (number): New duration amount of the task
- `duration_unit` (string): New duration unit ('minute' or 'day')
- `deadline_date` (string): New deadline date in YYYY-MM-DD format
- `deadline_lang` (string): 2-letter language code for deadline parsing

#### Batch Format

- `tasks` (array): Array of task objects, each containing a task_id or task_name plus any parameters to update

#### Example

```json
{
  "task_id": "2995104339",
  "due_string": "tomorrow",
  "priority": 3
}
```

### todoist_delete_task

Delete one or more tasks from Todoist.

#### Single Task Format

- `task_id` (string, preferred): ID of the task to delete
- `task_name` (string): Name/content of the task to search for and delete (if ID not provided)

#### Batch Format

- `tasks` (array): Array of objects with task_id or task_name

#### Example

```json
{
  "task_name": "Buy groceries"
}
```

### todoist_complete_task

Mark one or more tasks as complete in Todoist.

#### Single Task Format

- `task_id` (string, preferred): ID of the task to complete
- `task_name` (string): Name/content of the task to search for and complete (if ID not provided)

#### Batch Format

- `tasks` (array): Array of objects with task_id or task_name

#### Example

```json
{
  "task_name": "Buy groceries"
}
```

### todoist_update_task_labels

Update the labels of one or more tasks in Todoist.

#### Single Task Format

- `task_id` (string, preferred): ID of the task to update labels for
- `task_name` (string): Name/content of the task to search for and update labels (if ID not provided)
- `labels` (array of strings, required): Array of label names to set for the task

#### Batch Format

- `tasks` (array): Array of objects with task_id or task_name and labels array

#### Example

```json
{
  "task_name": "Buy groceries",
  "labels": ["Shopping", "Urgent"]
}
```

## Project Tools

### todoist_get_projects

Get projects with optional filtering and hierarchy information.

#### Parameters

- `project_ids` (array of strings): Specific project IDs to retrieve
- `include_sections` (boolean, default false): Include sections within each project
- `include_hierarchy` (boolean, default false): Include full parent-child relationships

#### Example

```json
{
  "include_sections": true,
  "include_hierarchy": true
}
```

### todoist_create_project

Create one or more projects with support for nested hierarchies.

#### Single Project Format

- `name` (string, required): Name of the project
- `parent_id` (string): Parent project ID
- `color` (string): Color of the project
- `favorite` (boolean): Whether the project is a favorite
- `view_style` (string): View style of the project ('list' or 'board')

#### Batch Format

- `projects` (array): Array of project objects with the following properties:
  - `name` (string, required): Name of the project
  - `parent_id` (string): Parent project ID
  - `parent_name` (string): Name of the parent project (will be created or found automatically)
  - `color` (string): Color of the project
  - `favorite` (boolean): Whether the project is a favorite
  - `view_style` (string): View style of the project ('list' or 'board')
  - `sections` (array of strings): Sections to create within this project

#### Available Colors

`berry_red`, `red`, `orange`, `yellow`, `olive_green`, `lime_green`, `green`, `mint_green`, `teal`, `sky_blue`, `light_blue`, `blue`, `grape`, `violet`, `lavender`, `magenta`, `salmon`, `charcoal`, `grey`, `taupe`

#### Example

```json
{
  "name": "Work Projects",
  "color": "blue", 
  "favorite": true
}
```

### todoist_update_project

Update one or more projects in Todoist.

#### Single Project Format

- `project_id` (string, required): ID of the project to update
- `name` (string): New name for the project
- `color` (string): New color for the project
- `favorite` (boolean): Whether the project should be a favorite
- `view_style` (string): View style of the project ('list' or 'board')

#### Batch Format

- `projects` (array): Array of project objects with project_id or project_name plus parameters to update

#### Example

```json
{
  "project_id": "2203306141",
  "name": "New Project Name",
  "color": "red"
}
```

### todoist_get_project_sections

Get sections from one or more projects in Todoist.

#### Single Project Format

- `project_id` (string): ID of the project to get sections from
- `project_name` (string): Name of the project to get sections from (if ID not provided)
- `include_empty` (boolean, default true): Whether to include sections with no tasks

#### Batch Format

- `projects` (array): Array of objects with project_id or project_name

#### Example

```json
{
  "project_name": "Work Projects",
  "include_empty": false
}
```

### todoist_create_project_section

Create one or more sections in Todoist projects.

#### Single Section Format

- `project_id` (string, required): ID of the project
- `name` (string, required): Name of the section
- `order` (number): Order of the section

#### Batch Format

- `sections` (array): Array of section objects with the following properties:
  - `project_id` (string): ID of the project to create the section in
  - `project_name` (string): Name of the project to create the section in (if ID not provided)
  - `name` (string, required): Name of the section
  - `order` (number): Order of the section

#### Example

```json
{
  "project_id": "2203306141",
  "name": "Planning"
}
```

## Personal Label Tools

### todoist_get_personal_labels

Get all personal labels from Todoist.

#### Parameters

No parameters required.

### todoist_create_personal_label

Create one or more personal labels in Todoist.

#### Single Label Format

- `name` (string, required): Name of the label
- `color` (string): Color of the label
- `order` (number): Order of the label
- `is_favorite` (boolean): Whether the label is a favorite

#### Batch Format

- `labels` (array): Array of label objects with the same properties as above

#### Example

```json
{
  "name": "Important",
  "color": "red",
  "is_favorite": true
}
```

### todoist_get_personal_label

Get a personal label by ID.

#### Parameters

- `label_id` (string, required): ID of the label to retrieve

#### Example

```json
{
  "label_id": "2156154810"
}
```

### todoist_update_personal_label

Update one or more existing personal labels in Todoist.

#### Single Label Format

- `label_id` (string): ID of the label to update
- `label_name` (string): Name of the label to search for and update (if ID not provided)
- `name` (string): New name for the label
- `color` (string): New color for the label
- `order` (number): New order for the label
- `is_favorite` (boolean): Whether the label is a favorite

#### Batch Format

- `labels` (array): Array of label objects with label_id or label_name plus parameters to update

#### Example

```json
{
  "label_name": "Important",
  "color": "orange",
  "is_favorite": true
}
```

### todoist_delete_personal_label

Delete a personal label from Todoist.

#### Parameters

- `label_id` (string, required): ID of the label to delete

#### Example

```json
{
  "label_id": "2156154810"
}
```

## Shared Label Tools

### todoist_get_shared_labels

Get all shared labels from Todoist.

#### Parameters

- `omit_personal` (boolean): Whether to exclude the names of the user's personal labels from the results (default: false)

#### Example

```json
{
  "omit_personal": true
}
```

### todoist_rename_shared_labels

Rename one or more shared labels in Todoist.

#### Single Label Format

- `name` (string, required): The name of the existing label to rename
- `new_name` (string, required): The new name for the label

#### Batch Format

- `labels` (array): Array of objects with name and new_name properties

#### Example

```json
{
  "name": "OldLabelName",
  "new_name": "NewLabelName"
}
```

### todoist_remove_shared_labels

Remove one or more shared labels from Todoist tasks.

#### Single Label Format

- `name` (string, required): The name of the label to remove

#### Batch Format

- `labels` (array): Array of objects with name property

#### Example

```json
{
  "name": "UnwantedLabel"
}
```

## Tips for Using Todoist Tools

1. **Finding Objects by Name**: Most tools support finding items by name when you don't have the ID. For example, you can use `task_name` instead of `task_id`, or `project_name` instead of `project_id`.

2. **Batch Operations**: Use batch operations when you need to create, update, or delete multiple items at once. This is more efficient than making multiple single requests.

3. **Colors**: When specifying colors, use the color name strings like `"red"`, `"blue"`, `"green"`, etc. See the full list of available colors under the create_project tool.

4. **Due Dates**: For due dates, you can use:
   - `due_string` for natural language like "tomorrow" or "next Monday at 3pm"
   - `due_date` for specific dates in YYYY-MM-DD format
   - `due_datetime` for specific date and time in RFC3339 format

5. **Priority Levels**: Task priorities range from 1 (normal) to 4 (urgent).

6. **Labels**: Labels can be either personal (stored in your account) or shared (only appear on tasks). The tools allow managing both types.

## Comment Tools

### todoist_get_task_comments

Get comments for one or more tasks in Todoist.

#### Single Task Format

- `task_id` (string): ID of the task to get comments for (preferred)
- `task_name` (string): Name/content of the task to search for and get comments (if ID not provided)

#### Batch Format

- `tasks` (array): Array of task objects, each containing task_id or task_name

#### Example

```json
{
  "task_name": "Review PR"
}
```

Or for batch operations:

```json
{
  "tasks": [
    {
      "task_id": "2995104339"
    },
    {
      "task_name": "Review PR"
    }
  ]
}
```

### todoist_create_task_comment

Create comments for one or more tasks in Todoist.

#### Single Comment Format

- `task_id` (string): ID of the task to add comment to (preferred)
- `task_name` (string): Name/content of the task to search for and add comment (if ID not provided)
- `content` (string, required): The content of the comment

#### Batch Format

- `comments` (array): Array of comment objects, each containing task_id or task_name plus content

#### Example

```json
{
  "task_name": "Review PR",
  "content": "This looks good, just need to fix the typo on line 42"
}
```

Or for batch operations:

```json
{
  "comments": [
    {
      "task_id": "2995104339",
      "content": "Started working on this"
    },
    {
      "task_name": "Review PR",
      "content": "This looks good, just need to fix the typo on line 42"
    }
  ]
}
```
