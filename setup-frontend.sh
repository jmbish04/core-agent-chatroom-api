#!/bin/bash

# Vibe Systems Control Plane Frontend Setup Script

echo "🚀 Setting up Vibe Systems Control Plane Frontend"
echo "================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Please run this script from the root directory of the project"
    exit 1
fi

echo "📦 Installing backend dependencies..."
npm install

echo "📦 Installing frontend dependencies..."
npm run frontend:install

echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "  1. Start both backend and frontend: npm run dev:full"
echo "     (or use: npm start)"
echo "  2. Open http://localhost:5173 in your browser"
echo ""
echo "💡 Alternative commands:"
echo "  - Backend only: npm run dev"
echo "  - Frontend only: npm run frontend:dev"
echo ""
echo "📚 For deployment:"
echo "  - Backend: npm run deploy"
echo "  - Frontend: npm run frontend:deploy"
echo ""
echo "📖 Read the README files for more information:"
echo "  - Main: README.md"
echo "  - Frontend: frontend/README.md"
