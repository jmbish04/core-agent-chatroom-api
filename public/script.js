let ws = null;
let agentId = null;
let messageCount = 0;
let agents = new Map();
let locks = new Map();

function updateStatus(status, className) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = status;
  statusEl.className = 'status ' + className;
}

function connect() {
  const agentName = document.getElementById('agentName').value || 'Agent-1';
  const roomId = document.getElementById('roomId').value || 'default';
  agentId = 'agent-' + Date.now();

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}?agentId=${agentId}&agentName=${encodeURIComponent(agentName)}`;

  document.getElementById('wsUrl').textContent = wsUrl;
  document.getElementById('agentId').textContent = agentId;
  document.getElementById('currentRoom').textContent = roomId;

  updateStatus('Connecting...', 'connecting');

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateStatus('Connected', 'connected');
    document.getElementById('connectBtn').disabled = true;
    document.getElementById('disconnectBtn').disabled = false;
    document.getElementById('chatInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    addMessage('System', `Connected to room: ${roomId}`, 'system');
  };

  ws.onmessage = (event) => {
    try { handleMessage(JSON.parse(event.data)); }
    catch (e) { console.error('Parse error:', e); }
  };

  ws.onerror = () => addMessage('Error', 'WebSocket error occurred', 'error');

  ws.onclose = () => {
    updateStatus('Disconnected', 'disconnected');
    document.getElementById('connectBtn').disabled = false;
    document.getElementById('disconnectBtn').disabled = true;
    document.getElementById('chatInput').disabled = true;
    document.getElementById('sendBtn').disabled = true;
    addMessage('System', 'Disconnected from room', 'system');
    agents.clear(); locks.clear();
    updateAgentsList(); updateLocksList();
  };
}

function disconnect() { if (ws) ws.close(); }

function handleMessage(msg) {
  messageCount++;
  document.getElementById('messageCount').textContent = messageCount;
  switch (msg.type) {
    case 'chat':
      addMessage(msg.data.agentName || msg.data.agentId, msg.data.content, 'chat'); break;
    case 'agent_joined':
      agents.set(msg.data.agentId, msg.data);
      addMessage('System', `${msg.data.agentName} joined`, 'system');
      updateAgentsList(); updateStats(); break;
    case 'agent_left':
      agents.delete(msg.data.agentId);
      addMessage('System', `${msg.data.agentName} left`, 'system');
      updateAgentsList(); updateStats(); break;
    default:
      addMessage(msg.type, JSON.stringify(msg.data, null, 2), 'system');
  }
}

function addMessage(type, content, className = '') {
  const messagesEl = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message ' + className;
  div.innerHTML = `
    <div class="message-time">${new Date().toLocaleTimeString()}</div>
    <div class="message-type">${type}</div>
    <div class="message-content">${content}</div>`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const content = input.value.trim();
  if (!content || !ws) return;
  ws.send(JSON.stringify({ type: 'chat', content }));
  input.value = '';
}

function lockFile() {
  const filePath = prompt('Enter file path to lock:', '/src/example.ts');
  if (!filePath || !ws) return;
  const lockType = prompt('Lock type (read/write/create):', 'write');
  ws.send(JSON.stringify({ type: 'file_lock', filePath, lockType: lockType || 'write' }));
}

function unlockFile() {
  const filePath = prompt('Enter file path to unlock:', '/src/example.ts');
  if (!filePath || !ws) return;
  ws.send(JSON.stringify({ type: 'file_unlock', filePath }));
}

function queryHistory() {
  if (ws) ws.send(JSON.stringify({ type: 'query', query: { queryType: 'history', filters: { limit: 20 } } }));
}

function queryLocks() {
  if (ws) ws.send(JSON.stringify({ type: 'query', query: { queryType: 'locks' } }));
}

function sendHelp() { if (ws) ws.send(JSON.stringify({ type: 'help' })); }

function updateAgentsList() {
  const list = document.getElementById('agentsList');
  list.innerHTML = agents.size
    ? [...agents].map(([id,a]) =>
        `<li class="agent-item"><div><div class="agent-name">${a.agentName||id}</div><div class="agent-id">${id}</div></div></li>`).join('')
    : '<li style="color:#666;font-style:italic;">No agents connected</li>';
}

function updateLocksList() {
  const list = document.getElementById('locksList');
  list.innerHTML = locks.size
    ? [...locks].map(([fp,l]) =>
        `<li class="lock-item"><div class="lock-file">${fp}</div><div class="lock-info">Locked by: ${l.agentName||l.agentId} (${l.lockType})</div></li>`).join('')
    : '<li style="color:#666;font-style:italic;">No active locks</li>';
}

function updateStats() {
  document.getElementById('agentCount').textContent = agents.size;
  document.getElementById('lockCount').textContent = locks.size;
}

function showTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(tabName).classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chatInput').addEventListener('keypress', e => { if (e.key === 'Enter') sendChat(); });
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  document.getElementById('mcpWsUrl').textContent = `${protocol}//${window.location.host}/ws/{roomId}?agentId={id}&agentName={name}`;
});
