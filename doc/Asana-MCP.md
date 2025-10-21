Asana

CUSTOM
https://mcp.asana.com/sse
Tools
Get attachment
Get detailed attachment data including name, resource type, download_url, view_url, and parent. Returns complete attachment information needed for accessing attached files.
...More
Get attachments for object
List all attachments for a project, project brief, or task. Returns attachment names, IDs, and URLs (download_url, permanent_url, view_url). Use for accessing files attached to Asana objects. Supports pagination for objects with many attachments.
...More
Get goals
List goals filtered by context (portfolio, project, task, workspace, or team). One context required. Returns goal names, IDs. Use for goal overview or reporting.
...More
Get goal
Get detailed goal data including name, owner, current_status_update, and due_on. Use after finding goal ID via typeahead. Returns complete goal configuration needed for goal operations.
...More
Create goal
Create a new goal. REQUIRES name, time_period, and either workspace or team. Use to establish objectives and key results. Returns created goal details with ID. Supports start/due dates and goal ownership assignment.
...More
Get parent goals for goal
List all parent goals for a specific goal. Returns parent goal names, IDs, and metric.progress. Use to understand goal hierarchy and relationships. Important for managing nested OKRs and goal dependencies.
...More
Update goal
Update goal properties like name, owner, dates, metrics, or status. Use for adjusting timelines, progress, or reassigning ownership. Returns updated goal data. Partial updates supported - only specified fields will change.
...More
Update goal metric
Update goal metric properties like current_number_value. Returns updated goal data. Partial updates supported - only specified fields will change.
...More
Get portfolio
Get detailed portfolio data by ID including name, owner, and projects. Use after finding portfolio ID via typeahead. Returns complete portfolio configuration. Essential for understanding portfolio context and content.
...More
Get portfolios
List portfolios filtered by workspace and owner. REQUIRES workspace parameter. Owner defaults to "me" (current user) if not specified. Returns portfolio names and IDs. Use for portfolio discovery and management. Supports pagination for workspaces with many portfolios.
...More
Get items for portfolio
List projects, goals, and other items in a portfolio. Returns item names, IDs, and types. Use for portfolio content exploration and management. Supports pagination for portfolios with many items.
...More
Get project
Get detailed project data including name, description, owner, members, custom fields, and settings. Use after finding project ID via typeahead. Returns complete project configuration needed for task operations. Specify opt_fields for custom fields data.
...More
Get project sections
List all sections in a project with their IDs. Essential for task placement and organization. Returns section names and IDs needed for creating/moving tasks. Use before creating tasks to find correct section ID.
...More
Get projects
List projects filtered by workspace. Supports team, archived filters. Returns project names and IDs. Use for filtered project views and bulk operations.
...More
Get project status
Get single status update by ID. Returns color (green/yellow/red), text, author, and timestamp. Use when you know specific status ID. For all statuses, use asana_get_project_statuses instead.
...More
Get project statuses
List all status updates for a project chronologically. Returns status color, text, author for each update. Use to track project health over time. Supports pagination for projects with many updates.
...More
Create project status
Create project status update with color (green/yellow/red) and text. Use for regular project health updates, milestone documentation, or blocker reporting. Supports HTML formatting. Returns created status ID.
...More
Get project task counts
Get task statistics for a project. Returns counts of incomplete, completed, and milestone tasks. Use for quick project progress overview, capacity checks, or reporting dashboards.
...More
Get projects for team
List all projects for a team. Returns both active and archived projects with IDs. Use after finding team ID via typeahead. Supports pagination for teams with many projects. Essential for team portfolio views.
...More
Get projects for workspace
Get ALL projects in a workspace across all teams. Returns project names and IDs. Use for workspace-wide operations or when team is unknown. May return large result set - consider using typeahead search first.
...More
Create project
Create new project in Asana. Every project requires a workspace, and this cannot be changed after creation. If workspace is an organization, a team must also be specified. Client agents should explicitly ask for team when creating a project rather than inferring it. Supports custom fields, templates, due dates, and privacy settings. Returns project ID for immediate task creation. Essential for project setup.
...More
Search tasks
Advanced task search with multiple filters. Supports text search, all date filters, status filters, user filters, project/portfolio/section/tag filters, and custom fields. Returns matching tasks with IDs. Handles complex queries and bulk task operations. When the user asks about tasks assigned to them, use assignee_any="me" for best results. Note: If you specify projects_any and sections_any, you will receive tasks for the project and tasks for the section. If you're looking for only tasks in a section, omit the projects_any from the request.
...More
Get task
Get full task details by ID. Returns name, description, assignee, due dates, custom fields, projects, dependencies. Essential before updating tasks. Use opt_fields for custom field values. Required for understanding task context.
...More
Create task
Create task in Asana with context. REQUIRES one of: project_id, parent, or workspace+assignee together. For assignee-only tasks, both workspace and assignee must be provided. Returns task ID with confirmation. You can directly tag and mention people by using links in html_notes field
...More
Update task
Update existing task properties. Change name, notes, assignee, completion status, due dates, custom fields. Requires task ID. Returns updated task data. Use asana_get_task first to understand current state.
...More
Get stories for task
Get task activity history (comments, status changes, system events). Returns chronological stories with authors and timestamps. Use for audit trails, understanding task evolution, or retrieving comments.
...More
Create task story
Add explicit comment to task. ONLY for discussion, feedback, questions, or context not captured by automatic activity logging. Task actions (assignments, status changes) are logged automatically. Returns story ID.
...More
Set task dependencies
Set tasks this task depends on (prerequisites). Creates dependency relationship where this task is blocked until dependencies complete. Use for workflow sequencing and project planning. Requires list of task IDs.
...More
Set task dependents
Set tasks blocked by this task (tasks waiting on this one). Creates dependency where other tasks cannot start until this completes. Use for blocking relationships in project schedules. Requires list of task IDs.
...More
Set parent for task
Change task parent (convert to/from subtask). Set parent=null to make regular task. Supports insert positioning among siblings. Use for reorganizing task hierarchy. Returns updated task hierarchy data.
...More
Get tasks
List tasks filtered by context (workspace/project/tag/section/user list). One context required. Supports assignee, date filters. Returns task names and IDs. Use for filtered task views and bulk operations.
...More
Delete task
Delete task from Asana. Use with extreme caution as recovery is challenging. Deletes the task and any subtasks that are not also in another project. Returns success confirmation. Requires task ID. Essential for removing duplicate or obsolete tasks.
...More
Add task followers
Add followers to task (team members to notify of updates). Automatically sends notifications for task changes. Returns updated followers list. Essential for task collaboration and visibility.
...More
Remove task followers
Remove followers from task (stop notification subscriptions). Prevents future notifications while maintaining history. Returns updated followers list. Essential for reducing notification noise or when team members change.
...More
Get teams for workspace
List all teams in workspace. Returns team names and IDs. Use to discover teams before searching team projects/users. Essential for workspace structure understanding. Supports pagination.
...More
Get teams for user
Get teams user belongs to. Returns team names and IDs. Use to check user team access or find teams for specific user. Requires organization ID. "me" supported for current user.
...More
Get time period
Get detailed information about a time period by ID. Returns name, start date, end date, and status. Use after finding time period ID from other tools. Essential for working with goals and time-based planning.
...More
Get time periods
List available time periods in a workspace. Filterable by date range. Returns time period names, IDs, start/end dates. REQUIRES workspace parameter. Use for goal planning, reporting periods, or OKR cycles.
...More
Typeahead search
Quick search across Asana objects. ALWAYS use this FIRST before specialized search. Returns most relevant items based on recency and usage. Faster than dedicated search tools for finding specific items. Works for: users, projects, tasks, teams, tags, portfolios, goals. Empty query returns recently accessed items. DO NOT guess the workspace GID. If no workspace GID is provided look it up.
...More
Get user
Get user details by ID, email, or "me". Returns name, email, workspaces. Use to find user IDs for task assignment. "me" returns authenticated user info. Essential before assigning tasks. When no user_id is provided, defaults to "me" (authenticated user) - equivalent to the former asana_get_user_info tool.
...More
Get team users
List all team members. Returns user names and IDs. Use team ID from typeahead search first. Supports pagination for large teams. Results are sorted alphabetically and limited to 2000 results.
Less
Get workspace users
Get all users in workspace. Returns compact users with names and IDs. Results are sorted alphabetically and limited to 2000. Prefer searching more narrowly, like by typeahead or team first instead of this.
Less
List workspaces
Get all accessible workspaces. Returns workspace IDs needed for most other operations. Always call this FIRST to discover valid workspace IDs before using workspace-specific tools. Results include workspace name, ID, and organization info.