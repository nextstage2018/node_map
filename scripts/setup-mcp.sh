#!/bin/bash
# NodeMap MCPサーバー セットアップスクリプト
# 使い方: ./scripts/setup-mcp.sh

echo "=== NodeMap MCP セットアップ ==="
echo ""
echo "SupabaseのユーザーIDを入力してください。"
echo "確認方法: Supabaseダッシュボード → Authentication → Users → 自分のUID"
echo ""
read -p "ユーザーID: " USER_ID

if [ -z "$USER_ID" ]; then
  echo "❌ ユーザーIDが入力されていません。"
  exit 1
fi

# .mcp.json を生成
cat > .mcp.json << EOF
{
  "mcpServers": {
    "nodemap": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://uddeabygusvmcvyqwdfv.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkZGVhYnlndXN2bWN2eXF3ZGZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ4OTE0NywiZXhwIjoyMDg3MDY1MTQ3fQ.oFI4eUP0L6V4FEr5956vc7NZudP_iFwuJU2pKlbinhw",
        "NODEMAP_USER_ID": "$USER_ID"
      }
    }
  }
}
EOF

echo ""
echo "✅ セットアップ完了！"
echo "   .mcp.json を生成しました（ユーザーID: $USER_ID）"
echo ""
echo "次に以下を実行してください:"
echo "   cd mcp-server && npm install && npm run build"
