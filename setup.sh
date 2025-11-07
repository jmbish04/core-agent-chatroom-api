#!/bin/bash

# Core Agent Chatroom API Setup Script
# This script automates the initial setup process

set -e

echo "🚀 Core Agent Chatroom API - Setup Script"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "⚠️  Wrangler CLI not found. Installing globally..."
    npm install -g wrangler
fi

echo "✅ Wrangler version: $(wrangler --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Check if user is logged in to Cloudflare
echo "🔐 Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "⚠️  Not logged in to Cloudflare. Please run: wrangler login"
    echo "   Then run this setup script again."
    exit 1
fi

echo "✅ Logged in to Cloudflare"
echo ""

# Create D1 database
echo "💾 Creating D1 database..."
echo "   Running: wrangler d1 create chatroom-db"
echo ""

DB_OUTPUT=$(wrangler d1 create chatroom-db 2>&1)
echo "$DB_OUTPUT"

# Extract database ID from output
DB_ID=$(echo "$DB_OUTPUT" | grep 'database_id' | sed -E 's/.*database_id = "([^"]+)".*/\1/')

if [ -z "$DB_ID" ]; then
    echo ""
    echo "⚠️  Could not extract database ID automatically."
    echo "   This might mean the database already exists."
    echo "   Please check the output above and manually update wrangler.toml if needed."
    echo ""
    read -p "Press Enter to continue or Ctrl+C to abort..."
else
    echo ""
    echo "✅ Database created with ID: $DB_ID"
    echo "   Updating wrangler.toml..."

    # Update wrangler.toml with the database ID
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/database_id = \"YOUR_DATABASE_ID\"/database_id = \"$DB_ID\"/" wrangler.toml
    else
        # Linux
        sed -i "s/database_id = \"YOUR_DATABASE_ID\"/database_id = \"$DB_ID\"/" wrangler.toml
    fi

    echo "✅ wrangler.toml updated"
fi

echo ""

# Run migrations
echo "🔄 Running database migrations..."
echo "   Note: This will run migrations on the remote database"
echo ""

if npm run migrate; then
    echo "✅ Migrations completed successfully"
else
    echo "⚠️  Migration failed. You may need to run: npm run migrate"
fi

echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
if npx tsc; then
    echo "✅ TypeScript build successful"
else
    echo "❌ TypeScript build failed"
    exit 1
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Test locally:  npm run dev"
echo "   2. Deploy:        npm run deploy"
echo ""
echo "🌐 After deployment, visit your worker URL to see the web interface."
echo ""
echo "📖 For more information, see README.md"
echo ""
