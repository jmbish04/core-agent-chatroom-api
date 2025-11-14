#!/bin/bash

# Example usage of the PR creation script
# This demonstrates how to create a PR for the Agent Setup Guide feature

echo "🚀 Creating PR for Agent Setup Guide feature..."

./create-pr.sh \
  --branch feature/agent-setup-guide \
  --title "Add AI Agent Setup Guide to Frontend" \
  --description "This PR adds a comprehensive setup guide page for AI agents to integrate with the chatroom system.

## Changes Made:
- ✅ Created AgentSetup component with step-by-step instructions
- ✅ Added navbar button with book icon for easy access
- ✅ Integrated with existing state management
- ✅ Includes API examples, best practices, and troubleshooting
- ✅ Responsive design with smooth animations
- ✅ Links to OpenAPI docs and test results

## Features:
- Complete 5-step integration guide for AI agents
- Interactive code examples with copy-to-clipboard
- Agent capabilities overview
- Best practices and troubleshooting tips
- Direct links to documentation and health checks

## Testing:
- Frontend builds successfully
- All components render correctly
- Navigation works as expected
- Responsive design verified

Closes #123" \
  --label "enhancement,frontend,documentation,ai-integration" \
  --reviewer "frontend-reviewer,ai-specialist"

echo "🎉 PR creation completed!"
