#!/usr/bin/env node

/**
 * Comprehensive Project Management System Test
 *
 * This script tests all the project management functionality including:
 * - Epic and task creation
 * - Task assignments and status updates
 * - Blockages and human intervention
 * - Thread creation and messaging
 * - Search and filtering
 */

const BASE_URL = 'https://core-agent-chatroom-api.hacolby.workers.dev';
const TEST_PROJECT = 'test-project-alpha';

// Utility functions
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`\n📡 ${options.method || 'GET'} ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();
    console.log(`📄 Status: ${response.status}`);

    if (!response.ok) {
      console.error(`❌ Error:`, data);
      return { error: data, status: response.status };
    }

    return { data, status: response.status };
  } catch (error) {
    console.error(`❌ Network Error:`, error.message);
    return { error: error.message };
  }
}

// Test data
const testData = {
  epics: [
    {
      title: "User Authentication System",
      description: "Implement secure user login, registration, and session management",
      priority: "high",
      assignedAgent: "auth-agent",
      targetCompletion: "2025-12-01T00:00:00Z"
    },
    {
      title: "Real-time Collaboration Features",
      description: "Add real-time messaging, presence indicators, and collaborative editing",
      priority: "critical",
      assignedAgent: "realtime-agent",
      targetCompletion: "2025-11-15T00:00:00Z"
    }
  ],
  tasks: [
    // Epic 1 tasks
    {
      title: "Implement JWT Token Authentication",
      description: "Create JWT-based authentication system with refresh tokens",
      priority: "high",
      assignedAgent: "backend-agent",
      estimatedHours: 16,
      requiresHumanReview: false
    },
    {
      title: "Design User Registration Flow",
      description: "Create user-friendly registration with email verification",
      priority: "medium",
      assignedAgent: "frontend-agent",
      estimatedHours: 12,
      requiresHumanReview: true,
      humanReviewReason: "Need UX approval for registration flow"
    },
    {
      title: "Implement Password Reset",
      description: "Create secure password reset functionality",
      priority: "medium",
      assignedAgent: "backend-agent",
      estimatedHours: 8,
      requiresHumanReview: false
    },
    // Epic 2 tasks
    {
      title: "WebSocket Connection Management",
      description: "Implement robust WebSocket connection handling with reconnection",
      priority: "critical",
      assignedAgent: "websocket-agent",
      estimatedHours: 20,
      requiresHumanReview: false
    },
    {
      title: "Real-time Message Broadcasting",
      description: "Implement message broadcasting to all connected clients",
      priority: "high",
      assignedAgent: "realtime-agent",
      estimatedHours: 15,
      requiresHumanReview: false
    },
    {
      title: "Presence Indicators",
      description: "Show online/offline status for all users",
      priority: "medium",
      assignedAgent: "frontend-agent",
      estimatedHours: 10,
      requiresHumanReview: true,
      humanReviewReason: "Need design approval for presence UI"
    }
  ]
};

async function runTests() {
  console.log('🚀 Starting Comprehensive Project Management System Tests\n');

  // Test 1: Create Epics
  console.log('='.repeat(60));
  console.log('📋 TEST 1: Creating Epics');
  console.log('='.repeat(60));

  const createdEpics = [];
  for (const epic of testData.epics) {
    const result = await apiRequest('/api/epics', {
      method: 'POST',
      body: JSON.stringify({
        projectId: TEST_PROJECT,
        ...epic
      })
    });

    if (result.error) {
      console.log(`❌ Failed to create epic: ${epic.title}`);
    } else {
      console.log(`✅ Created epic: ${result.data.data.title} (ID: ${result.data.data.id})`);
      createdEpics.push(result.data.data);
    }
  }

  // Test 2: List Epics
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 2: Listing Epics');
  console.log('='.repeat(60));

  const epicsResult = await apiRequest(`/api/epics?projectId=${TEST_PROJECT}`);
  if (epicsResult.data) {
    console.log(`✅ Found ${epicsResult.data.data.epics.length} epics`);
    epicsResult.data.data.epics.forEach(epic => {
      console.log(`  📁 ${epic.title} (${epic.status})`);
    });
  }

  // Test 3: Create Tasks
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 3: Creating Tasks');
  console.log('='.repeat(60));

  const createdTasks = [];
  for (let i = 0; i < testData.tasks.length; i++) {
    const task = testData.tasks[i];
    const epicId = i < 3 ? createdEpics[0]?.id : createdEpics[1]?.id;

    const result = await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        projectId: TEST_PROJECT,
        epicId,
        ...task
      })
    });

    if (result.error) {
      console.log(`❌ Failed to create task: ${task.title}`);
    } else {
      console.log(`✅ Created task: ${result.data.data.title} (ID: ${result.data.data.id})`);
      createdTasks.push(result.data.data);
    }
  }

  // Test 4: List Tasks
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 4: Listing Tasks');
  console.log('='.repeat(60));

  const tasksResult = await apiRequest(`/api/tasks?projectId=${TEST_PROJECT}`);
  if (tasksResult.data) {
    console.log(`✅ Found ${tasksResult.data.data.tasks.length} tasks`);
    tasksResult.data.data.tasks.forEach(task => {
      console.log(`  ✅ ${task.title} (${task.status}) - Assigned: ${task.assignedAgent || 'Unassigned'}`);
    });
  }

  // Test 5: Update Task Status
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 5: Updating Task Status');
  console.log('='.repeat(60));

  if (createdTasks.length > 0) {
    const taskToUpdate = createdTasks[0];
    const updateResult = await apiRequest(`/api/tasks/${taskToUpdate.id}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'in_progress'
      })
    });

    if (updateResult.error) {
      console.log(`❌ Failed to update task status`);
    } else {
      console.log(`✅ Updated task status to: ${updateResult.data.data.status}`);
    }
  }

  // Test 6: Create Task Blockage
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 6: Creating Task Blockage');
  console.log('='.repeat(60));

  if (createdTasks.length > 1) {
    const taskToBlock = createdTasks[1];
    const blockResult = await apiRequest(`/api/tasks/${taskToBlock.id}/block`, {
      method: 'POST',
      body: JSON.stringify({
        projectId: TEST_PROJECT,
        blockedAgent: taskToBlock.assignedAgent,
        blockingOwner: 'system',
        reason: 'Waiting for API documentation',
        severity: 'medium',
        requiresHumanIntervention: true,
        humanInterventionReason: 'Need access to external API docs'
      })
    });

    if (blockResult.error) {
      console.log(`❌ Failed to create task blockage`);
    } else {
      console.log(`✅ Created task blockage: ${blockResult.data.data.reason}`);
    }
  }

  // Test 7: Update Task Assignment
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 7: Updating Task Assignment');
  console.log('='.repeat(60));

  if (createdTasks.length > 2) {
    const taskToReassign = createdTasks[2];
    const reassignResult = await apiRequest('/api/tasks/reassign', {
      method: 'POST',
      body: JSON.stringify({
        taskIds: [taskToReassign.id],
        agent: 'senior-developer'
      })
    });

    if (reassignResult.error) {
      console.log(`❌ Failed to reassign task`);
    } else {
      console.log(`✅ Reassigned task to: senior-developer`);
    }
  }

  // Test 8: Create Thread
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 8: Creating Thread');
  console.log('='.repeat(60));

  const threadResult = await apiRequest('/api/threads', {
    method: 'POST',
    body: JSON.stringify({
      projectId: TEST_PROJECT,
      subject: 'Authentication System Implementation Discussion'
    })
  });

  let createdThreadId = null;
  if (threadResult.error) {
    console.log(`❌ Failed to create thread`);
  } else {
    console.log(`✅ Created thread: ${threadResult.data.data.subject}`);
    createdThreadId = threadResult.data.data.threadId;
  }

  // Test 9: List Threads
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 9: Listing Threads');
  console.log('='.repeat(60));

  const threadsResult = await apiRequest(`/api/threads?projectId=${TEST_PROJECT}`);
  if (threadsResult.data) {
    console.log(`✅ Found ${threadsResult.data.data.threads.length} threads`);
    threadsResult.data.data.threads.forEach(thread => {
      console.log(`  💬 ${thread.subject} (${thread.messageCount} messages)`);
    });
  }

  // Test 10: Search Messages
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 10: Searching Messages');
  console.log('='.repeat(60));

  const searchResult = await apiRequest(`/api/messages/search?projectId=${TEST_PROJECT}&limit=10`);
  if (searchResult.data) {
    console.log(`✅ Found ${searchResult.data.data.messages.length} messages`);
    searchResult.data.data.messages.forEach(msg => {
      console.log(`  💬 ${msg.senderName}: ${msg.content.substring(0, 50)}... (${msg.messageType})`);
    });
  }

  // Test 11: Get Recent Messages
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 11: Recent Messages');
  console.log('='.repeat(60));

  const recentResult = await apiRequest(`/api/messages/recent?projectId=${TEST_PROJECT}&limit=5`);
  if (recentResult.data) {
    console.log(`✅ Found ${recentResult.data.data.messages.length} recent messages`);
  }

  // Test 12: Human Review Response
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 12: Human Review Response');
  console.log('='.repeat(60));

  const humanReviewTasks = createdTasks.filter(task => task.requiresHumanReview);
  if (humanReviewTasks.length > 0) {
    const taskToReview = humanReviewTasks[0];
    const reviewResult = await apiRequest('/api/tasks/human-review', {
      method: 'POST',
      body: JSON.stringify({
        projectId: TEST_PROJECT,
        taskId: taskToReview.id,
        response: 'Approved the UX design. Please proceed with implementation.',
        approved: true
      })
    });

    if (reviewResult.error) {
      console.log(`❌ Failed to submit human review`);
    } else {
      console.log(`✅ Submitted human review response`);
    }
  }

  // Test 13: Agent Status Update
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST 13: Agent Status Update');
  console.log('='.repeat(60));

  const statusResult = await apiRequest('/api/agents/status', {
    method: 'POST',
      body: JSON.stringify({
        projectId: TEST_PROJECT,
        agentName: 'backend-agent',
        status: 'busy',
        currentTaskId: createdTasks[0]?.id,
        statusMessage: 'Working on JWT implementation',
        requiresAttention: false
      })
  });

  if (statusResult.error) {
    console.log(`❌ Failed to update agent status`);
  } else {
    console.log(`✅ Updated agent status to busy`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 ALL TESTS COMPLETED!');
  console.log('='.repeat(60));
  console.log(`📊 Test Project: ${TEST_PROJECT}`);
  console.log(`📁 Epics Created: ${createdEpics.length}`);
  console.log(`✅ Tasks Created: ${createdTasks.length}`);
  console.log(`💬 Threads Created: ${createdThreadId ? 1 : 0}`);
  console.log('='.repeat(60));
}

// Run the tests
runTests().catch(console.error);
