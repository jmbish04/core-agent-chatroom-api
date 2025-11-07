#!/usr/bin/env node

/**
 * Test Client for Core Agent Chatroom API
 *
 * This script demonstrates how to use the WebSocket API to coordinate agents.
 *
 * Usage:
 *   node test-client.js [ws-url] [agent-name]
 *
 * Example:
 *   node test-client.js ws://localhost:8787/ws/default Agent1
 */

const WebSocket = require('ws');

const wsUrl = process.argv[2] || 'ws://localhost:8787/ws/default';
const agentName = process.argv[3] || `TestAgent-${Date.now()}`;
const agentId = `test-${Date.now()}`;

console.log(`\n🤖 Core Agent Chatroom - Test Client`);
console.log(`=====================================`);
console.log(`Agent Name: ${agentName}`);
console.log(`Agent ID: ${agentId}`);
console.log(`Connecting to: ${wsUrl}`);
console.log(`=====================================\n`);

const fullUrl = `${wsUrl}?agentId=${agentId}&agentName=${encodeURIComponent(agentName)}`;
const ws = new WebSocket(fullUrl);

ws.on('open', () => {
  console.log('✅ Connected!\n');

  // Demonstrate various features
  demonstrateFeatures();
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  console.log(`\n📨 Received: ${message.type}`);
  console.log(`   Timestamp: ${new Date(message.timestamp).toISOString()}`);
  console.log(`   Data:`, JSON.stringify(message.data, null, 2));
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n👋 Disconnected');
  process.exit(0);
});

function send(message) {
  ws.send(JSON.stringify(message));
  console.log(`\n📤 Sent: ${message.type}`);
}

function demonstrateFeatures() {
  let step = 0;

  const steps = [
    // Step 1: Send a chat message
    () => {
      console.log('\n--- Step 1: Send a chat message ---');
      send({
        type: 'chat',
        content: 'Hello from test client!',
        metadata: { step: 1 }
      });
    },

    // Step 2: Request a file lock
    () => {
      console.log('\n--- Step 2: Request a file lock ---');
      send({
        type: 'file_lock',
        filePath: '/test/example.ts',
        lockType: 'write'
      });
    },

    // Step 3: Query active locks
    () => {
      console.log('\n--- Step 3: Query active locks ---');
      send({
        type: 'query',
        query: {
          queryType: 'locks'
        }
      });
    },

    // Step 4: Query message history
    () => {
      console.log('\n--- Step 4: Query message history ---');
      send({
        type: 'query',
        query: {
          queryType: 'history',
          filters: { limit: 10 }
        }
      });
    },

    // Step 5: Release the file lock
    () => {
      console.log('\n--- Step 5: Release the file lock ---');
      send({
        type: 'file_unlock',
        filePath: '/test/example.ts'
      });
    },

    // Step 6: Get help information
    () => {
      console.log('\n--- Step 6: Get help information ---');
      send({
        type: 'help'
      });
    },

    // Step 7: Send a ping
    () => {
      console.log('\n--- Step 7: Send a ping ---');
      send({
        type: 'ping'
      });
    },

    // Step 8: Disconnect
    () => {
      console.log('\n--- Test complete! ---');
      console.log('Disconnecting in 2 seconds...');
      setTimeout(() => {
        ws.close();
      }, 2000);
    }
  ];

  // Execute steps with delay
  function nextStep() {
    if (step < steps.length) {
      steps[step]();
      step++;
      setTimeout(nextStep, 2000);
    }
  }

  // Start after welcome message
  setTimeout(nextStep, 1000);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Received SIGINT, closing connection...');
  ws.close();
  process.exit(0);
});
