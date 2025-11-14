#!/usr/bin/env bash

set -euo pipefail

# Determine repository root based on script location
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

echo "==> Creating target directories"
mkdir -p src/endpoints/api
mkdir -p src/endpoints/rpc
mkdir -p src/endpoints/mcp
mkdir -p src/durable-objects

move_if_exists() {
  local source_path="$1"
  local target_path="$2"

  if [[ -e "$target_path" ]]; then
    echo "    Skipping move; target already exists: $target_path"
    return
  fi

  if [[ -e "$source_path" ]]; then
    mkdir -p "$(dirname "$target_path")"
    mv "$source_path" "$target_path"
    echo "    Moved $source_path -> $target_path"
  else
    echo "    Source not found, skipping: $source_path"
  fi
}

echo "==> Relocating worker entrypoint files"
move_if_exists "src/router.ts" "src/endpoints/api/router.ts"
move_if_exists "src/rpc.ts" "src/endpoints/rpc/handler.ts"
move_if_exists "src/mcp/server/handler.ts" "src/endpoints/mcp/server.ts"

echo "==> Relocating Durable Object implementations"
move_if_exists "src/do/RoomDO.ts" "src/durable-objects/RoomDO.ts"
move_if_exists "src/do/AgentRoomDO.ts" "src/durable-objects/AgentRoomDO.ts"
move_if_exists "src/agents/mcp/CloudflareDocsMcpAgent.ts" "src/durable-objects/CloudflareDocsMcpAgent.ts"

echo "==> Cleaning up empty legacy directories"
if [[ -d "src/mcp/server" ]]; then
  rmdir "src/mcp/server" 2>/dev/null || true
fi
if [[ -d "src/do" ]]; then
  rmdir "src/do" 2>/dev/null || true
fi

export REORG_ROOT="$ROOT"

echo "==> Updating import paths and documentation references"
python3 <<'PYTHON'
import os
from pathlib import Path

root = Path(os.environ["REORG_ROOT"])

def apply_replacements(path: Path, replacements: list[tuple[str, str]]) -> None:
    if not path.exists():
        return
    original = path.read_text()
    updated = original
    for old, new in replacements:
        updated = updated.replace(old, new)
    if updated != original:
        path.write_text(updated)

# Update worker entry point imports and comments
apply_replacements(
    root / "src" / "index.ts",
    [
        ("./router", "./endpoints/api/router"),
        ("./rpc", "./endpoints/rpc/handler"),
        ("./mcp/server/handler", "./endpoints/mcp/server"),
        ("./do/", "./durable-objects/"),
        ("./agents/mcp/CloudflareDocsMcpAgent", "./durable-objects/CloudflareDocsMcpAgent"),
    ],
)

# Update legacy MCP shim to point at new location
apply_replacements(
    root / "src" / "mcp.ts",
    [
        ("./mcp/server/handler", "./endpoints/mcp/server"),
        ("src/mcp/server/handler.ts", "src/endpoints/mcp/server.ts"),
        ("src/mcp/server/", "src/endpoints/mcp/"),
    ],
)

# Update MCP server handler imports after relocation
apply_replacements(
    root / "src" / "endpoints" / "mcp" / "server.ts",
    [
        ('from "../../rpc"', 'from "../rpc/handler"'),
    ],
)

# Update API router imports to account for new directory depth
apply_replacements(
    root / "src" / "endpoints" / "api" / "router.ts",
    [
        ('from "./types"', 'from "../../types"'),
        ('from "./schemas/apiSchemas"', 'from "../../schemas/apiSchemas"'),
        ('from "./utils/db"', 'from "../../utils/db"'),
        ('from "./utils/tasks"', 'from "../../utils/tasks"'),
        ('from "./tests/runner"', 'from "../../tests/runner"'),
        ('@see {@link ./schemas/apiSchemas.ts}', '@see {@link ../../schemas/apiSchemas.ts}'),
        ('@see {@link ./utils/tasks.ts}', '@see {@link ../../utils/tasks.ts}'),
        ('@see {@link ./utils/db.ts}', '@see {@link ../../utils/db.ts}'),
    ],
)

# Update RPC handler imports to account for new directory depth
apply_replacements(
    root / "src" / "endpoints" / "rpc" / "handler.ts",
    [
        ('from "./types"', 'from "../../types"'),
        ('from "./schemas/apiSchemas"', 'from "../../schemas/apiSchemas"'),
        ('from "./utils/tasks"', 'from "../../utils/tasks"'),
        ('from "./tests/runner"', 'from "../../tests/runner"'),
        ('from "./utils/db"', 'from "../../utils/db"'),
        ('from "./utils/cloudflareDocs"', 'from "../../utils/cloudflareDocs"'),
    ],
)

# Update Cloudflare Docs MCP Durable Object imports after relocation
apply_replacements(
    root / "src" / "durable-objects" / "CloudflareDocsMcpAgent.ts",
    [
        ('import type { Env } from "../../types";', 'import type { Env } from "../types";'),
        ('from "../../utils/cloudflareDocs"', 'from "../utils/cloudflareDocs"'),
        ('src/mcp/server/', 'src/endpoints/mcp/'),
        ('Location: This file is in src/agents/mcp/', 'Location: This file is in src/durable-objects/'),
    ],
)

# Update type documentation references to new Durable Object folder
apply_replacements(
    root / "src" / "types.ts",
    [
        ("./do/", "./durable-objects/"),
        ("./rpc.ts", "./endpoints/rpc/handler.ts"),
    ],
)

# Update Durable Object references in comments across docs and source
for relative_path in [
    Path("ARCHITECTURE.md"),
    Path("AGENT_INTEGRATION.md"),
    Path("src/agents/mcp/README.md"),
    Path("src/agents/tools/mcp/cloudflareDocs.ts"),
]:
    apply_replacements(
        root / relative_path,
        [
            ("src/do/", "src/durable-objects/"),
            ("./do/", "./durable-objects/"),
        ],
    )

# Update MCP documentation references to new endpoints location
for relative_path in [
    Path("ARCHITECTURE.md"),
    Path("src/agents/mcp/README.md"),
    Path("src/agents/tools/mcp/cloudflareDocs.ts"),
    Path("src/mcp.ts"),
]:
    apply_replacements(
        root / relative_path,
        [
            ("src/mcp/server/", "src/endpoints/mcp/"),
            ("src/endpoints/mcp/handler.ts", "src/endpoints/mcp/server.ts"),
        ],
    )

# Refresh directory tree block in ARCHITECTURE.md
architecture_path = root / "ARCHITECTURE.md"
if architecture_path.exists():
    doc = architecture_path.read_text()
    old_block = """```
src/
├── mcp/                          # MCP Server (OUTBOUND)
│   ├── server/
│   │   └── handler.ts            # Exposes our chatroom API as MCP tools
│   └── README.md                 # MCP server documentation
│
├── agents/                       # Agent MCP Client Tools (INBOUND)
│   ├── mcp/
│   │   ├── client.ts             # MCP client manager
│   │   └── README.md             # Agent MCP tools documentation
│   └── tools/
│       └── mcp/
│           └── cloudflareDocs.ts # Cloudflare docs tools for our agents
│
└── do/
    └── CloudflareDocsMcpAgent.ts # Durable Object using Agents SDK MCP pattern
```"""
    new_block = """```
src/
├── endpoints/                    # Worker surface area (REST, RPC, MCP)
│   ├── api/
│   │   └── router.ts             # Hono REST API
│   ├── rpc/
│   │   └── handler.ts            # JSON-RPC entrypoint
│   └── mcp/
│       └── server.ts             # MCP server exposing our tools
│
├── agents/                       # Agent MCP Client Tools (INBOUND)
│   ├── mcp/
│   │   ├── client.ts             # MCP client manager
│   │   └── README.md             # Agent MCP tools documentation
│   └── tools/
│       └── mcp/
│           └── cloudflareDocs.ts # Cloudflare docs tools for our agents
│
└── durable-objects/
    ├── AgentRoomDO.ts            # Durable Object for agent coordination
    ├── CloudflareDocsMcpAgent.ts # Durable Object using Agents SDK MCP pattern
    └── RoomDO.ts                 # Base chatroom Durable Object
```"""
    if old_block in doc:
        architecture_path.write_text(doc.replace(old_block, new_block))

PYTHON

echo "==> Reorganization complete"
