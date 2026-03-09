# NodeMap MCP Server

The NodeMap Model Context Protocol (MCP) server provides Claude with programmatic access to NodeMap's core features via three main tools:

- **get_project_context**: Retrieve project overview including milestones, tasks, decision trees, and recent meeting records
- **create_meeting_record**: Create new meeting records with automatic business event generation
- **get_decision_tree**: Query decision tree structures with node hierarchy and change history

## Setup

### Prerequisites
- Node.js 18+
- Supabase account with NodeMap database
- Service role API key from Supabase

### Installation

1. Clone the repository (if not already done):
```bash
cd mcp-server
npm install
```

2. Create `.env` from `.env.example`:
```bash
cp .env.example .env
```

3. Fill in environment variables:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODEMAP_USER_ID=your-user-uuid
```

4. Build the server:
```bash
npm run build
```

## Running

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## Claude Desktop Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nodemap": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "NODEMAP_USER_ID": "your-user-uuid"
      }
    }
  }
}
```

## Tools

### get_project_context
Retrieves comprehensive project context:
- Project metadata
- All milestones with task counts
- Tasks (if include_tasks=true)
- Decision tree structure (if include_decision_tree=true)
- Last 3 meeting records

**Parameters:**
- `project_id` (required): UUID of the project
- `include_tasks` (optional, default: true): Include tasks
- `include_decision_tree` (optional, default: true): Include decision tree

### create_meeting_record
Creates a meeting record and optional business event:
- Generates unique record ID
- Stores meeting content
- Creates associated business event
- Supports optional AI summary

**Parameters:**
- `project_id` (required): UUID of the project
- `title` (required): Meeting title
- `meeting_date` (required): ISO date string
- `content` (required): Meeting transcript/notes
- `source_type` (optional, default: 'transcription'): 'transcription', 'notes', or 'audio'
- `ai_summary` (optional): Pre-generated summary

### get_decision_tree
Retrieves decision tree with full hierarchy:
- Tree root nodes
- Node hierarchy with parent-child relationships
- Optional status filtering
- Last 10 node history entries

**Parameters:**
- `project_id` (required): UUID of the project
- `status_filter` (optional): Array of node statuses to filter
- `include_cancelled` (optional, default: true): Include cancelled nodes

## Architecture

The server uses the MCP SDK with stdio transport, communicating with Claude Desktop via standard input/output. All queries use Supabase's JavaScript client with service role authentication for full database access.

## Error Handling

All tool calls return JSON responses with either:
- Success data (get_* calls) or confirmation (create_*)
- Error field with descriptive message on failure

The server logs errors to stderr without crashing, allowing continued operation.
