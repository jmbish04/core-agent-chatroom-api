-- Core Agent Chatroom Database Schema
-- This database logs all messages and events for agent coordination

-- Messages table - stores all chat messages
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    message_type TEXT NOT NULL, -- 'chat', 'system', 'file_lock', 'file_unlock', 'query', 'help'
    content TEXT NOT NULL,
    metadata TEXT, -- JSON string for additional data
    timestamp INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- File locks table - tracks what files agents are working on
CREATE TABLE IF NOT EXISTS file_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    lock_type TEXT NOT NULL, -- 'read', 'write', 'create'
    status TEXT NOT NULL, -- 'locked', 'released'
    locked_at INTEGER NOT NULL,
    released_at INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, file_path, agent_id, status)
);

-- Rooms table - tracks active chat rooms
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    active_agents INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent presence table - tracks which agents are in which rooms
CREATE TABLE IF NOT EXISTS agent_presence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    status TEXT NOT NULL, -- 'online', 'offline'
    joined_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, agent_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_room_timestamp ON messages(room_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_file_locks_room_id ON file_locks(room_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_file_path ON file_locks(file_path);
CREATE INDEX IF NOT EXISTS idx_file_locks_agent_id ON file_locks(agent_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_status ON file_locks(status);

CREATE INDEX IF NOT EXISTS idx_agent_presence_room_id ON agent_presence(room_id);
CREATE INDEX IF NOT EXISTS idx_agent_presence_agent_id ON agent_presence(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_presence_status ON agent_presence(status);

-- Create a view for active file locks
CREATE VIEW IF NOT EXISTS active_locks AS
SELECT
    fl.room_id,
    fl.file_path,
    fl.agent_id,
    fl.agent_name,
    fl.lock_type,
    fl.locked_at
FROM file_locks fl
WHERE fl.status = 'locked'
  AND fl.released_at IS NULL;
