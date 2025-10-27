import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { randomUUID } from 'crypto';

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

class TodoistMCPServer {
  private server: Server;
  private app: express.Application;
  private todoistClient: TodoistApi;

  constructor() {
    // Initialize Todoist API client
    const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN!;
    if (!TODOIST_API_TOKEN) {
      console.error("Error: TODOIST_API_TOKEN environment variable is required");
      process.exit(1);
    }
    this.todoistClient = new TodoistApi(TODOIST_API_TOKEN);

    this.server = new Server(
      {
        name: 'todoist-mcp-server-http',
        version: '0.2.5',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.app = express();
    this.setupHandlers();
    this.setupExpress();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "todoist_create_task",
            description: "Create one or more tasks in Todoist with full parameter support",
            inputSchema: {
              type: "object",
              properties: {
                tasks: {
                  type: "array",
                  description: "Array of tasks to create (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      content: { type: "string", description: "The content/title of the task (required)" },
                      description: { type: "string", description: "Detailed description of the task (optional)" },
                      project_id: { type: "string", description: "ID of the project to add the task to (optional)" },
                      section_id: { type: "string", description: "ID of the section to add the task to (optional)" },
                      parent_id: { type: "string", description: "ID of the parent task for subtasks (optional)" },
                      order: { type: "number", description: "Position in the project or parent task (optional)" },
                      labels: { type: "array", items: { type: "string" }, description: "Array of label names to apply to the task (optional)" },
                      priority: { type: "number", description: "Task priority from 1 (normal) to 4 (urgent) (optional)", enum: [1, 2, 3, 4] },
                      due_string: { type: "string", description: "Natural language due date like 'tomorrow', 'next Monday' (optional)" },
                      due_date: { type: "string", description: "Due date in YYYY-MM-DD format (optional)" },
                      due_datetime: { type: "string", description: "Due date and time in RFC3339 format (optional)" },
                      due_lang: { type: "string", description: "2-letter language code for due date parsing (optional)" },
                      assignee_id: { type: "string", description: "User ID to assign the task to (optional)" },
                      duration: { type: "number", description: "The duration amount of the task (optional)" },
                      duration_unit: { type: "string", description: "The duration unit ('minute' or 'day') (optional)", enum: ["minute", "day"] },
                      deadline_date: { type: "string", description: "Deadline date in YYYY-MM-DD format (optional)" },
                      deadline_lang: { type: "string", description: "2-letter language code for deadline parsing (optional)" }
                    },
                    required: ["content"]
                  }
                },
                // For backward compatibility - single task parameters
                content: { type: "string", description: "The content/title of the task" },
                description: { type: "string", description: "Detailed description of the task" },
                project_id: { type: "string", description: "ID of the project to add the task to" },
                section_id: { type: "string", description: "ID of the section to add the task to" },
                parent_id: { type: "string", description: "ID of the parent task for subtasks" },
                order: { type: "number", description: "Position in the project or parent task" },
                labels: { type: "array", items: { type: "string" }, description: "Array of label names to apply to the task" },
                priority: { type: "number", description: "Task priority from 1 (normal) to 4 (urgent)", enum: [1, 2, 3, 4] },
                due_string: { type: "string", description: "Natural language due date like 'tomorrow', 'next Monday'" },
                due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
                due_datetime: { type: "string", description: "Due date and time in RFC3339 format" },
                due_lang: { type: "string", description: "2-letter language code for due date parsing" },
                assignee_id: { type: "string", description: "User ID to assign the task to" },
                duration: { type: "number", description: "The duration amount of the task" },
                duration_unit: { type: "string", description: "The duration unit ('minute' or 'day')", enum: ["minute", "day"] },
                deadline_date: { type: "string", description: "Deadline date in YYYY-MM-DD format" },
                deadline_lang: { type: "string", description: "2-letter language code for deadline parsing" }
              },
              anyOf: [
                { required: ["tasks"] },
                { required: ["content"] }
              ]
            }
          },
          {
            name: "todoist_get_tasks",
            description: "Get a list of tasks from Todoist with various filters",
            inputSchema: {
              type: "object",
              properties: {
                project_id: { type: "string", description: "Filter tasks by project ID" },
                section_id: { type: "string", description: "Filter tasks by section ID" },
                label: { type: "string", description: "Filter tasks by label name" },
                filter: { type: "string", description: "Natural language filter like 'today', 'tomorrow', 'next week', 'priority 1', 'overdue'" },
                lang: { type: "string", description: "IETF language tag defining what language filter is written in" },
                ids: { type: "array", items: { type: "string" }, description: "Array of specific task IDs to retrieve" },
                priority: { type: "number", description: "Filter by priority level (1-4)" },
                limit: { type: "number", description: "Maximum number of tasks to return", default: 10 }
              }
            }
          },
          {
            name: "todoist_update_task",
            description: "Update one or more tasks in Todoist",
            inputSchema: {
              type: "object",
              properties: {
                tasks: {
                  type: "array",
                  description: "Array of tasks to update (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      task_id: { type: "string", description: "ID of the task to update (preferred)" },
                      task_name: { type: "string", description: "Name/content of the task to search for (if ID not provided)" },
                      content: { type: "string", description: "New content/title for the task" },
                      description: { type: "string", description: "New description for the task" },
                      project_id: { type: "string", description: "Move task to this project ID" },
                      section_id: { type: "string", description: "Move task to this section ID" },
                      labels: { type: "array", items: { type: "string" }, description: "New array of label names for the task" },
                      priority: { type: "number", description: "New priority level from 1 (normal) to 4 (urgent)" },
                      due_string: { type: "string", description: "New due date in natural language" },
                      due_date: { type: "string", description: "New due date in YYYY-MM-DD format" },
                      due_datetime: { type: "string", description: "New due date and time in RFC3339 format" },
                      due_lang: { type: "string", description: "2-letter language code for due date parsing" },
                      assignee_id: { type: "string", description: "New user ID to assign the task to" },
                      duration: { type: "number", description: "New duration amount of the task" },
                      duration_unit: { type: "string", description: "New duration unit ('minute' or 'day')" },
                      deadline_date: { type: "string", description: "New deadline date in YYYY-MM-DD format" },
                      deadline_lang: { type: "string", description: "2-letter language code for deadline parsing" }
                    },
                    anyOf: [
                      { required: ["task_id"] },
                      { required: ["task_name"] }
                    ]
                  }
                },
                // For backward compatibility - single task parameters
                task_id: { type: "string", description: "ID of the task to update (preferred)" },
                task_name: { type: "string", description: "Name/content of the task to search for (if ID not provided)" },
                content: { type: "string", description: "New content/title for the task" },
                description: { type: "string", description: "New description for the task" },
                project_id: { type: "string", description: "Move task to this project ID" },
                section_id: { type: "string", description: "Move task to this section ID" },
                labels: { type: "array", items: { type: "string" }, description: "New array of label names for the task" },
                priority: { type: "number", description: "New priority level from 1 (normal) to 4 (urgent)" },
                due_string: { type: "string", description: "New due date in natural language" },
                due_date: { type: "string", description: "New due date in YYYY-MM-DD format" },
                due_datetime: { type: "string", description: "New due date and time in RFC3339 format" },
                due_lang: { type: "string", description: "2-letter language code for due date parsing" },
                assignee_id: { type: "string", description: "New user ID to assign the task to" },
                duration: { type: "number", description: "New duration amount of the task" },
                duration_unit: { type: "string", description: "New duration unit ('minute' or 'day')" },
                deadline_date: { type: "string", description: "New deadline date in YYYY-MM-DD format" },
                deadline_lang: { type: "string", description: "2-letter language code for deadline parsing" }
              },
              anyOf: [
                { required: ["tasks"] },
                { required: ["task_id"] },
                { required: ["task_name"] }
              ]
            }
          },
          {
            name: "todoist_delete_task",
            description: "Delete one or more tasks from Todoist",
            inputSchema: {
              type: "object",
              properties: {
                tasks: {
                  type: "array",
                  description: "Array of tasks to delete (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      task_id: { type: "string", description: "ID of the task to delete (preferred)" },
                      task_name: { type: "string", description: "Name/content of the task to search for and delete (if ID not provided)" }
                    },
                    anyOf: [
                      { required: ["task_id"] },
                      { required: ["task_name"] }
                    ]
                  }
                },
                // For backward compatibility - single task parameters
                task_id: { type: "string", description: "ID of the task to delete (preferred)" },
                task_name: { type: "string", description: "Name/content of the task to search for and delete (if ID not provided)" }
              },
              anyOf: [
                { required: ["tasks"] },
                { required: ["task_id"] },
                { required: ["task_name"] }
              ]
            }
          },
          {
            name: "todoist_complete_task",
            description: "Mark one or more tasks as complete in Todoist",
            inputSchema: {
              type: "object",
              properties: {
                tasks: {
                  type: "array",
                  description: "Array of tasks to complete (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      task_id: { type: "string", description: "ID of the task to complete (preferred)" },
                      task_name: { type: "string", description: "Name/content of the task to search for and complete (if ID not provided)" }
                    },
                    anyOf: [
                      { required: ["task_id"] },
                      { required: ["task_name"] }
                    ]
                  }
                },
                // For backward compatibility - single task parameters
                task_id: { type: "string", description: "ID of the task to complete (preferred)" },
                task_name: { type: "string", description: "Name/content of the task to search for and complete (if ID not provided)" }
              },
              anyOf: [
                { required: ["tasks"] },
                { required: ["task_id"] },
                { required: ["task_name"] }
              ]
            }
          },
          {
            name: "todoist_get_projects",
            description: "Get projects with optional filtering and hierarchy information",
            inputSchema: {
              type: "object",
              properties: {
                project_ids: { type: "array", items: { type: "string" }, description: "Specific project IDs to retrieve" },
                include_sections: { type: "boolean", description: "Include sections within each project", default: false },
                include_hierarchy: { type: "boolean", description: "Include full parent-child relationships", default: false }
              }
            }
          },
          {
            name: "todoist_create_project",
            description: "Create one or more projects with support for nested hierarchies",
            inputSchema: {
              type: "object",
              properties: {
                projects: {
                  type: "array",
                  description: "Array of projects to create (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Name of the project (required)" },
                      parent_id: { type: "string", description: "Parent project ID" },
                      parent_name: { type: "string", description: "Name of the parent project (will be created or found automatically)" },
                      color: { type: "string", description: "Color of the project" },
                      favorite: { type: "boolean", description: "Whether the project is a favorite" },
                      view_style: { type: "string", description: "View style of the project ('list' or 'board')" },
                      sections: { type: "array", items: { type: "string" }, description: "Sections to create within this project" }
                    },
                    required: ["name"]
                  }
                },
                // For backward compatibility - single project parameters
                name: { type: "string", description: "Name of the project (required)" },
                parent_id: { type: "string", description: "Parent project ID" },
                color: { type: "string", description: "Color of the project" },
                favorite: { type: "boolean", description: "Whether the project is a favorite" },
                view_style: { type: "string", description: "View style of the project ('list' or 'board')" }
              },
              anyOf: [
                { required: ["projects"] },
                { required: ["name"] }
              ]
            }
          },
          {
            name: "todoist_get_task_comments",
            description: "Get comments for one or more tasks in Todoist",
            inputSchema: {
              type: "object",
              properties: {
                tasks: {
                  type: "array",
                  description: "Array of tasks to get comments for (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      task_id: { type: "string", description: "ID of the task to get comments for (preferred)" },
                      task_name: { type: "string", description: "Name/content of the task to search for and get comments (if ID not provided)" }
                    },
                    anyOf: [
                      { required: ["task_id"] },
                      { required: ["task_name"] }
                    ]
                  }
                },
                // For backward compatibility - single task parameters
                task_id: { type: "string", description: "ID of the task to get comments for (preferred)" },
                task_name: { type: "string", description: "Name/content of the task to search for and get comments (if ID not provided)" }
              },
              anyOf: [
                { required: ["tasks"] },
                { required: ["task_id"] },
                { required: ["task_name"] }
              ]
            }
          },
          {
            name: "todoist_create_task_comment",
            description: "Create comments for one or more tasks in Todoist",
            inputSchema: {
              type: "object",
              properties: {
                comments: {
                  type: "array",
                  description: "Array of comments to create (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      task_id: { type: "string", description: "ID of the task to add comment to (preferred)" },
                      task_name: { type: "string", description: "Name/content of the task to search for and add comment (if ID not provided)" },
                      content: { type: "string", description: "The content of the comment (required)" }
                    },
                    required: ["content"],
                    anyOf: [
                      { required: ["task_id"] },
                      { required: ["task_name"] }
                    ]
                  }
                },
                // For backward compatibility - single comment parameters
                task_id: { type: "string", description: "ID of the task to add comment to (preferred)" },
                task_name: { type: "string", description: "Name/content of the task to search for and add comment (if ID not provided)" },
                content: { type: "string", description: "The content of the comment (required)" }
              },
              anyOf: [
                { required: ["comments"] },
                { required: ["task_id", "content"] },
                { required: ["task_name", "content"] }
              ]
            }
          },
          {
            name: "todoist_create_section",
            description: "Create one or more sections in Todoist projects",
            inputSchema: {
              type: "object",
              properties: {
                sections: {
                  type: "array",
                  description: "Array of sections to create (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      project_id: { type: "string", description: "ID of the project to create the section in (preferred)" },
                      project_name: { type: "string", description: "Name of the project to create the section in (if ID not provided)" },
                      name: { type: "string", description: "Name of the section (required)" },
                      order: { type: "number", description: "Order of the section within the project (optional)" }
                    },
                    required: ["name"],
                    anyOf: [
                      { required: ["project_id"] },
                      { required: ["project_name"] }
                    ]
                  }
                },
                // For backward compatibility - single section parameters
                project_id: { type: "string", description: "ID of the project to create the section in (preferred)" },
                project_name: { type: "string", description: "Name of the project to create the section in (if ID not provided)" },
                name: { type: "string", description: "Name of the section (required)" },
                order: { type: "number", description: "Order of the section within the project (optional)" }
              },
              anyOf: [
                { required: ["sections"] },
                { required: ["project_id", "name"] },
                { required: ["project_name", "name"] }
              ]
            }
          },
          {
            name: "todoist_rename_section",
            description: "Rename one or more sections in Todoist",
            inputSchema: {
              type: "object",
              properties: {
                sections: {
                  type: "array",
                  description: "Array of sections to rename (for batch operations)",
                  items: {
                    type: "object",
                    properties: {
                      section_id: { type: "string", description: "ID of the section to rename (preferred)" },
                      section_name: { type: "string", description: "Current name of the section to search for and rename (if ID not provided)" },
                      project_id: { type: "string", description: "ID of the project (required when using section_name)" },
                      new_name: { type: "string", description: "New name for the section (required)" }
                    },
                    required: ["new_name"],
                    anyOf: [
                      { required: ["section_id"] },
                      { required: ["section_name", "project_id"] }
                    ]
                  }
                },
                // For backward compatibility - single section parameters
                section_id: { type: "string", description: "ID of the section to rename (preferred)" },
                section_name: { type: "string", description: "Current name of the section to search for and rename (if ID not provided)" },
                project_id: { type: "string", description: "ID of the project (required when using section_name)" },
                new_name: { type: "string", description: "New name for the section (required)" }
              },
              anyOf: [
                { required: ["sections"] },
                { required: ["section_id", "new_name"] },
                { required: ["section_name", "project_id", "new_name"] }
              ]
            }
          }
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'todoist_create_task': {
            const args = request.params.arguments as any;
            
            // Handle batch task creation
            if (args.tasks && args.tasks.length > 0) {
              const results = await Promise.all(args.tasks.map(async (taskData: any) => {
                try {
                  const apiParams: any = {
                    content: taskData.content,
                    description: taskData.description,
                    projectId: taskData.project_id,
                    sectionId: taskData.section_id,
                    parentId: taskData.parent_id,
                    order: taskData.order,
                    labels: taskData.labels,
                    priority: taskData.priority,
                    dueString: taskData.due_string,
                    dueDate: taskData.due_date,
                    dueDatetime: taskData.due_datetime,
                    dueLang: taskData.due_lang,
                    assigneeId: taskData.assignee_id,
                    duration: taskData.duration,
                    durationUnit: taskData.duration_unit,
                    deadlineDate: taskData.deadline_date,
                    deadlineLang: taskData.deadline_lang
                  };

                  const task = await this.todoistClient.addTask(apiParams);
                  return {
                    success: true,
                    task_id: task.id,
                    content: task.content
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    taskData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.tasks.length,
                    summary: {
                      total: args.tasks.length,
                      succeeded: successCount,
                      failed: args.tasks.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.tasks.length
              };
            }
            // Handle single task creation (backward compatibility)
            else {
              const apiParams: any = {
                content: args.content,
                description: args.description,
                projectId: args.project_id,
                sectionId: args.section_id,
                parentId: args.parent_id,
                order: args.order,
                labels: args.labels,
                priority: args.priority,
                dueString: args.due_string,
                dueDate: args.due_date,
                dueDatetime: args.due_datetime,
                dueLang: args.due_lang,
                assigneeId: args.assignee_id,
                duration: args.duration,
                durationUnit: args.duration_unit,
                deadlineDate: args.deadline_date,
                deadlineLang: args.deadline_lang
              };

              const task = await this.todoistClient.addTask(apiParams);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    task_id: task.id,
                    content: task.content
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          case 'todoist_get_tasks': {
            const args = request.params.arguments as any;
            const tasks = await this.todoistClient.getTasks();
            
            // Apply filters
            let filteredTasks = tasks;
            
            if (args.project_id) {
              filteredTasks = filteredTasks.filter(task => task.projectId === args.project_id);
            }
            if (args.section_id) {
              filteredTasks = filteredTasks.filter(task => task.sectionId === args.section_id);
            }
            if (args.label) {
              filteredTasks = filteredTasks.filter(task => task.labels?.includes(args.label));
            }
            if (args.priority) {
              filteredTasks = filteredTasks.filter(task => task.priority === args.priority);
            }
            if (args.ids) {
              filteredTasks = filteredTasks.filter(task => args.ids.includes(task.id));
            }
            
            // Apply limit
            const limit = args.limit || 10;
            filteredTasks = filteredTasks.slice(0, limit);
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  tasks: filteredTasks.map(task => ({
                    id: task.id,
                    content: task.content,
                    description: task.description,
                    project_id: task.projectId,
                    section_id: task.sectionId,
                    parent_id: task.parentId,
                    order: task.order,
                    labels: task.labels,
                    priority: task.priority,
                    due: task.due,
                    assignee_id: task.assigneeId,
                    duration: task.duration,
                    duration_unit: task.duration,
                    completed: task.isCompleted
                  }))
                }, null, 2)
              }],
              isError: false
            };
          }

          case 'todoist_update_task': {
            const args = request.params.arguments as any;
            
            // Handle batch task updates
            if (args.tasks && args.tasks.length > 0) {
              const allTasks = await this.todoistClient.getTasks();
              
              const results = await Promise.all(args.tasks.map(async (taskData: any) => {
                try {
                  let taskId = taskData.task_id;
                  
                  if (!taskId && taskData.task_name) {
                    const matchingTask = allTasks.find(task => 
                      task.content.toLowerCase().includes(taskData.task_name.toLowerCase())
                    );
                    if (!matchingTask) {
                      return {
                        success: false,
                        error: `Task not found: ${taskData.task_name}`,
                        task_name: taskData.task_name
                      };
                    }
                    taskId = matchingTask.id;
                  }
                  
                  if (!taskId) {
                    return {
                      success: false,
                      error: "Either task_id or task_name must be provided",
                      taskData
                    };
                  }

                  const updateParams: any = {};
                  if (taskData.content) updateParams.content = taskData.content;
                  if (taskData.description) updateParams.description = taskData.description;
                  if (taskData.project_id) updateParams.projectId = taskData.project_id;
                  if (taskData.section_id) updateParams.sectionId = taskData.section_id;
                  if (taskData.labels) updateParams.labels = taskData.labels;
                  if (taskData.priority) updateParams.priority = taskData.priority;
                  if (taskData.due_string) updateParams.dueString = taskData.due_string;
                  if (taskData.due_date) updateParams.dueDate = taskData.due_date;
                  if (taskData.due_datetime) updateParams.dueDatetime = taskData.due_datetime;
                  if (taskData.due_lang) updateParams.dueLang = taskData.due_lang;
                  if (taskData.assignee_id) updateParams.assigneeId = taskData.assignee_id;
                  if (taskData.duration) updateParams.duration = taskData.duration;
                  if (taskData.duration_unit) updateParams.durationUnit = taskData.duration_unit;
                  if (taskData.deadline_date) updateParams.deadlineDate = taskData.deadline_date;
                  if (taskData.deadline_lang) updateParams.deadlineLang = taskData.deadline_lang;

                  await this.todoistClient.updateTask(taskId, updateParams);
                  return {
                    success: true,
                    task_id: taskId,
                    content: taskData.content || `Task ID: ${taskId}`
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    taskData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.tasks.length,
                    summary: {
                      total: args.tasks.length,
                      succeeded: successCount,
                      failed: args.tasks.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.tasks.length
              };
            }
            // Handle single task update (backward compatibility)
            else {
              let taskId = args.task_id;
              
              if (!taskId && args.task_name) {
                const tasks = await this.todoistClient.getTasks();
                const matchingTask = tasks.find(task => 
                  task.content.toLowerCase().includes(args.task_name.toLowerCase())
                );
                if (!matchingTask) {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        success: false,
                        error: `Task not found: ${args.task_name}`
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
                taskId = matchingTask.id;
              }
              
              if (!taskId) {
                throw new Error("Either task_id or task_name must be provided");
              }

              const updateParams: any = {};
              if (args.content) updateParams.content = args.content;
              if (args.description) updateParams.description = args.description;
              if (args.project_id) updateParams.projectId = args.project_id;
              if (args.section_id) updateParams.sectionId = args.section_id;
              if (args.labels) updateParams.labels = args.labels;
              if (args.priority) updateParams.priority = args.priority;
              if (args.due_string) updateParams.dueString = args.due_string;
              if (args.due_date) updateParams.dueDate = args.due_date;
              if (args.due_datetime) updateParams.dueDatetime = args.due_datetime;
              if (args.due_lang) updateParams.dueLang = args.due_lang;
              if (args.assignee_id) updateParams.assigneeId = args.assignee_id;
              if (args.duration) updateParams.duration = args.duration;
              if (args.duration_unit) updateParams.durationUnit = args.duration_unit;
              if (args.deadline_date) updateParams.deadlineDate = args.deadline_date;
              if (args.deadline_lang) updateParams.deadlineLang = args.deadline_lang;

              await this.todoistClient.updateTask(taskId, updateParams);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    task_id: taskId,
                    content: args.content || `Task ID: ${taskId}`
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          case 'todoist_delete_task': {
            const args = request.params.arguments as any;
            
            // Handle batch task deletion
            if (args.tasks && args.tasks.length > 0) {
              const allTasks = await this.todoistClient.getTasks();
              
              const results = await Promise.all(args.tasks.map(async (taskData: any) => {
                try {
                  let taskId = taskData.task_id;
                  
                  if (!taskId && taskData.task_name) {
                    const matchingTask = allTasks.find(task => 
                      task.content.toLowerCase().includes(taskData.task_name.toLowerCase())
                    );
                    if (!matchingTask) {
                      return {
                        success: false,
                        error: `Task not found: ${taskData.task_name}`,
                        task_name: taskData.task_name
                      };
                    }
                    taskId = matchingTask.id;
                  }
                  
                  if (!taskId) {
                    return {
                      success: false,
                      error: "Either task_id or task_name must be provided",
                      taskData
                    };
                  }

                  await this.todoistClient.deleteTask(taskId);
                  return {
                    success: true,
                    task_id: taskId,
                    content: taskData.task_name || `Task ID: ${taskId}`
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    taskData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.tasks.length,
                    summary: {
                      total: args.tasks.length,
                      succeeded: successCount,
                      failed: args.tasks.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.tasks.length
              };
            }
            // Handle single task deletion (backward compatibility)
            else {
              let taskId = args.task_id;
              
              if (!taskId && args.task_name) {
                const tasks = await this.todoistClient.getTasks();
                const matchingTask = tasks.find(task => 
                  task.content.toLowerCase().includes(args.task_name.toLowerCase())
                );
                if (!matchingTask) {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        success: false,
                        error: `Task not found: ${args.task_name}`
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
                taskId = matchingTask.id;
              }
              
              if (!taskId) {
                throw new Error("Either task_id or task_name must be provided");
              }

              await this.todoistClient.deleteTask(taskId);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    task_id: taskId,
                    content: args.task_name || `Task ID: ${taskId}`
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          case 'todoist_complete_task': {
            const args = request.params.arguments as any;
            
            // Handle batch task completion
            if (args.tasks && args.tasks.length > 0) {
              const allTasks = await this.todoistClient.getTasks();
              
              const results = await Promise.all(args.tasks.map(async (taskData: any) => {
                try {
                  let taskId = taskData.task_id;
                  
                  if (!taskId && taskData.task_name) {
                    const matchingTask = allTasks.find(task => 
                      task.content.toLowerCase().includes(taskData.task_name.toLowerCase())
                    );
                    if (!matchingTask) {
                      return {
                        success: false,
                        error: `Task not found: ${taskData.task_name}`,
                        task_name: taskData.task_name
                      };
                    }
                    taskId = matchingTask.id;
                  }
                  
                  if (!taskId) {
                    return {
                      success: false,
                      error: "Either task_id or task_name must be provided",
                      taskData
                    };
                  }

                  await this.todoistClient.closeTask(taskId);
                  return {
                    success: true,
                    task_id: taskId,
                    content: taskData.task_name || `Task ID: ${taskId}`
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    taskData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.tasks.length,
                    summary: {
                      total: args.tasks.length,
                      succeeded: successCount,
                      failed: args.tasks.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.tasks.length
              };
            }
            // Handle single task completion (backward compatibility)
            else {
              let taskId = args.task_id;
              
              if (!taskId && args.task_name) {
                const tasks = await this.todoistClient.getTasks();
                const matchingTask = tasks.find(task => 
                  task.content.toLowerCase().includes(args.task_name.toLowerCase())
                );
                if (!matchingTask) {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        success: false,
                        error: `Task not found: ${args.task_name}`
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
                taskId = matchingTask.id;
              }
              
              if (!taskId) {
                throw new Error("Either task_id or task_name must be provided");
              }

              await this.todoistClient.closeTask(taskId);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    task_id: taskId,
                    content: args.task_name || `Task ID: ${taskId}`
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          case 'todoist_get_projects': {
            const args = request.params.arguments as any;
            const projects = await this.todoistClient.getProjects();
            
            let filteredProjects = projects;
            
            if (args.project_ids) {
              filteredProjects = filteredProjects.filter(project => 
                args.project_ids.includes(project.id)
              );
            }
            
            const result = filteredProjects.map(project => ({
              id: project.id,
              name: project.name,
              color: project.color,
              parent_id: project.parentId,
              order: project.order,
              comment_count: project.commentCount,
              is_shared: project.isShared,
              is_favorite: project.isFavorite,
              is_inbox_project: project.isInboxProject,
              is_team_inbox: project.isTeamInbox,
              view_style: project.viewStyle,
              url: project.url,
              created_at: null
            }));

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  projects: result
                }, null, 2)
              }],
              isError: false
            };
          }

          case 'todoist_create_project': {
            const args = request.params.arguments as any;
            
            // Handle batch project creation
            if (args.projects && args.projects.length > 0) {
              const results = await Promise.all(args.projects.map(async (projectData: any) => {
                try {
                  const apiParams: any = {
                    name: projectData.name,
                    parentId: projectData.parent_id,
                    color: projectData.color,
                    isFavorite: projectData.favorite,
                    viewStyle: projectData.view_style
                  };

                  const project = await this.todoistClient.addProject(apiParams);
                  return {
                    success: true,
                    project_id: project.id,
                    name: project.name
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    projectData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.projects.length,
                    summary: {
                      total: args.projects.length,
                      succeeded: successCount,
                      failed: args.projects.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.projects.length
              };
            }
            // Handle single project creation (backward compatibility)
            else {
              const apiParams: any = {
                name: args.name,
                parentId: args.parent_id,
                color: args.color,
                isFavorite: args.favorite,
                viewStyle: args.view_style
              };

              const project = await this.todoistClient.addProject(apiParams);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    project_id: project.id,
                    name: project.name
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          case 'todoist_get_task_comments': {
            const args = request.params.arguments as any;
            
            // Handle batch comment retrieval
            if (args.tasks && args.tasks.length > 0) {
              const allTasks = await this.todoistClient.getTasks();
              
              const results = await Promise.all(args.tasks.map(async (taskData: any) => {
                try {
                  let taskId = taskData.task_id;
                  
                  if (!taskId && taskData.task_name) {
                    const matchingTask = allTasks.find(task => 
                      task.content.toLowerCase().includes(taskData.task_name.toLowerCase())
                    );
                    if (!matchingTask) {
                      return {
                        success: false,
                        error: `Task not found: ${taskData.task_name}`,
                        task_name: taskData.task_name
                      };
                    }
                    taskId = matchingTask.id;
                  }
                  
                  if (!taskId) {
                    return {
                      success: false,
                      error: "Either task_id or task_name must be provided",
                      taskData
                    };
                  }

                  const comments = await this.todoistClient.getComments({ taskId });
                  return {
                    success: true,
                    task_id: taskId,
                    content: taskData.task_name || `Task ID: ${taskId}`,
                    comments: comments.map(comment => ({
                      id: comment.id,
                      content: comment.content,
                      posted_at: comment.postedAt
                    }))
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    taskData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.tasks.length,
                    summary: {
                      total: args.tasks.length,
                      succeeded: successCount,
                      failed: args.tasks.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.tasks.length
              };
            }
            // Handle single task comment retrieval (backward compatibility)
            else {
              let taskId = args.task_id;
              
              if (!taskId && args.task_name) {
                const tasks = await this.todoistClient.getTasks();
                const matchingTask = tasks.find(task => 
                  task.content.toLowerCase().includes(args.task_name.toLowerCase())
                );
                if (!matchingTask) {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        success: false,
                        error: `Task not found: ${args.task_name}`
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
                taskId = matchingTask.id;
              }
              
              if (!taskId) {
                throw new Error("Either task_id or task_name must be provided");
              }

              const comments = await this.todoistClient.getComments({ taskId });
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    task_id: taskId,
                    content: args.task_name || `Task ID: ${taskId}`,
                    comments: comments.map(comment => ({
                      id: comment.id,
                      content: comment.content,
                      posted_at: comment.postedAt
                    }))
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          case 'todoist_create_task_comment': {
            const args = request.params.arguments as any;
            
            // Handle batch comment creation
            if (args.comments && args.comments.length > 0) {
              const allTasks = await this.todoistClient.getTasks();
              
              const results = await Promise.all(args.comments.map(async (commentData: any) => {
                try {
                  let taskId = commentData.task_id;
                  
                  if (!taskId && commentData.task_name) {
                    const matchingTask = allTasks.find(task => 
                      task.content.toLowerCase().includes(commentData.task_name.toLowerCase())
                    );
                    if (!matchingTask) {
                      return {
                        success: false,
                        error: `Task not found: ${commentData.task_name}`,
                        task_name: commentData.task_name
                      };
                    }
                    taskId = matchingTask.id;
                  }
                  
                  if (!taskId) {
                    return {
                      success: false,
                      error: "Either task_id or task_name must be provided",
                      commentData
                    };
                  }

                  const comment = await this.todoistClient.addComment({
                    taskId,
                    content: commentData.content
                  });
                  
                  return {
                    success: true,
                    task_id: taskId,
                    content: commentData.task_name || `Task ID: ${taskId}`,
                    comment: {
                      id: comment.id,
                      content: comment.content,
                      posted_at: comment.postedAt
                    }
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    commentData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.comments.length,
                    summary: {
                      total: args.comments.length,
                      succeeded: successCount,
                      failed: args.comments.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.comments.length
              };
            }
            // Handle single comment creation (backward compatibility)
            else {
              let taskId = args.task_id;
              
              if (!taskId && args.task_name) {
                const tasks = await this.todoistClient.getTasks();
                const matchingTask = tasks.find(task => 
                  task.content.toLowerCase().includes(args.task_name.toLowerCase())
                );
                if (!matchingTask) {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        success: false,
                        error: `Task not found: ${args.task_name}`
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
                taskId = matchingTask.id;
              }
              
              if (!taskId) {
                throw new Error("Either task_id or task_name must be provided");
              }

              const comment = await this.todoistClient.addComment({
                taskId,
                content: args.content
              });
              
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    task_id: taskId,
                    content: args.task_name || `Task ID: ${taskId}`,
                    comment: {
                      id: comment.id,
                      content: comment.content,
                      posted_at: comment.postedAt
                    }
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          case 'todoist_create_section': {
            const args = request.params.arguments as any;
            
            // Handle batch section creation
            if (args.sections && args.sections.length > 0) {
              const allProjects = await this.todoistClient.getProjects();
              
              const results = await Promise.all(args.sections.map(async (sectionData: any) => {
                try {
                  let projectId = sectionData.project_id;
                  
                  if (!projectId && sectionData.project_name) {
                    const matchingProject = allProjects.find(project => 
                      project.name.toLowerCase().includes(sectionData.project_name.toLowerCase())
                    );
                    if (!matchingProject) {
                      return {
                        success: false,
                        error: `Project not found: ${sectionData.project_name}`,
                        project_name: sectionData.project_name
                      };
                    }
                    projectId = matchingProject.id;
                  }
                  
                  if (!projectId) {
                    return {
                      success: false,
                      error: "Either project_id or project_name must be provided",
                      sectionData
                    };
                  }

                  const apiParams: any = {
                    name: sectionData.name,
                    projectId: projectId
                  };
                  
                  if (sectionData.order !== undefined) {
                    apiParams.order = sectionData.order;
                  }

                  const section = await this.todoistClient.addSection(apiParams);
                  return {
                    success: true,
                    section_id: section.id,
                    name: section.name,
                    project_id: section.projectId
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    sectionData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.sections.length,
                    summary: {
                      total: args.sections.length,
                      succeeded: successCount,
                      failed: args.sections.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.sections.length
              };
            }
            // Handle single section creation (backward compatibility)
            else {
              let projectId = args.project_id;
              
              if (!projectId && args.project_name) {
                const projects = await this.todoistClient.getProjects();
                const matchingProject = projects.find(project => 
                  project.name.toLowerCase().includes(args.project_name.toLowerCase())
                );
                if (!matchingProject) {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        success: false,
                        error: `Project not found: ${args.project_name}`
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
                projectId = matchingProject.id;
              }
              
              if (!projectId) {
                throw new Error("Either project_id or project_name must be provided");
              }

              const apiParams: any = {
                name: args.name,
                projectId: projectId
              };
              
              if (args.order !== undefined) {
                apiParams.order = args.order;
              }

              const section = await this.todoistClient.addSection(apiParams);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    section_id: section.id,
                    name: section.name,
                    project_id: section.projectId
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          case 'todoist_rename_section': {
            const args = request.params.arguments as any;
            
            // Handle batch section renaming
            if (args.sections && args.sections.length > 0) {
              const results = await Promise.all(args.sections.map(async (sectionData: any) => {
                try {
                  let sectionId = sectionData.section_id;
                  
                  if (!sectionId && sectionData.section_name && sectionData.project_id) {
                    const sections = await this.todoistClient.getSections(sectionData.project_id);
                    const matchingSection = sections.find(section => 
                      section.name.toLowerCase().includes(sectionData.section_name.toLowerCase())
                    );
                    if (!matchingSection) {
                      return {
                        success: false,
                        error: `Section not found: ${sectionData.section_name}`,
                        section_name: sectionData.section_name
                      };
                    }
                    sectionId = matchingSection.id;
                  }
                  
                  if (!sectionId) {
                    return {
                      success: false,
                      error: "Either section_id or (section_name and project_id) must be provided",
                      sectionData
                    };
                  }

                  const section = await this.todoistClient.updateSection(sectionId, {
                    name: sectionData.new_name
                  });
                  
                  return {
                    success: true,
                    section_id: section.id,
                    old_name: sectionData.section_name || "N/A",
                    new_name: section.name,
                    project_id: section.projectId
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    sectionData
                  };
                }
              }));

              const successCount = results.filter(r => r.success).length;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: successCount === args.sections.length,
                    summary: {
                      total: args.sections.length,
                      succeeded: successCount,
                      failed: args.sections.length - successCount
                    },
                    results
                  }, null, 2)
                }],
                isError: successCount < args.sections.length
              };
            }
            // Handle single section renaming (backward compatibility)
            else {
              let sectionId = args.section_id;
              
              if (!sectionId && args.section_name && args.project_id) {
                const sections = await this.todoistClient.getSections(args.project_id);
                const matchingSection = sections.find(section => 
                  section.name.toLowerCase().includes(args.section_name.toLowerCase())
                );
                if (!matchingSection) {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        success: false,
                        error: `Section not found: ${args.section_name}`
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
                sectionId = matchingSection.id;
              }
              
              if (!sectionId) {
                throw new Error("Either section_id or (section_name and project_id) must be provided");
              }

              const section = await this.todoistClient.updateSection(sectionId, {
                name: args.new_name
              });
              
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    section_id: section.id,
                    old_name: args.section_name || "N/A",
                    new_name: section.name,
                    project_id: section.projectId
                  }, null, 2)
                }],
                isError: false
              };
            }
          }

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupExpress() {
    // Configure CORS to expose Mcp-Session-Id header
    this.app.use(cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id'],
    }));
    
    this.app.use(express.json());

    // Health check endpoint (public)
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', server: 'todoist-mcp-server-http' });
    });

    // MCP Streamable HTTP endpoint (handles GET, POST, DELETE)
    this.app.all('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.log(`Received ${req.method} request to /mcp`, {
        sessionId,
        hasBody: !!req.body,
        bodyType: req.body ? typeof req.body : 'none',
        isInitialize: req.body ? isInitializeRequest(req.body) : false,
      });
      
      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transport = transports[sessionId];
          console.log(`Reusing existing session: ${sessionId}`);
        } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
          // New session - create transport
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId: string) => {
              console.log(`New MCP session initialized: ${sessionId}`);
              transports[sessionId] = transport;
            },
          });
          
          // Set up onclose handler to clean up
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              console.log(`Session closed: ${sid}`);
              delete transports[sid];
            }
          };
          
          await this.server.connect(transport);
          console.log('Transport connected to server');
        } else {
          // Invalid request
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: Invalid session or missing initialize request',
            },
            id: null,
          });
          return;
        }

        // Handle the request through the transport
        console.log('About to call transport.handleRequest with body:', JSON.stringify(req.body).substring(0, 100));
        await transport.handleRequest(req, res, req.body);
        console.log('transport.handleRequest completed');
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });
  }

  async start() {
    const port = parseInt(process.env.PORT || '8766');
    const host = process.env.HOST || '0.0.0.0';

    this.app.listen(port, host, () => {
      console.log(`Todoist MCP Server HTTP running on http://${host}:${port}`);
      console.log(`Health check: http://${host}:${port}/health`);
      console.log(`MCP endpoint: http://${host}:${port}/mcp`);
    });
  }
}

// Start the server
const mcpServer = new TodoistMCPServer();
mcpServer.start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  process.exit(0);
});