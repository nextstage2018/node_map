import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
  ToolResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NODEMAP_USER_ID = process.env.NODEMAP_USER_ID;

if (!SUPABASE_URL || !SUPABASE_KEY || !NODEMAP_USER_ID) {
  console.error('Missing required environment variables:');
  if (!SUPABASE_URL) console.error('  - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  if (!NODEMAP_USER_ID) console.error('  - NODEMAP_USER_ID');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tool definitions
const tools: Tool[] = [
  {
    name: 'get_project_context',
    description:
      'Get project context including milestones, tasks, decision tree, and recent meeting records',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'UUID of the project to fetch context for',
        },
        include_tasks: {
          type: 'boolean',
          description: 'Whether to include tasks for each milestone (default: true)',
          default: true,
        },
        include_decision_tree: {
          type: 'boolean',
          description: 'Whether to include decision tree structure (default: true)',
          default: true,
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'create_meeting_record',
    description: 'Create a new meeting record and optionally generate business event',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'UUID of the project for this meeting',
        },
        title: {
          type: 'string',
          description: 'Title of the meeting',
        },
        meeting_date: {
          type: 'string',
          description: 'ISO date string of when the meeting occurred',
        },
        content: {
          type: 'string',
          description: 'Meeting transcript or summary content',
        },
        source_type: {
          type: 'string',
          description: 'Source type: transcription, notes, or audio (default: transcription)',
          default: 'transcription',
        },
        ai_summary: {
          type: 'string',
          description: 'Optional pre-generated AI summary',
        },
      },
      required: ['project_id', 'title', 'meeting_date', 'content'],
    },
  },
  {
    name: 'get_decision_tree',
    description: 'Get decision tree structure for a project with node hierarchy and history',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'UUID of the project',
        },
        status_filter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of node statuses to filter by (e.g. ["pending", "in_progress"])',
        },
        include_cancelled: {
          type: 'boolean',
          description: 'Whether to include cancelled nodes (default: true)',
          default: true,
        },
      },
      required: ['project_id'],
    },
  },
];

// Tool handler functions
async function getProjectContext(params: {
  project_id: string;
  include_tasks?: boolean;
  include_decision_tree?: boolean;
}): Promise<string> {
  const { project_id, include_tasks = true, include_decision_tree = true } = params;

  try {
    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single();

    if (projectError) throw projectError;
    if (!project) return JSON.stringify({ error: 'Project not found' });

    // Fetch milestones with task counts
    const { data: milestones, error: milestonesError } = await supabase
      .from('milestones')
      .select('*')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false });

    if (milestonesError) throw milestonesError;

    // Fetch tasks if requested
    let tasks: any[] = [];
    if (include_tasks) {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', project_id)
        .eq('user_id', NODEMAP_USER_ID)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;
      tasks = tasksData || [];
    }

    // Fetch decision tree if requested
    let decisionTrees: any[] = [];
    let decisionNodes: any[] = [];
    if (include_decision_tree) {
      const { data: trees, error: treesError } = await supabase
        .from('decision_trees')
        .select('*')
        .eq('project_id', project_id);

      if (treesError) throw treesError;
      decisionTrees = trees || [];

      if (decisionTrees.length > 0) {
        const treeIds = decisionTrees.map((t) => t.id);
        const { data: nodes, error: nodesError } = await supabase
          .from('decision_tree_nodes')
          .select('*')
          .in('tree_id', treeIds)
          .order('created_at', { ascending: false });

        if (nodesError) throw nodesError;
        decisionNodes = nodes || [];
      }
    }

    // Fetch recent meeting records
    const { data: meetingRecords, error: meetingsError } = await supabase
      .from('meeting_records')
      .select('*')
      .eq('project_id', project_id)
      .order('meeting_date', { ascending: false })
      .limit(3);

    if (meetingsError) throw meetingsError;

    return JSON.stringify({
      project,
      milestones,
      tasks,
      decisionTrees,
      decisionNodes,
      recentMeetingRecords: meetingRecords || [],
    });
  } catch (error) {
    return JSON.stringify({
      error: `Failed to get project context: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function createMeetingRecord(params: {
  project_id: string;
  title: string;
  meeting_date: string;
  content: string;
  source_type?: string;
  ai_summary?: string;
}): Promise<string> {
  const {
    project_id,
    title,
    meeting_date,
    content,
    source_type = 'transcription',
    ai_summary,
  } = params;

  try {
    // Generate meeting record ID
    const meetingId = `mr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Insert meeting record
    const { data: meetingRecord, error: meetingError } = await supabase
      .from('meeting_records')
      .insert([
        {
          id: meetingId,
          project_id,
          user_id: NODEMAP_USER_ID,
          title,
          meeting_date,
          content,
          source_type,
          ai_summary: ai_summary || null,
          processed: false,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (meetingError) throw meetingError;

    // Insert business event
    const businessEventId = `be_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const { error: businessError } = await supabase
      .from('business_events')
      .insert([
        {
          id: businessEventId,
          project_id,
          user_id: NODEMAP_USER_ID,
          event_type: 'meeting',
          summary: title,
          description: content.substring(0, 500),
          occurred_at: new Date(meeting_date).toISOString(),
          ai_generated: true,
          meeting_record_id: meetingId,
          created_at: new Date().toISOString(),
        },
      ]);

    if (businessError) {
      console.error('Warning: Failed to create business event:', businessError.message);
    }

    return JSON.stringify({
      success: true,
      meeting_record_id: meetingId,
      message: 'Meeting record created successfully',
    });
  } catch (error) {
    return JSON.stringify({
      error: `Failed to create meeting record: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function getDecisionTree(params: {
  project_id: string;
  status_filter?: string[];
  include_cancelled?: boolean;
}): Promise<string> {
  const { project_id, status_filter, include_cancelled = true } = params;

  try {
    // Fetch decision trees
    const { data: trees, error: treesError } = await supabase
      .from('decision_trees')
      .select('*')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false });

    if (treesError) throw treesError;
    if (!trees || trees.length === 0) {
      return JSON.stringify({
        message: 'No decision trees found for this project',
        trees: [],
        nodes: [],
      });
    }

    const treeIds = trees.map((t) => t.id);

    // Build query for nodes
    let nodesQuery = supabase
      .from('decision_tree_nodes')
      .select('*')
      .in('tree_id', treeIds);

    if (!include_cancelled) {
      nodesQuery = nodesQuery.neq('status', 'cancelled');
    }

    if (status_filter && status_filter.length > 0) {
      nodesQuery = nodesQuery.in('status', status_filter);
    }

    const { data: nodes, error: nodesError } = await nodesQuery.order('created_at', {
      ascending: false,
    });

    if (nodesError) throw nodesError;

    // Fetch node history (latest 10 changes)
    const { data: history, error: historyError } = await supabase
      .from('decision_tree_node_history')
      .select('*')
      .in(
        'node_id',
        (nodes || []).map((n) => n.id)
      )
      .order('created_at', { ascending: false })
      .limit(10);

    if (historyError) throw historyError;

    // Build hierarchy
    const nodeMap = new Map();
    (nodes || []).forEach((node) => {
      nodeMap.set(node.id, { ...node, children: [] });
    });

    const rootNodes: any[] = [];
    nodeMap.forEach((node, nodeId) => {
      if (node.parent_node_id) {
        const parent = nodeMap.get(node.parent_node_id);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });

    return JSON.stringify({
      trees,
      rootNodes,
      allNodes: nodes || [],
      recentHistory: history || [],
    });
  } catch (error) {
    return JSON.stringify({
      error: `Failed to get decision tree: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// Process tool calls
async function processToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case 'get_project_context':
      return getProjectContext(
        toolInput as Parameters<typeof getProjectContext>[0]
      );
    case 'create_meeting_record':
      return createMeetingRecord(
        toolInput as Parameters<typeof createMeetingRecord>[0]
      );
    case 'get_decision_tree':
      return getDecisionTree(
        toolInput as Parameters<typeof getDecisionTree>[0]
      );
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// Initialize and run MCP server
async function main() {
  const server = new Server({
    name: 'nodemap-mcp-server',
    version: '0.1.0',
  });

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await processToolCall(
      request.params.name,
      request.params.arguments as Record<string, unknown>
    );

    return {
      content: [
        {
          type: 'text',
          text: result,
        } as TextContent,
      ],
    } as ToolResponse;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('NodeMap MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
