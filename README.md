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
- **Smart Search**: Find tasks by name when ID not available
- **GitHub Authentication**: Secure access via OAuth
- **Docker Ready**: Containerized deployment
- **Health Monitoring**: Built-in health checks

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
npm test

# Type check
npm run build:check
```

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