#!/bin/bash

# Start dev server in background
npm run dev > /dev/null 2>&1 &

# Wait for server to start
sleep 10

# Run tests with timeout and save results to file
timeout 300 node tests/project-management.test.js 2>&1 | tee tests/results.txt

# Clean up - kill wrangler process
pkill -f 'wrangler.*6528' || true

exit 0
