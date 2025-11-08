# Setting up Todoist MCP for OpenAI (ChatGPT Desktop)

This guide helps you connect the Todoist MCP HTTP server to OpenAI clients that support the Model Context Protocol (MCP), such as ChatGPT Desktop, without affecting your existing Claude setup.

## Requirements

- Running instance of this server (HTTP endpoint), e.g. your deployed URL `https://todoist.ssc.one/mcp` (via Cloudflare tunnel)
- Todoist API token available as `TODOIST_API_TOKEN`
- OpenAI ChatGPT Desktop app with MCP support

## Start the server

If you need to run locally (optional):

```bash
export TODOIST_API_TOKEN=your_token_here
npm run build && node dist/index.js
```

Deployed endpoints (replace with your subdomain if different):
- Health: `https://todoist.ssc.one/health`
- MCP endpoint: `https://todoist.ssc.one/mcp`

## Configure ChatGPT Desktop (OpenAI)

First, authenticate and obtain an API token:

1. Visit `https://todoist.ssc.one/auth/github/login`
2. Complete GitHub OAuth and copy the issued API token shown.

Then add or edit your MCP configuration to point to the HTTP endpoint and include the Authorization header. OpenAI clients supporting MCP typically use a configuration file where you declare servers. Create/update the configuration to include an entry like the following (using your Cloudflare subdomain):

```json
{
  "mcpServers": {
    "todoist": {
      "type": "http",
      "url": "https://todoist.ssc.one/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ISSUED_TOKEN"
      }
    }
  }
}
```

Notes:
- This server implements MCP over HTTP using `StreamableHTTPServerTransport` and enforces access with a bearer token in the `Authorization` header.
- If you are using a different subdomain, replace the URL accordingly.

## Usage examples

Once connected, ask your OpenAI client to call tools like:
- "Create a Todoist task called 'Review report' due tomorrow"
- "Get my overdue tasks"
- "Create a project 'Home Renovation' with a 'Materials' section"

## Troubleshooting

- Ensure `TODOIST_API_TOKEN` is set when starting the server.
- Verify `http://localhost:8766/health` returns `{ "status": "ok" }`.
- If requests fail, check your client’s developer tools/console for MCP errors.
- CORS is permissive and exposes the `Mcp-Session-Id` header; if using a browser-based client behind additional security layers, ensure those layers forward headers.

## Claude compatibility

This change is additive. Claude continues to work unchanged with its existing configuration. The HTTP endpoint is client-agnostic and supports both Claude and OpenAI MCP clients concurrently.


