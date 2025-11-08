# Todoist MCP Server HTTP

A complete rewrite of the original [@Chrusic/todoist-mcp-server-extended](https://github.com/Chrusic/todoist-mcp-server-extended) project, featuring:

- **HTTP-based MCP server** using `StreamableHTTPServerTransport`
- **GitHub OAuth authentication** for secure access
- **Docker deployment** with Cloudflare tunnel support
- **Enhanced Todoist API integration** with comments support
- **Production-ready architecture** following proven MCP patterns

## 🚀 Live Deployment

This server is deployed and accessible at:
- **Health Check**: https://todoist.ssc.one/health
- **MCP Endpoint**: https://todoist.ssc.one/mcp

## 🏗️ Architecture Changes

This is a **complete architectural rewrite** from the original stdio-based MCP server:

### Original vs. This Version

| Feature | Original | This Version |
|---------|----------|-------------|
| Transport | `StdioServerTransport` | `StreamableHTTPServerTransport` |
| Authentication | None | GitHub OAuth |
| Deployment | Local npm install | Docker + Cloudflare tunnel |
| Session Management | None | UUID-based sessions |
| Comments Support | ❌ | ✅ |
| Batch Operations | Basic | Enhanced |
| Error Handling | Basic | Comprehensive |

## 🛠️ Features

- **Task Management**: Create, update, complete, and delete tasks
- **Project Management**: Create and manage Todoist projects
- **Comments Support**: Add and retrieve task comments
- **Batch Operations**: Handle multiple tasks/projects at once
- **ULID-First Architecture**: Modern ULID identifiers with automatic legacy ID conversion
- **GitHub Authentication**: Secure access via OAuth
- **Docker Ready**: Containerized deployment
- **Health Monitoring**: Built-in health checks

## 🤖 Using with OpenAI (ChatGPT Desktop)

This server exposes MCP over HTTP and is compatible with OpenAI clients that support MCP.

1. Start the server locally or use your deployed URL. Defaults:
   - Health: `https://todoist.ssc.one/health`
   - MCP: `https://todoist.ssc.one/mcp`
2. Authenticate and get an API token (recommended):

   - Visit: `https://todoist.ssc.one/auth/github/login`
   - After GitHub OAuth completes, copy the issued API token shown on the page.

3. Configure your OpenAI client’s MCP settings to include the Authorization header:

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

See `doc/Howto - Setting up OpenAI Todoist MCP.md` for details. This is additive and does not change existing Claude support.

## 🧑‍💻 Using with Claude (Desktop)

Claude can target the same HTTP MCP endpoint. Add or update the Claude Desktop config to include the Authorization header after obtaining a token via `https://todoist.ssc.one/auth/github/login`:

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

Alternative for CI/headless: set a pre-shared token in `MCP_ALLOWED_TOKENS` and use that value in your client headers. This avoids hardcoding secrets in code or commits.

## 📋 Available Tools

- `todoist_create_task` - Create single or batch tasks
- `todoist_get_tasks` - Retrieve tasks with filtering
- `todoist_update_task` - Update single or batch tasks
- `todoist_delete_task` - Delete single or batch tasks
- `todoist_complete_task` - Mark tasks as complete
- `todoist_get_projects` - Retrieve projects
- `todoist_create_project` - Create single or batch projects
- `todoist_get_task_comments` - Get task comments
- `todoist_create_task_comment` - Add task comments

**Note on IDs**: This server uses ULID identifiers exclusively. If your Todoist account still uses legacy numeric IDs (common for accounts created before 2024), the server automatically converts them to ULIDs using Todoist's Sync API v9 `id_mappings` endpoint. All responses will contain ULIDs, ensuring consistency across all operations. Request a migration to ULIDs via Todoist support for native ULID support.

## 🐳 Docker Deployment

### Prerequisites

1. **Todoist API Token** - Get from [Todoist Settings → Integrations](https://todoist.com/prefs/integrations)
2. **GitHub OAuth App** - Set up in GitHub Developer Settings
3. **Cloudflare Account** - For tunnel setup

### Environment Variables

Create a `.env` file:

```bash
TODOIST_API_TOKEN=your_todoist_api_token
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:8766/auth/github/callback
# Optional: pre-shared MCP tokens (comma-separated) for CI/tests or headless clients
MCP_ALLOWED_TOKENS=token_for_ci,another_token
# Used by tests and local tooling to authorize calls against /mcp
GITHUB_OAUTH_BEARER_TOKEN=token_for_ci
```

### Docker Compose

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Manual Docker Commands

```bash
# Build image
docker build -t todoist-mcp-server-extended .

# Run container
docker run -d --name todoist-mcp-server \
  -p 8766:8766 \
  --env-file .env \
  todoist-mcp-server-extended

# Set up Cloudflare tunnel (inside container)
docker exec -it todoist-mcp-server /bin/sh
cloudflared tunnel login
cloudflared tunnel create todoist-mcp
cloudflared tunnel route dns todoist-mcp your-domain.com
```

## 🌐 Cloudflare Tunnel Setup

1. **Install cloudflared** in the Docker container
2. **Create tunnel**: `cloudflared tunnel create todoist-mcp`
3. **Add DNS record**: `cloudflared tunnel route dns todoist-mcp your-domain.com`
4. **Configure tunnel** with `config.yml`:

```yaml
tunnel: your-tunnel-id
credentials-file: /root/.cloudflared/your-tunnel-id.json

ingress:
  - hostname: your-domain.com
    service: http://localhost:8766
  - service: http_status:404
```

## 🔧 Development

### Prerequisites

- Node.js 22+
- TypeScript 5.7+
- Docker (optional)

### Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
MCP_TEST_TARGET=remote npm test

# Type check
npm run build:check
```

### Testing modes

- `MCP_TEST_TARGET=remote` (default) exercises the deployed server at `https://todoist.ssc.one`.  
  Use when running on the host or CI without Docker access. Requires network connectivity.
- `MCP_TEST_TARGET=local` runs the compiled server in-process on `127.0.0.1`.  
  Use only inside the Docker container (`docker exec`) where binding to localhost is permitted.
- `MCP_E2E_ENABLED=1` runs the optional ULID end-to-end test (`tests/tools/external-e2e.test.js`).  
  Requires `MCP_E2E_BEARER_TOKEN` (or `MCP_ALLOWED_TOKENS`) and `TODOIST_API_TOKEN` for cleanup.

If `MCP_TEST_TARGET=remote` cannot reach the deployment (for example, due to missing network access), the integration suites automatically skip and emit a warning.

### Docker release checklist

1. `npm install`
2. `npm run build`
3. `MCP_TEST_TARGET=remote npm test` (and `MCP_E2E_ENABLED=1` when running in staging with valid credentials)
4. `docker build -t todoist-mcp-server-http .`
5. `docker push todoist-mcp-server-http` *(replace with your registry tag when ready)*

Only push after the TypeScript build, remote integration tests, and the optional ULID end-to-end test (when enabled) all succeed.

### Scripts

- `npm run build` - Compile TypeScript
- `npm run build:check` - Type check without emit
- `npm test` - Run test suite
- `npm run docker:build` - Build Docker image with tests
- `npm run docker:build:fast` - Quick Docker build

## 🧪 Testing

Uses Node.js built-in test runner with JavaScript test files:

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
```

Test files are in `tests/` directory using `.js` extension to avoid TypeScript compilation issues.

## 🙏 Credits & Inspiration

This project is a complete architectural rewrite inspired by the original [@Chrusic/todoist-mcp-server-extended](https://github.com/Chrusic/todoist-mcp-server-extended).

**Key differences from the original:**
- **Transport**: HTTP-based (`StreamableHTTPServerTransport`) vs stdio-based (`StdioServerTransport`)
- **Authentication**: GitHub OAuth integration vs none
- **Deployment**: Docker-first with Cloudflare tunnels vs local npm install
- **Architecture**: Session management, batch operations, enhanced error handling
- **Features**: Comments support, smart task search, production-ready logging

**Original Project**: [@Chrusic/todoist-mcp-server-extended](https://github.com/Chrusic/todoist-mcp-server-extended) - A stdio-based MCP server for Todoist integration.

## 📚 Original Project

## 🤝 Contributing

This project follows a different architecture from the original. If you want to contribute:

1. Fork this repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/heathweaver/todoist-mcp-server-http/issues)
- **Health Check**: https://todoist.ssc.one/health
- **MCP Endpoint**: https://todoist.ssc.one/mcp