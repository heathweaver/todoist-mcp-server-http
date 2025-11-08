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
import { randomUUID, createHash } from 'crypto';

const SCOPES = ['todoist.read', 'todoist.write'] as const;
const DEFAULT_SCOPE = SCOPES.join(' ');
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type TokenInfo = {
  user: string;
  createdAt: number;
  scope: string;
  expiresAt: number | null;
};

type AuthorizationCodeRecord = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scope: string;
  user: string;
  createdAt: number;
  expiresAt: number;
};

type PendingAuthState =
  | { type: 'manual'; createdAt: number; scope: string }
  | {
      type: 'oauth';
      clientId: string;
      redirectUri: string;
      codeChallenge: string;
      codeChallengeMethod: 'S256';
      scope: string;
      originalState: string;
      createdAt: number;
    };

type RegisteredClient = {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
  scope: string;
  tokenEndpointAuthMethod: 'none' | 'client_secret_basic' | 'client_secret_post';
  clientSecret?: string;
  clientIdIssuedAt: number;
  clientSecretExpiresAt: number | null;
  registrationAccessToken: string;
};

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sha256Base64Url(value: string): string {
  return base64UrlEncode(createHash('sha256').update(value).digest());
}

function sanitizeScope(scope?: string): string {
  if (!scope || !scope.trim()) {
    return DEFAULT_SCOPE;
  }
  const scopes = scope
    .split(/\s+/)
    .filter(Boolean)
    .filter(s => (SCOPES as readonly string[]).includes(s));
  return scopes.length ? scopes.join(' ') : DEFAULT_SCOPE;
}

function scopesAreValid(scope: string): boolean {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .every(s => (SCOPES as readonly string[]).includes(s));
}

const ULID_PATTERN = '^[0-9A-HJKMNP-TV-Z]{26}$';
const ULID_REGEX = new RegExp(ULID_PATTERN);
const LEGACY_NUMERIC_ID_REGEX = /^\d+$/;

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
};

function ensureUlid(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  // Accept both ULIDs and legacy numeric IDs
  if (!ULID_REGEX.test(value) && !LEGACY_NUMERIC_ID_REGEX.test(value)) {
    throw new Error(`${field} must be a ULID (26-character alphanumeric) or legacy numeric ID`);
  }
  return value;
}

function ensureNullableUlid(value: unknown, field: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return ensureUlid(value, field);
}

function ensureOptionalUlid(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return ensureUlid(value, field);
}

function ensureNonEmptyArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array`);
  }
  return value as T[];
}

function ensureObject<T extends Record<string, unknown>>(value: unknown, field: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as T;
}

function ensureString(value: unknown, field: string, { allowEmpty = false }: { allowEmpty?: boolean } = {}): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw new Error(`${field} must not be empty`);
  }
    return value;
  }

function ensureOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return ensureString(value, field);
}

function ensureNullableString(value: unknown, field: string, { allowEmpty = false }: { allowEmpty?: boolean } = {}): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return ensureString(value, field, { allowEmpty });
}

function ensureOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function ensureOptionalIntegerInRange(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function ensureOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function ensureStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value as string[];
}

function ensureOptionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function ensureUlidArray(value: unknown, field: string, { allowEmpty = false }: { allowEmpty?: boolean } = {}): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (!allowEmpty && value.length === 0) {
    throw new Error(`${field} must not be empty`);
  }
  return value.map((item, index) => ensureUlid(item, `${field}[${index}]`));
}

function buildToolResponse(payload: unknown, isError: boolean): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

function buildBatchResponse<T extends { success: boolean }>(results: T[], total: number): ToolResponse {
  const successCount = results.filter(result => result.success).length;
  return buildToolResponse(
    {
      success: successCount === total,
      summary: {
        total,
        succeeded: successCount,
        failed: total - successCount,
      },
      results,
    },
    successCount !== total
  );
}

function ulidSchema(description: string) {
  return {
    type: "string",
    description: `${description} Accepts both ULID (26-char alphanumeric) and legacy numeric ID formats.`,
  };
}

function nullableUlidSchema(description: string) {
  return {
    anyOf: [
      { type: "string" },
      { type: "null" },
    ],
    description: `${description} Accepts both ULID (26-char alphanumeric) and legacy numeric ID formats, or null.`,
  };
}

function getQueryParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};
// Store issued API tokens by token string (in-memory)
const issuedTokens = new Map<string, TokenInfo>();
const authorizationCodes = new Map<string, AuthorizationCodeRecord>();
const pendingAuthStates = new Map<string, PendingAuthState>();
const registeredClients = new Map<string, RegisteredClient>();
// Allow pre-shared tokens via env (comma-separated)
const allowedTokens = new Set(
  (process.env.MCP_ALLOWED_TOKENS || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
);

function getTokenInfo(token: string): TokenInfo | null {
  const stored = issuedTokens.get(token);
  if (stored) {
    if (stored.expiresAt && Date.now() > stored.expiresAt) {
      issuedTokens.delete(token);
      return null;
    }
    return stored;
  }

  if (allowedTokens.has(token)) {
    return {
      user: 'pre-shared-token',
      createdAt: 0,
      scope: DEFAULT_SCOPE,
      expiresAt: null,
    };
  }

  return null;
}

function isTokenAuthorized(token: string): boolean {
  return getTokenInfo(token) !== null;
}

class TodoistMCPServer {
  private server: Server;
  private app: express.Application;
  private todoistClient: TodoistApi;
  private todoistAuthToken: string;
  private todoistRestBaseUrl: string;
  private idMappingCache: Map<string, string>;

  constructor() {
    // Initialize Todoist API client
    const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN!;
    if (!TODOIST_API_TOKEN) {
      console.error("Error: TODOIST_API_TOKEN environment variable is required");
      process.exit(1);
    }
    this.todoistClient = new TodoistApi(TODOIST_API_TOKEN);
    this.todoistAuthToken = TODOIST_API_TOKEN;
    this.todoistRestBaseUrl = (process.env.TODOIST_API_BASE_URL || 'https://api.todoist.com/api/v1').replace(/\/$/, '');
    this.idMappingCache = new Map();

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

  private isLegacyNumericId(value: string | null | undefined): boolean {
    if (!value || typeof value !== 'string') return false;
    return /^\d+$/.test(value);
  }

  private async mapLegacyIdsToUlids(resourceType: 'tasks' | 'projects' | 'sections', ids: string[]): Promise<Record<string, string>> {
    const uncachedIds = ids.filter(id => !this.idMappingCache.has(id));
    
    if (uncachedIds.length === 0) {
      const result: Record<string, string> = {};
      for (const id of ids) {
        const cached = this.idMappingCache.get(id);
        if (cached) result[id] = cached;
      }
      return result;
    }

    try {
      const response = await fetch(`https://api.todoist.com/sync/v9/id_mappings/${resourceType}/${uncachedIds.join(',')}`, {
        headers: {
          'Authorization': `Bearer ${this.todoistAuthToken}`,
        },
      });

      if (!response.ok) {
        console.warn(`Failed to map legacy IDs (${response.status}): ${uncachedIds.join(',')}`);
        return {};
      }

      const mappings = await response.json() as Record<string, string>;
      
      for (const [legacyId, ulid] of Object.entries(mappings)) {
        this.idMappingCache.set(legacyId, ulid);
      }

      const result: Record<string, string> = {};
      for (const id of ids) {
        const mapped = this.idMappingCache.get(id);
        if (mapped) result[id] = mapped;
      }
      return result;
    } catch (error) {
      console.error(`Error mapping legacy IDs: ${error instanceof Error ? error.message : error}`);
      return {};
    }
  }

  private async convertTaskIdsToUlids(tasks: Array<{ id: string; projectId?: string | null; sectionId?: string | null; parentId?: string | null; [key: string]: unknown }>): Promise<void> {
    const taskIds = tasks.map(t => t.id).filter(id => this.isLegacyNumericId(id));
    const projectIds = tasks.map(t => t.projectId).filter(id => this.isLegacyNumericId(id)) as string[];
    const sectionIds = tasks.map(t => t.sectionId).filter(id => this.isLegacyNumericId(id)) as string[];
    const parentIds = tasks.map(t => t.parentId).filter(id => this.isLegacyNumericId(id)) as string[];

    const [taskMappings, projectMappings, sectionMappings, parentMappings] = await Promise.all([
      taskIds.length ? this.mapLegacyIdsToUlids('tasks', taskIds) : Promise.resolve({} as Record<string, string>),
      projectIds.length ? this.mapLegacyIdsToUlids('projects', projectIds) : Promise.resolve({} as Record<string, string>),
      sectionIds.length ? this.mapLegacyIdsToUlids('sections', sectionIds) : Promise.resolve({} as Record<string, string>),
      parentIds.length ? this.mapLegacyIdsToUlids('tasks', parentIds) : Promise.resolve({} as Record<string, string>),
    ]) as [Record<string, string>, Record<string, string>, Record<string, string>, Record<string, string>];

    for (const task of tasks) {
      const mappedId = taskMappings[task.id];
      if (mappedId) task.id = mappedId;
      if (task.projectId) {
        const mappedProjectId = projectMappings[task.projectId];
        if (mappedProjectId) task.projectId = mappedProjectId;
      }
      if (task.sectionId) {
        const mappedSectionId = sectionMappings[task.sectionId];
        if (mappedSectionId) task.sectionId = mappedSectionId;
      }
      if (task.parentId) {
        const mappedParentId = parentMappings[task.parentId];
        if (mappedParentId) task.parentId = mappedParentId;
      }
    }
  }

  private async convertProjectIdsToUlids(projects: Array<{ id: string; parentId?: string | null; [key: string]: unknown }>): Promise<void> {
    const projectIds = projects.map(p => p.id).filter(id => this.isLegacyNumericId(id));
    const parentIds = projects.map(p => p.parentId).filter(id => this.isLegacyNumericId(id)) as string[];

    const [projectMappings, parentMappings] = await Promise.all([
      projectIds.length ? this.mapLegacyIdsToUlids('projects', projectIds) : Promise.resolve({} as Record<string, string>),
      parentIds.length ? this.mapLegacyIdsToUlids('projects', parentIds) : Promise.resolve({} as Record<string, string>),
    ]) as [Record<string, string>, Record<string, string>];

    for (const project of projects) {
      const mappedId = projectMappings[project.id];
      if (mappedId) project.id = mappedId;
      if (project.parentId) {
        const mappedParentId = parentMappings[project.parentId];
        if (mappedParentId) project.parentId = mappedParentId;
      }
    }
  }

  private async convertSectionIdsToUlids(sections: Array<{ id: string; projectId?: string | null; [key: string]: unknown }>): Promise<void> {
    const sectionIds = sections.map(s => s.id).filter(id => this.isLegacyNumericId(id));
    const projectIds = sections.map(s => s.projectId).filter(id => this.isLegacyNumericId(id)) as string[];

    const [sectionMappings, projectMappings] = await Promise.all([
      sectionIds.length ? this.mapLegacyIdsToUlids('sections', sectionIds) : Promise.resolve({} as Record<string, string>),
      projectIds.length ? this.mapLegacyIdsToUlids('projects', projectIds) : Promise.resolve({} as Record<string, string>),
    ]) as [Record<string, string>, Record<string, string>];

    for (const section of sections) {
      const mappedId = sectionMappings[section.id];
      if (mappedId) section.id = mappedId;
      if (section.projectId) {
        const mappedProjectId = projectMappings[section.projectId];
        if (mappedProjectId) section.projectId = mappedProjectId;
      }
    }
  }

  private async moveTodoistTask(taskId: string, options: {
    projectId?: string | null;
    sectionId?: string | null;
    parentId?: string | null;
  }) {
    // Accept both ULID and legacy numeric IDs
    const normalizedTaskId = ensureUlid(taskId, 'task_id');

    // Verify task exists first
    try {
      const task = await this.todoistClient.getTask(normalizedTaskId);
      console.log('Task exists, current location:', {
        taskId: normalizedTaskId,
        currentProjectId: task.projectId,
        currentSectionId: task.sectionId,
        currentParentId: task.parentId
      });
    } catch (error) {
      console.error('Task not found before move attempt:', {
        taskId: normalizedTaskId,
        error: error instanceof Error ? error.message : error
      });
      throw new Error(`Cannot move task ${normalizedTaskId}: task not found or inaccessible`);
    }

    const payload: Record<string, string | null> = {};

    if (options.projectId !== undefined) {
      payload.project_id = options.projectId === null ? null : ensureUlid(options.projectId, 'project_id');
    }

    if (options.sectionId !== undefined) {
      payload.section_id = options.sectionId === null ? null : ensureUlid(options.sectionId, 'section_id');
    }

    if (options.parentId !== undefined) {
      payload.parent_id = options.parentId === null ? null : ensureUlid(options.parentId, 'parent_id');
    }

    if (Object.keys(payload).length === 0) {
      return undefined;
    }

    // Try REST v2 /move endpoint first
    const moveUrl = `https://api.todoist.com/rest/v2/tasks/${encodeURIComponent(String(normalizedTaskId))}/move`;
    
    console.log('Attempting REST v2 move:', {
      taskId: normalizedTaskId,
      taskIdType: this.isLegacyNumericId(normalizedTaskId) ? 'numeric' : 'ULID',
      payload,
      url: moveUrl
    });

    const restResponse = await fetch(moveUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.todoistAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // If REST v2 succeeds, return
    if (restResponse.ok) {
      try {
        const result = await restResponse.json();
        console.log('REST v2 move succeeded:', { taskId: normalizedTaskId, result });
        return result;
      } catch {
        console.log('REST v2 move succeeded (no JSON response):', { taskId: normalizedTaskId });
        return undefined;
      }
    }

    // If REST v2 fails with 404, try Sync API v9 as fallback
    const restError = await restResponse.text().catch(() => '');
    console.warn('REST v2 move failed, trying Sync API fallback:', {
      status: restResponse.status,
      error: restError,
      taskId: normalizedTaskId
    });

    if (restResponse.status === 404) {
      return await this.moveTodoistTaskViaSyncApi(normalizedTaskId, payload);
    }

    // For non-404 errors, throw immediately
    throw new Error(`Todoist move failed (${restResponse.status}): ${restError || restResponse.statusText}. Task ID: ${normalizedTaskId}, Payload: ${JSON.stringify(payload)}`);
  }

  private async moveTodoistTaskViaSyncApi(taskId: string, payload: Record<string, string | null>) {
    // Build Sync API v9 command
    const command: any = {
      type: 'item_move',
      uuid: crypto.randomUUID(),
      args: {
        id: taskId
      }
    };

    // Add fields to args
    if (payload.project_id !== undefined) {
      command.args.project_id = payload.project_id;
    }
    if (payload.section_id !== undefined) {
      command.args.section_id = payload.section_id;
    }
    if (payload.parent_id !== undefined) {
      command.args.parent_id = payload.parent_id;
    }

    console.log('Attempting Sync API v9 move:', {
      taskId,
      command
    });

    const syncResponse = await fetch('https://api.todoist.com/sync/v9/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.todoistAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commands: [command]
      }),
    });

    if (!syncResponse.ok) {
      const text = await syncResponse.text().catch(() => '');
      console.error('Sync API move failed:', {
        status: syncResponse.status,
        statusText: syncResponse.statusText,
        body: text,
        taskId,
        command
      });
      throw new Error(`Todoist Sync API move failed (${syncResponse.status}): ${text || syncResponse.statusText}. Task ID: ${taskId}, Command: ${JSON.stringify(command)}`);
    }

    const syncResult = await syncResponse.json();
    console.log('Sync API move succeeded:', { taskId, syncResult });

    // Check for command errors in sync response
    if (syncResult.sync_status) {
      const commandStatus = syncResult.sync_status[command.uuid];
      if (commandStatus && commandStatus !== 'ok') {
        throw new Error(`Todoist Sync API move failed: ${JSON.stringify(commandStatus)}. Task ID: ${taskId}`);
      }
    }

    return syncResult;
  }

  private getToolDefinitions() {
    return [
      {
        name: "todoist_create_task",
        description: "Create one or more tasks in Todoist. Accepts both ULID and legacy numeric ID formats for all identifier fields.",
        inputSchema: {
          type: "object",
          required: ["tasks"],
          additionalProperties: false,
          properties: {
            tasks: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of tasks to create.",
              items: {
                type: "object",
                required: ["content"],
                additionalProperties: false,
                properties: {
                  content: { type: "string", description: "Task content/title." },
                  description: { type: "string", description: "Detailed description of the task." },
                  project_id: ulidSchema("Project ULID for the new task."),
                  section_id: ulidSchema("Section ULID for the new task."),
                  parent_id: ulidSchema("Parent task ULID for subtasks."),
                  labels: { type: "array", items: { type: "string" }, description: "Label names to apply." },
                  priority: { type: "integer", minimum: 1, maximum: 4, description: "Priority from 1 (normal) to 4 (urgent)." },
                  due_string: { type: "string", description: "Natural language due date (e.g. 'tomorrow')." },
                  due_date: { type: "string", description: "Due date in YYYY-MM-DD format." },
                  due_datetime: { type: "string", description: "Due date and time in RFC3339 format." },
                  due_lang: { type: "string", description: "Language code for parsing due_string." },
                  assignee_id: ulidSchema("User ULID to assign the task to."),
                  duration: { type: "number", description: "Duration amount matching duration_unit." },
                  duration_unit: { type: "string", enum: ["minute", "day"], description: "Duration unit for the provided duration." },
                },
              },
            },
          },
        },
      },
      {
        name: "todoist_get_tasks",
        description: "Retrieve Todoist tasks with optional filters. Accepts both ULID and legacy numeric ID formats. Returns tasks with ULID identifiers.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            project_id: ulidSchema("Filter tasks by project ULID."),
            section_id: ulidSchema("Filter tasks by section ULID."),
            label: { type: "string", description: "Filter by label name." },
            filter: { type: "string", description: "Natural language Todoist filter expression." },
            lang: { type: "string", description: "Language code for filter interpretation." },
            ids: {
              type: "array",
              minItems: 1,
              description: "Specific task ULIDs to retrieve.",
              items: ulidSchema("Task ULID to include."),
            },
            priority: { type: "integer", minimum: 1, maximum: 4, description: "Filter by priority 1-4." },
            limit: { type: "integer", minimum: 1, maximum: 200, description: "Maximum number of tasks to return." },
          },
        },
      },
      {
        name: "todoist_update_task",
        description: "Update one or more tasks. Accepts both ULID and legacy numeric ID formats for all identifier fields.",
        inputSchema: {
          type: "object",
          required: ["tasks"],
          additionalProperties: false,
          properties: {
            tasks: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of task updates.",
              items: {
                type: "object",
                required: ["task_id"],
                additionalProperties: false,
                properties: {
                  task_id: ulidSchema("Task ULID to update."),
                  content: { type: "string", description: "Updated task content/title." },
                  description: { type: "string", description: "Updated task description." },
                  project_id: ulidSchema("Target project ULID for the task."),
                  section_id: nullableUlidSchema("Target section ULID for the task. Use null to remove the section."),
                  parent_id: nullableUlidSchema("Parent task ULID. Use null to unparent."),
                  labels: { type: "array", items: { type: "string" }, description: "Replace labels with the provided array." },
                  priority: { type: "integer", minimum: 1, maximum: 4, description: "Updated priority 1-4." },
                  due_string: { type: "string", description: "Updated natural language due date." },
                  due_date: { type: "string", description: "Updated due date in YYYY-MM-DD format." },
                  due_datetime: { type: "string", description: "Updated due date and time in RFC3339 format." },
                  due_lang: {
                    anyOf: [
                      { type: "string" },
                      { type: "null" },
                    ],
                    description: "Language code for due parsing or null to reset.",
                  },
                  assignee_id: nullableUlidSchema("Assigned user ULID or null to unassign."),
                  duration: { type: "number", description: "Updated duration amount." },
                  duration_unit: { type: "string", enum: ["minute", "day"], description: "Updated duration unit." },
                },
              },
            },
          },
        },
      },
      {
        name: "todoist_delete_task",
        description: "Delete one or more tasks. Accepts both ULID and legacy numeric ID formats.",
        inputSchema: {
          type: "object",
          required: ["tasks"],
          additionalProperties: false,
          properties: {
            tasks: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of task deletions.",
              items: {
                type: "object",
                required: ["task_id"],
                additionalProperties: false,
                properties: {
                  task_id: ulidSchema("Task ULID to delete."),
                },
              },
            },
          },
        },
      },
      {
        name: "todoist_complete_task",
        description: "Mark one or more tasks complete. Accepts both ULID and legacy numeric ID formats.",
        inputSchema: {
          type: "object",
          required: ["tasks"],
          additionalProperties: false,
          properties: {
            tasks: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of task completions.",
              items: {
                type: "object",
                required: ["task_id"],
                additionalProperties: false,
                properties: {
                  task_id: ulidSchema("Task ULID to complete."),
                },
              },
            },
          },
        },
      },
      {
        name: "todoist_get_projects",
        description: "List Todoist projects with optional filtering. Accepts both ULID and legacy numeric ID formats. Returns projects with ULID identifiers.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            project_ids: {
              type: "array",
              minItems: 1,
              description: "Specific project ULIDs to retrieve.",
              items: ulidSchema("Project ULID to include."),
            },
            include_sections: { type: "boolean", description: "Include sections for each project." },
            include_hierarchy: { type: "boolean", description: "Include child project ULIDs for hierarchy." },
          },
        },
      },
      {
        name: "todoist_create_project",
        description: "Create one or more projects. Accepts both ULID and legacy numeric ID formats for parent project references.",
        inputSchema: {
          type: "object",
          required: ["projects"],
          additionalProperties: false,
          properties: {
            projects: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of project definitions.",
              items: {
                type: "object",
                required: ["name"],
                additionalProperties: false,
                properties: {
                  name: { type: "string", description: "Project name." },
                  parent_id: ulidSchema("Optional parent project ULID."),
                  color: { type: "string", description: "Project color identifier." },
                  favorite: { type: "boolean", description: "Mark project as favorite." },
                  view_style: { type: "string", enum: ["list", "board"], description: "Project view style." },
                },
              },
            },
          },
        },
      },
      {
        name: "todoist_get_task_comments",
        description: "Fetch comments for one or more tasks. Accepts both ULID and legacy numeric ID formats.",
        inputSchema: {
          type: "object",
          required: ["tasks"],
          additionalProperties: false,
          properties: {
            tasks: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of task identifiers.",
              items: {
                type: "object",
                required: ["task_id"],
                additionalProperties: false,
                properties: {
                  task_id: ulidSchema("Task ULID to fetch comments for."),
                },
              },
            },
          },
        },
      },
      {
        name: "todoist_create_task_comment",
        description: "Create comments for one or more tasks. Accepts both ULID and legacy numeric ID formats.",
        inputSchema: {
          type: "object",
          required: ["comments"],
          additionalProperties: false,
          properties: {
            comments: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of comments to create.",
              items: {
                type: "object",
                required: ["task_id", "content"],
                additionalProperties: false,
                properties: {
                  task_id: ulidSchema("Task ULID to attach the comment to."),
                  content: { type: "string", description: "Comment body." },
                },
              },
            },
          },
        },
      },
      {
        name: "todoist_create_section",
        description: "Create one or more sections. Accepts both ULID and legacy numeric ID formats for project_id.",
        inputSchema: {
          type: "object",
          required: ["sections"],
          additionalProperties: false,
          properties: {
            sections: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of sections to create.",
              items: {
                type: "object",
                required: ["project_id", "name"],
                additionalProperties: false,
                properties: {
                  project_id: ulidSchema("Project ULID where the section will be created."),
                  name: { type: "string", description: "Section name." },
                  order: { type: "integer", description: "Optional sort order for the section." },
                },
              },
            },
          },
        },
      },
      {
        name: "todoist_rename_section",
        description: "Rename sections. Accepts both ULID and legacy numeric ID formats for section_id.",
        inputSchema: {
          type: "object",
          required: ["sections"],
          additionalProperties: false,
          properties: {
            sections: {
              type: "array",
              minItems: 1,
              description: "Non-empty array of section renames.",
              items: {
                type: "object",
                required: ["section_id", "new_name"],
                additionalProperties: false,
                properties: {
                  section_id: ulidSchema("Section ULID to rename."),
                  new_name: { type: "string", description: "Updated section name." },
                },
              },
            },
          },
        },
      },
    ];
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments ?? {};
        switch (request.params.name) {
          case 'todoist_create_task':
            return await this.handleCreateTasks(args);
          case 'todoist_get_tasks':
            return await this.handleGetTasks(args);
          case 'todoist_update_task':
            return await this.handleUpdateTasks(args);
          case 'todoist_delete_task':
            return await this.handleDeleteTasks(args);
          case 'todoist_complete_task':
            return await this.handleCompleteTasks(args);
          case 'todoist_get_projects':
            return await this.handleGetProjects(args);
          case 'todoist_create_project':
            return await this.handleCreateProjects(args);
          case 'todoist_get_task_comments':
            return await this.handleGetTaskComments(args);
          case 'todoist_create_task_comment':
            return await this.handleCreateTaskComments(args);
          case 'todoist_create_section':
            return await this.handleCreateSections(args);
          case 'todoist_rename_section':
            return await this.handleRenameSections(args);
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('MCP CallTool error', { tool: request.params.name, error: errorMessage });
        return buildToolResponse({ success: false, error: errorMessage }, true);
      }
    });
  }

  private async handleCreateTasks(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const taskInputs = ensureNonEmptyArray<unknown>(args.tasks, 'tasks');

    const results = taskInputs.map(async (rawTask) => {
      const taskData = ensureObject<Record<string, unknown>>(rawTask, 'tasks[]');
      try {
        const apiParams: Record<string, unknown> = {
          content: ensureString(taskData.content, 'tasks[].content'),
        };

        const description = ensureOptionalString(taskData.description, 'tasks[].description');
        if (description !== undefined) apiParams.description = description;

        const projectId = ensureOptionalUlid(taskData.project_id, 'tasks[].project_id');
        if (projectId !== undefined) apiParams.projectId = projectId;

        const sectionId = ensureOptionalUlid(taskData.section_id, 'tasks[].section_id');
        if (sectionId !== undefined) apiParams.sectionId = sectionId;

        const parentId = ensureOptionalUlid(taskData.parent_id, 'tasks[].parent_id');
        if (parentId !== undefined) apiParams.parentId = parentId;

        const labels = ensureStringArray(taskData.labels, 'tasks[].labels');
        if (labels !== undefined) apiParams.labels = labels;

        const priority = ensureOptionalIntegerInRange(taskData.priority, 'tasks[].priority', 1, 4);
        if (priority !== undefined) apiParams.priority = priority;

        const dueString = ensureOptionalString(taskData.due_string, 'tasks[].due_string');
        if (dueString !== undefined) apiParams.dueString = dueString;

        const dueDate = ensureOptionalString(taskData.due_date, 'tasks[].due_date');
        const dueDatetime = ensureOptionalString(taskData.due_datetime, 'tasks[].due_datetime');
        if (dueDate !== undefined && dueDatetime !== undefined) {
          throw new Error("tasks[].due_date and tasks[].due_datetime cannot both be provided");
        }
        if (dueDate !== undefined) apiParams.dueDate = dueDate;
        if (dueDatetime !== undefined) apiParams.dueDatetime = dueDatetime;

        const dueLang = ensureOptionalString(taskData.due_lang, 'tasks[].due_lang');
        if (dueLang !== undefined) apiParams.dueLang = dueLang;

        const assigneeId = ensureOptionalUlid(taskData.assignee_id, 'tasks[].assignee_id');
        if (assigneeId !== undefined) apiParams.assigneeId = assigneeId;

        const duration = ensureOptionalNumber(taskData.duration, 'tasks[].duration');
        const durationUnit = ensureOptionalEnum(taskData.duration_unit, 'tasks[].duration_unit', ['minute', 'day'] as const);
        if ((duration !== undefined && durationUnit === undefined) || (duration === undefined && durationUnit !== undefined)) {
          throw new Error("tasks[].duration and tasks[].duration_unit must be provided together");
        }
        if (duration !== undefined && durationUnit !== undefined) {
          apiParams.duration = duration;
          apiParams.durationUnit = durationUnit;
        }

        const task = await this.todoistClient.addTask(apiParams as any);
                  console.log('Task created', { id: task.id, content: task.content });

                  return {
                    success: true,
                    task_id: task.id,
          content: task.content,
                  };
                } catch (error) {
        console.error('Task creation failed', { error, taskData });
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
          task: taskData,
        };
      }
    });

    const resolvedResults = await Promise.all(results);
    return buildBatchResponse(resolvedResults, taskInputs.length);
  }

  private async handleGetTasks(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');

    const projectId = ensureOptionalUlid(args.project_id, 'project_id');
    const sectionId = ensureOptionalUlid(args.section_id, 'section_id');
    const label = ensureOptionalString(args.label, 'label');
    const filter = ensureOptionalString(args.filter, 'filter');
    const lang = ensureOptionalString(args.lang, 'lang');
    const ids = ensureUlidArray(args.ids, 'ids');
    const priority = ensureOptionalIntegerInRange(args.priority, 'priority', 1, 4);
    const limit = ensureOptionalIntegerInRange(args.limit, 'limit', 1, 200);

    const requestArgs: Record<string, unknown> = {};
    if (projectId !== undefined) requestArgs.projectId = projectId;
    if (sectionId !== undefined) requestArgs.sectionId = sectionId;
    if (label !== undefined) requestArgs.label = label;
    if (filter !== undefined) requestArgs.filter = filter;
    if (lang !== undefined) requestArgs.lang = lang;
    if (ids !== undefined) requestArgs.ids = ids;

    const tasks = await this.todoistClient.getTasks(Object.keys(requestArgs).length ? (requestArgs as any) : undefined);

    // Convert any legacy numeric IDs to ULIDs
    await this.convertTaskIdsToUlids(tasks as any);

    let filteredTasks = tasks;
    if (priority !== undefined) {
      filteredTasks = filteredTasks.filter(task => task.priority === priority);
    }
    if (limit !== undefined) {
      filteredTasks = filteredTasks.slice(0, limit);
    }

    return buildToolResponse({
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
        duration: task.duration?.amount ?? null,
        duration_unit: task.duration?.unit ?? null,
        completed: task.isCompleted,
      })),
    }, false);
  }

  private async handleUpdateTasks(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const taskInputs = ensureNonEmptyArray<unknown>(args.tasks, 'tasks');

    const results = await Promise.all(
      taskInputs.map(async (rawTask) => {
        const taskData = ensureObject<Record<string, unknown>>(rawTask, 'tasks[]');
        const taskId = ensureUlid(taskData.task_id, 'tasks[].task_id');

        try {
          const updateParams: Record<string, unknown> = {};
          const moveOptions: { projectId?: string; sectionId?: string | null; parentId?: string | null } = {};

          const content = ensureOptionalString(taskData.content, 'tasks[].content');
          if (content !== undefined) updateParams.content = content;

          const description = ensureOptionalString(taskData.description, 'tasks[].description');
          if (description !== undefined) updateParams.description = description;

          const labels = ensureStringArray(taskData.labels, 'tasks[].labels');
          if (labels !== undefined) updateParams.labels = labels;

          const priority = ensureOptionalIntegerInRange(taskData.priority, 'tasks[].priority', 1, 4);
          if (priority !== undefined) updateParams.priority = priority;

          const dueString = ensureOptionalString(taskData.due_string, 'tasks[].due_string');
          if (dueString !== undefined) updateParams.dueString = dueString;

          const dueDate = ensureOptionalString(taskData.due_date, 'tasks[].due_date');
          const dueDatetime = ensureOptionalString(taskData.due_datetime, 'tasks[].due_datetime');
          if (dueDate !== undefined && dueDatetime !== undefined) {
            throw new Error("tasks[].due_date and tasks[].due_datetime cannot both be provided");
          }
          if (dueDate !== undefined) updateParams.dueDate = dueDate;
          if (dueDatetime !== undefined) updateParams.dueDatetime = dueDatetime;

          const dueLang = ensureNullableString(taskData.due_lang, 'tasks[].due_lang');
          if (dueLang !== undefined) updateParams.dueLang = dueLang;

          const assigneeId = ensureNullableUlid(taskData.assignee_id, 'tasks[].assignee_id');
          if (assigneeId !== undefined) updateParams.assigneeId = assigneeId;

          const duration = ensureOptionalNumber(taskData.duration, 'tasks[].duration');
          const durationUnit = ensureOptionalEnum(taskData.duration_unit, 'tasks[].duration_unit', ['minute', 'day'] as const);
          if ((duration !== undefined && durationUnit === undefined) || (duration === undefined && durationUnit !== undefined)) {
            throw new Error("tasks[].duration and tasks[].duration_unit must be provided together");
          }
          if (duration !== undefined && durationUnit !== undefined) {
            updateParams.duration = duration;
            updateParams.durationUnit = durationUnit;
          }

          const projectId = ensureOptionalUlid(taskData.project_id, 'tasks[].project_id');
          if (projectId !== undefined) moveOptions.projectId = projectId;

          const sectionId = ensureNullableUlid(taskData.section_id, 'tasks[].section_id');
          if (sectionId !== undefined) moveOptions.sectionId = sectionId;

          const parentId = ensureNullableUlid(taskData.parent_id, 'tasks[].parent_id');
          if (parentId !== undefined) moveOptions.parentId = parentId;

          if (Object.keys(updateParams).length === 0 && Object.keys(moveOptions).length === 0) {
            throw new Error('tasks[] update payload contained no fields to update');
          }

                if (Object.keys(updateParams).length > 0) {
            await this.todoistClient.updateTask(taskId, updateParams as any);
          }

          if (Object.keys(moveOptions).length > 0) {
            await this.moveTodoistTask(taskId, moveOptions);
          }

              return {
                    success: true,
                    task_id: taskId,
          };
        } catch (error) {
          console.error('Task update failed', { error, taskId, taskData });
                      return {
                        success: false,
            task_id: taskId,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return buildBatchResponse(results, taskInputs.length);
  }

  private async handleDeleteTasks(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const taskInputs = ensureNonEmptyArray<unknown>(args.tasks, 'tasks');

    const results = await Promise.all(
      taskInputs.map(async (rawTask) => {
        const taskData = ensureObject<Record<string, unknown>>(rawTask, 'tasks[]');
        const taskId = ensureUlid(taskData.task_id, 'tasks[].task_id');

        try {
                  await this.todoistClient.deleteTask(taskId);
                  console.log('Task deleted', { taskId });
                  return {
                    success: true,
                    task_id: taskId,
                  };
                } catch (error) {
          console.error('Task deletion failed', { error, taskId });
                  return {
                    success: false,
            task_id: taskId,
                    error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return buildBatchResponse(results, taskInputs.length);
  }

  private async handleCompleteTasks(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const taskInputs = ensureNonEmptyArray<unknown>(args.tasks, 'tasks');

    const results = await Promise.all(
      taskInputs.map(async (rawTask) => {
        const taskData = ensureObject<Record<string, unknown>>(rawTask, 'tasks[]');
        const taskId = ensureUlid(taskData.task_id, 'tasks[].task_id');

        try {
                  await this.todoistClient.closeTask(taskId);
                  console.log('Task completed', { taskId });
                  return {
                    success: true,
                    task_id: taskId,
                  };
                } catch (error) {
          console.error('Task completion failed', { error, taskId });
                  return {
                    success: false,
            task_id: taskId,
                    error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return buildBatchResponse(results, taskInputs.length);
  }

  private async handleGetProjects(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const projectIds = ensureUlidArray(args.project_ids, 'project_ids');
    const includeSections = ensureOptionalBoolean(args.include_sections, 'include_sections') ?? false;
    const includeHierarchy = ensureOptionalBoolean(args.include_hierarchy, 'include_hierarchy') ?? false;

    let projects = await this.todoistClient.getProjects();
    
    // Convert any legacy numeric IDs to ULIDs
    await this.convertProjectIdsToUlids(projects as any);
    
    if (projectIds) {
      const idSet = new Set(projectIds);
      projects = projects.filter(project => idSet.has(project.id));
    }

    let sectionsByProject: Record<string, { id: string; name: string; order: number }[]> = {};
    if (includeSections && projects.length > 0) {
      const allSections = await this.todoistClient.getSections();
      await this.convertSectionIdsToUlids(allSections as any);
      
      sectionsByProject = allSections.reduce<Record<string, { id: string; name: string; order: number }[]>>((acc, section) => {
        if (!acc[section.projectId]) {
          acc[section.projectId] = [];
        }
        acc[section.projectId].push({
          id: section.id,
          name: section.name,
          order: section.order,
        });
        return acc;
      }, {});
    }

    let childrenByProject: Record<string, string[]> = {};
    if (includeHierarchy) {
      childrenByProject = projects.reduce<Record<string, string[]>>((acc, project) => {
        if (project.parentId) {
          if (!acc[project.parentId]) {
            acc[project.parentId] = [];
          }
          acc[project.parentId].push(project.id);
        }
        return acc;
      }, {});
    }

    const result = projects.map(project => {
      const entry: Record<string, unknown> = {
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
      };

      if (includeSections) {
        entry.sections = sectionsByProject[project.id] ?? [];
      }

      if (includeHierarchy) {
        entry.child_project_ids = childrenByProject[project.id] ?? [];
      }

      return entry;
    });

    return buildToolResponse({
      success: true,
      projects: result,
    }, false);
  }

  private async handleCreateProjects(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const projectInputs = ensureNonEmptyArray<unknown>(args.projects, 'projects');

    const results = await Promise.all(
      projectInputs.map(async (rawProject) => {
        const projectData = ensureObject<Record<string, unknown>>(rawProject, 'projects[]');
        try {
          const apiParams: Record<string, unknown> = {
            name: ensureString(projectData.name, 'projects[].name'),
          };

          const parentId = ensureOptionalUlid(projectData.parent_id, 'projects[].parent_id');
          if (parentId !== undefined) apiParams.parentId = parentId;

          const color = ensureOptionalString(projectData.color, 'projects[].color');
          if (color !== undefined) apiParams.color = color;

          const favorite = ensureOptionalBoolean(projectData.favorite, 'projects[].favorite');
          if (favorite !== undefined) apiParams.isFavorite = favorite;

          const viewStyle = ensureOptionalEnum(projectData.view_style, 'projects[].view_style', ['list', 'board'] as const);
          if (viewStyle !== undefined) apiParams.viewStyle = viewStyle;

          const project = await this.todoistClient.addProject(apiParams as any);
                  console.log('Project created', { projectId: project.id, name: project.name });
                  return {
                    success: true,
                    project_id: project.id,
            name: project.name,
                  };
                } catch (error) {
          console.error('Project creation failed', { error, projectData });
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
            project: projectData,
          };
        }
      })
    );

    return buildBatchResponse(results, projectInputs.length);
  }

  private async handleGetTaskComments(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const taskInputs = ensureNonEmptyArray<unknown>(args.tasks, 'tasks');

    const results = await Promise.all(
      taskInputs.map(async (rawTask) => {
        const taskData = ensureObject<Record<string, unknown>>(rawTask, 'tasks[]');
        const taskId = ensureUlid(taskData.task_id, 'tasks[].task_id');

        try {
          const comments = await this.todoistClient.getComments({ taskId });
          return {
            success: true,
            task_id: taskId,
            comments: comments.map(comment => ({
              id: comment.id,
              content: comment.content,
              posted_at: comment.postedAt,
            })),
          };
                } catch (error) {
          console.error('Fetch task comments failed', { error, taskId });
                  return {
                    success: false,
            task_id: taskId,
                    error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return buildBatchResponse(results, taskInputs.length);
  }

  private async handleCreateTaskComments(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const commentInputs = ensureNonEmptyArray<unknown>(args.comments, 'comments');

    const results = await Promise.all(
      commentInputs.map(async (rawComment) => {
        const commentData = ensureObject<Record<string, unknown>>(rawComment, 'comments[]');
        const taskId = ensureUlid(commentData.task_id, 'comments[].task_id');
        const content = ensureString(commentData.content, 'comments[].content');

        try {
          const comment = await this.todoistClient.addComment({ taskId, content });
          console.log('Comment created', { taskId, commentId: comment.id });
          return {
            success: true,
            task_id: taskId,
            comment: {
              id: comment.id,
              content: comment.content,
              posted_at: comment.postedAt,
            },
          };
                } catch (error) {
          console.error('Create task comment failed', { error, taskId });
                  return {
                    success: false,
            task_id: taskId,
                    error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return buildBatchResponse(results, commentInputs.length);
  }

  private async handleCreateSections(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const sectionInputs = ensureNonEmptyArray<unknown>(args.sections, 'sections');

    const results = await Promise.all(
      sectionInputs.map(async (rawSection) => {
        const sectionData = ensureObject<Record<string, unknown>>(rawSection, 'sections[]');
        const projectId = ensureUlid(sectionData.project_id, 'sections[].project_id');
        const name = ensureString(sectionData.name, 'sections[].name');

        try {
          const apiParams: Record<string, unknown> = { name, projectId };
          const order = ensureOptionalIntegerInRange(sectionData.order, 'sections[].order', 0, Number.MAX_SAFE_INTEGER);
          if (order !== undefined) apiParams.order = order;

          const section = await this.todoistClient.addSection(apiParams as any);
                  console.log('Section created', { sectionId: section.id, projectId: section.projectId });
                  return {
                    success: true,
                    section_id: section.id,
            project_id: section.projectId,
                    name: section.name,
                  };
                } catch (error) {
          console.error('Create section failed', { error, sectionData });
                  return {
                    success: false,
            project_id: projectId,
            name,
                    error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return buildBatchResponse(results, sectionInputs.length);
  }

  private async handleRenameSections(rawArgs: unknown): Promise<ToolResponse> {
    const args = ensureObject<Record<string, unknown>>(rawArgs ?? {}, 'arguments');
    const sectionInputs = ensureNonEmptyArray<unknown>(args.sections, 'sections');

    const results = await Promise.all(
      sectionInputs.map(async (rawSection) => {
        const sectionData = ensureObject<Record<string, unknown>>(rawSection, 'sections[]');
        const sectionId = ensureUlid(sectionData.section_id, 'sections[].section_id');
        const newName = ensureString(sectionData.new_name, 'sections[].new_name');

        try {
          const section = await this.todoistClient.updateSection(sectionId, { name: newName });
                  console.log('Section renamed', { sectionId: section.id, newName: section.name });
                  return {
                    success: true,
                    section_id: section.id,
                    new_name: section.name,
            project_id: section.projectId,
                  };
                } catch (error) {
          console.error('Rename section failed', { error, sectionId });
                  return {
                    success: false,
            section_id: sectionId,
                    error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return buildBatchResponse(results, sectionInputs.length);
  }

  private setupExpress() {
    this.app.set('trust proxy', true);
    // Configure CORS to expose Mcp-Session-Id header and allow Authorization
    this.app.use(cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: ['content-type', 'authorization', 'mcp-session-id'],
    }));
    
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: false }));

    // Health check endpoint (public)
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', server: 'todoist-mcp-server-http' });
    });

    this.app.get('/.well-known/mcp/manifest.json', (req, res) => {
      const baseUrl = this.getBaseUrl(req);
      res.json({
        name: 'todoist-mcp-server-http',
        version: '0.2.5',
        description: 'Todoist MCP server providing project and task management tools over HTTP.',
        transports: ['https'],
        capabilities: {
          tools: {
            operations: ['list', 'call'],
          },
        },
        oauth: {
          type: 'authorization_code',
          authorization_server: {
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/oauth/authorize`,
            token_endpoint: `${baseUrl}/oauth/token`,
            registration_endpoint: `${baseUrl}/oauth/register`,
          },
          scopes: Array.from(SCOPES),
        },
      });
    });

    // OAuth discovery endpoints for MCP clients
    this.app.get('/.well-known/oauth-authorization-server', (req, res) => {
      const baseUrl = this.getBaseUrl(req);
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        scopes_supported: Array.from(SCOPES),
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    });

    this.app.get('/.well-known/oauth-protected-resource', (req, res) => {
      const baseUrl = this.getBaseUrl(req);
      res.json({
        resource: 'todoist-mcp',
        authorization_servers: [baseUrl],
        scopes_supported: Array.from(SCOPES),
      });
    });

    this.app.post('/oauth/register', (req, res) => {
      const baseUrl = this.getBaseUrl(req);
      const body = req.body || {};
      console.log('Received OAuth client registration request');
      const redirectUrisInput = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
      const redirectUris = redirectUrisInput
        .map((uri: unknown) => (typeof uri === 'string' ? uri.trim() : ''))
        .filter((uri: string) => uri.length > 0);

      if (redirectUris.length === 0) {
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: 'redirect_uris must be a non-empty array of HTTPS URLs',
        });
        return;
      }

      const unparsableUri = redirectUris.find((uri: string) => {
        try {
          // URL constructor supports custom schemes; we only care that the URI is absolute.
          new URL(uri);
          return false;
        } catch (error) {
          return true;
        }
      });
      if (unparsableUri) {
        res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: `Invalid redirect URI: ${unparsableUri}`,
        });
        return;
      }

      const requestedAuthMethod = typeof body.token_endpoint_auth_method === 'string'
        ? body.token_endpoint_auth_method.toLowerCase()
        : 'none';

      if (!['none', 'client_secret_basic', 'client_secret_post'].includes(requestedAuthMethod)) {
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: `Unsupported token_endpoint_auth_method: ${requestedAuthMethod}`,
        });
        return;
      }

      if (requestedAuthMethod !== 'none') {
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: 'This server only supports public clients using PKCE (token_endpoint_auth_method="none")',
        });
        return;
      }

      const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : undefined;
      const requestedScope = typeof body.scope === 'string' ? body.scope : DEFAULT_SCOPE;
      const normalizedScope = sanitizeScope(requestedScope);
      const clientId = `mcp-client-${randomUUID()}`;
      const registrationAccessToken = `reg_${randomUUID()}`;
      const issuedAtSeconds = Math.floor(Date.now() / 1000);

      registeredClients.set(clientId, {
        clientId,
        clientName,
        redirectUris,
        scope: normalizedScope,
        tokenEndpointAuthMethod: 'none',
        clientIdIssuedAt: issuedAtSeconds,
        clientSecretExpiresAt: 0,
        registrationAccessToken,
      });

      res.status(201).json({
        client_id: clientId,
        client_id_issued_at: issuedAtSeconds,
        client_secret_expires_at: 0,
        token_endpoint_auth_method: 'none',
        registration_access_token: registrationAccessToken,
        registration_client_uri: `${baseUrl}/oauth/register/${clientId}`,
        redirect_uris: redirectUris,
        scope: normalizedScope,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        client_name: clientName,
      });
    });

    this.app.get('/oauth/authorize', (req, res) => {
      const responseType = (getQueryParam(req.query.response_type as any) || 'code').toLowerCase();
      console.log('Received OAuth authorize request', {
        clientId: getQueryParam(req.query.client_id as any),
        redirectUri: getQueryParam(req.query.redirect_uri as any),
      });
      if (responseType !== 'code') {
        res.status(400).json({
          error: 'unsupported_response_type',
          error_description: 'Only response_type=code is supported',
        });
        return;
      }

      const clientId = getQueryParam(req.query.client_id as any);
      const redirectUri = getQueryParam(req.query.redirect_uri as any);
      const state = getQueryParam(req.query.state as any);
      const codeChallenge = getQueryParam(req.query.code_challenge as any);
      const codeChallengeMethod = (getQueryParam(req.query.code_challenge_method as any) || 'S256').toUpperCase();
      const requestedScopeRaw = getQueryParam(req.query.scope as any);

      if (!clientId || !redirectUri || !state || !codeChallenge) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'client_id, redirect_uri, state, and code_challenge are required',
        });
        return;
      }

      if (codeChallengeMethod !== 'S256') {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Only PKCE S256 code_challenge_method is supported',
        });
        return;
      }

      const requestedScopes = (requestedScopeRaw && requestedScopeRaw.trim()
        ? requestedScopeRaw.trim()
        : DEFAULT_SCOPE).split(/\s+/).filter(Boolean);
      const normalizedRequestedScope = requestedScopes.length ? requestedScopes.join(' ') : DEFAULT_SCOPE;

      let clientRegistration = registeredClients.get(clientId);
      if (!clientRegistration) {
        try {
          const parsed = new URL(redirectUri);
          if (!parsed.protocol) {
            throw new Error('Missing protocol');
          }
        } catch (error) {
          res.status(400).json({
            error: 'invalid_request',
            error_description: 'redirect_uri is invalid or missing',
          });
          return;
        }

        clientRegistration = {
          clientId,
          clientName: undefined,
          redirectUris: [redirectUri],
          scope: normalizedRequestedScope,
          tokenEndpointAuthMethod: 'none',
          clientIdIssuedAt: Math.floor(Date.now() / 1000),
          clientSecretExpiresAt: 0,
          registrationAccessToken: `auto_${randomUUID()}`,
        };
        registeredClients.set(clientId, clientRegistration);
        console.warn('Auto-registered client from authorize request', { clientId, redirectUri });
      }

      if (!clientRegistration.redirectUris.includes(redirectUri)) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'redirect_uri is not registered for this client',
        });
        return;
      }

      const allowedScopes = new Set(clientRegistration.scope.split(/\s+/).filter(Boolean));
      const invalidRequestedScopes = requestedScopes.filter(scope => !allowedScopes.has(scope));
      if (invalidRequestedScopes.length > 0) {
        res.status(400).json({
          error: 'invalid_scope',
          error_description: `Scope not allowed: ${invalidRequestedScopes.join(', ')}`,
        });
        return;
      }

      const invalidScopes = requestedScopes.filter(scope => !(SCOPES as readonly string[]).includes(scope));
      if (invalidScopes.length > 0) {
        res.status(400).json({
          error: 'invalid_scope',
          error_description: `Unsupported scope(s): ${invalidScopes.join(', ')}`,
        });
        return;
      }
      const normalizedScope = requestedScopes.length ? requestedScopes.join(' ') : clientRegistration.scope;

      const githubClientId = process.env.GITHUB_OAUTH_CLIENT_ID;
      const githubCallbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL;

      if (!githubClientId || !githubCallbackUrl) {
        res.status(500).json({
          error: 'server_error',
          error_description: 'GitHub OAuth not configured',
        });
        return;
      }

      const githubState = randomUUID();
      pendingAuthStates.set(githubState, {
        type: 'oauth',
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256',
        scope: normalizedScope,
        originalState: state,
        createdAt: Date.now(),
      });

      const params = new URLSearchParams({
        client_id: githubClientId,
        redirect_uri: githubCallbackUrl,
        scope: 'read:user',
        state: githubState,
      });

      res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
    });

    this.app.post('/oauth/token', (req, res) => {
      console.log('Received OAuth token exchange request');
      const { grant_type: grantType, code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } =
        req.body || {};

      const authCode = typeof code === 'string' ? code : String(code || '');
      const redirect = typeof redirectUri === 'string' ? redirectUri : String(redirectUri || '');
      const client = typeof clientId === 'string' ? clientId : String(clientId || '');
      const verifier = typeof codeVerifier === 'string' ? codeVerifier : String(codeVerifier || '');

      if (grantType !== 'authorization_code') {
        res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code grant type is supported',
        });
        return;
      }

      if (!authCode || !redirect || !client || !verifier) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'code, redirect_uri, client_id, and code_verifier are required',
        });
        return;
      }

      const record = authorizationCodes.get(authCode);
      if (!record) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Unknown authorization code',
        });
        return;
      }

      if (record.clientId !== client || record.redirectUri !== redirect) {
        authorizationCodes.delete(authCode);
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Client or redirect URI mismatch',
        });
        return;
      }

      if (Date.now() > record.expiresAt) {
        authorizationCodes.delete(authCode);
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code has expired',
        });
        return;
      }

      const expectedChallenge = sha256Base64Url(verifier);
      if (expectedChallenge !== record.codeChallenge) {
        authorizationCodes.delete(authCode);
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'PKCE verification failed',
        });
        return;
      }

      const registeredClient = registeredClients.get(record.clientId);
      if (!registeredClient) {
        authorizationCodes.delete(authCode);
        res.status(400).json({
          error: 'invalid_client',
          error_description: 'Client is not registered',
        });
        return;
      }

      authorizationCodes.delete(authCode);

      const accessToken = `mcp_${randomUUID()}`;
      issuedTokens.set(accessToken, {
        user: record.user,
        createdAt: Date.now(),
        scope: record.scope,
        expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
      });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        scope: record.scope,
      });
    });

    // GitHub OAuth login (redirect to GitHub)
    this.app.get('/auth/github/login', (req, res) => {
      const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
      const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL;
      if (!clientId || !callbackUrl) {
        res.status(500).send('GitHub OAuth not configured');
        return;
      }
      const requestedScope = sanitizeScope(getQueryParam(req.query.scope as any));
      const state = randomUUID();
      pendingAuthStates.set(state, {
        type: 'manual',
        createdAt: Date.now(),
        scope: requestedScope,
      });
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        scope: 'read:user',
        state,
      });
      res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
    });

    // GitHub OAuth callback: exchange code for token, then mint an API key for MCP
    this.app.get('/auth/github/callback', async (req, res) => {
      try {
        const errorParam = getQueryParam(req.query.error as any);
        if (errorParam) {
          console.warn('GitHub callback error', { error: errorParam, state: getQueryParam(req.query.state as any) });
          res.status(400).send(`GitHub OAuth declined: ${errorParam}`);
          return;
        }

        const codeParam = getQueryParam(req.query.code as any);
        const stateParam = getQueryParam(req.query.state as any);

        console.log('GitHub callback received', { hasCode: !!codeParam, state: stateParam });

        if (!codeParam || !stateParam) {
          console.warn('GitHub callback missing code/state', { codeParam, stateParam });
          res.status(400).send('OAuth callback missing code or state');
          return;
        }

        const authState = pendingAuthStates.get(stateParam);
        pendingAuthStates.delete(stateParam);

        if (!authState) {
          console.warn('GitHub callback with unknown state', { stateParam });
          res.status(400).send('Invalid or expired OAuth state');
          return;
        }

        if (Date.now() - authState.createdAt > 15 * 60 * 1000) {
          console.warn('GitHub callback state expired', { stateParam });
          res.status(400).send('OAuth session expired');
          return;
        }

        const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GITHUB_OAUTH_SECRET;
        const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL;
        if (!clientId || !clientSecret || !callbackUrl) {
          res.status(500).send('GitHub OAuth not configured');
          return;
        }

        const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: codeParam, redirect_uri: callbackUrl }),
        });
        if (!tokenResp.ok) {
          console.error('GitHub token exchange failed', { status: tokenResp.status });
          res.status(502).send('Failed to exchange code');
          return;
        }
        const tokenJson: any = await tokenResp.json();
        const ghAccessToken = tokenJson.access_token as string | undefined;
        if (!ghAccessToken) {
          console.warn('GitHub token payload missing access_token', tokenJson);
          res.status(401).send('No GitHub access token received');
          return;
        }

        const userResp = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${ghAccessToken}`, 'user-agent': 'todoist-mcp-server' },
        });
        const userJson: any = userResp.ok ? await userResp.json() : {};
        const login = userJson.login || 'github-user';
        console.log('GitHub user fetched', { login });

        if (authState.type === 'manual') {
          const apiToken = `mcp_${randomUUID()}`;
          issuedTokens.set(apiToken, {
            user: login,
            createdAt: Date.now(),
            scope: authState.scope,
            expiresAt: null,
          });
          console.log('Manual auth token issued', { login, scope: authState.scope });

          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.send(`<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"/><title>Todoist MCP - API Token</title></head>
  <body>
    <h1>Authentication complete</h1>
    <p>Signed in as: <strong>${login}</strong></p>
    <p>Use the following API token in your MCP client configuration as an HTTP header:</p>
    <pre>Authorization: Bearer ${apiToken}</pre>
    <p>Scope: ${authState.scope}</p>
    <p>You can now configure Claude or OpenAI MCP clients to call your MCP endpoint with that header.</p>
  </body>
</html>`);
          return;
        }

        if (authState.type === 'oauth') {
          const authCode = randomUUID();
          authorizationCodes.set(authCode, {
            clientId: authState.clientId,
            redirectUri: authState.redirectUri,
            codeChallenge: authState.codeChallenge,
            codeChallengeMethod: authState.codeChallengeMethod,
            scope: authState.scope,
            user: login,
            createdAt: Date.now(),
            expiresAt: Date.now() + AUTH_CODE_TTL_MS,
          });
          console.log('Issued authorization code', { clientId: authState.clientId, redirectUri: authState.redirectUri });

          try {
            const redirectTarget = new URL(authState.redirectUri);
            redirectTarget.searchParams.set('code', authCode);
            redirectTarget.searchParams.set('state', authState.originalState);
            res.redirect(redirectTarget.toString());
          } catch (error) {
            console.error('Failed to redirect to client', { redirectUri: authState.redirectUri, error });
            authorizationCodes.delete(authCode);
            res.status(400).send('Invalid redirect_uri');
          }
          return;
        }

        console.error('Unknown auth state type', { authState });
        res.status(500).send('Unexpected authentication flow');
      } catch (e) {
        console.error('OAuth callback error', e);
        res.status(500).send('OAuth callback error');
      }
    });

    // MCP Streamable HTTP endpoint (handles GET, POST, DELETE)
    this.app.all('/mcp', async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }

      const authHeader = req.headers['authorization'] as string | undefined;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        this.sendUnauthorized(req, res, 'Missing bearer token');
        return;
      }

      const token = authHeader.slice('Bearer '.length).trim();
      if (!token || !isTokenAuthorized(token)) {
        this.sendUnauthorized(req, res, 'Invalid or expired bearer token');
        return;
      }

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

  private getBaseUrl(req: express.Request): string {
    const forwardedProto = getQueryParam(req.headers['x-forwarded-proto'] as any);
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    const forwardedHost = getQueryParam(req.headers['x-forwarded-host'] as any);
    const host = forwardedHost || req.headers.host || `${process.env.HOST || '0.0.0.0'}:${process.env.PORT || '8766'}`;
    return `${protocol}://${host}`;
  }

  private sendUnauthorized(req: express.Request, res: express.Response, message: string) {
    const baseUrl = this.getBaseUrl(req);
    const headerValue = `Bearer realm="todoist-mcp", authorization_uri="${baseUrl}/oauth/authorize", token_uri="${baseUrl}/oauth/token", scope="${DEFAULT_SCOPE}", registration_uri="${baseUrl}/oauth/register"`;
    res.setHeader('WWW-Authenticate', headerValue);
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message,
      },
      id: null,
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