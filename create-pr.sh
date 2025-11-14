#!/bin/bash

# GitHub PR Creation Script
# This script creates a new branch, commits changes, and opens a PR using GitHub CLI

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Create a new branch, commit changes, and open a PR using GitHub CLI"
    echo ""
    echo "OPTIONS:"
    echo "  -b, --branch BRANCH     Branch name (required)"
    echo "  -t, --title TITLE       PR title (required)"
    echo "  -d, --description DESC  PR description (optional)"
    echo "  -l, --label LABEL       PR labels (comma-separated, optional)"
    echo "  -a, --assignee USER     PR assignee (optional)"
    echo "  -r, --reviewer USER     PR reviewer (optional)"
    echo "  -m, --message MSG       Commit message (optional, defaults to PR title)"
    echo "  -f, --force             Force push branch if it exists"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "  $0 -b feature/new-api -t \"Add new API endpoint\" -d \"This PR adds a new API endpoint for user management\""
    echo "  $0 --branch fix/bug-123 --title \"Fix authentication bug\" --label \"bug,urgent\" --reviewer john-doe"
    echo ""
    echo "REQUIREMENTS:"
    echo "  - GitHub CLI (gh) must be installed and authenticated"
    echo "  - Current directory must be a git repository"
    echo "  - Repository must have a remote named 'origin'"
}

# Parse command line arguments
BRANCH_NAME=""
PR_TITLE=""
PR_DESCRIPTION=""
PR_LABELS=""
PR_ASSIGNEE=""
PR_REVIEWER=""
COMMIT_MESSAGE=""
FORCE_PUSH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--branch)
            BRANCH_NAME="$2"
            shift 2
            ;;
        -t|--title)
            PR_TITLE="$2"
            shift 2
            ;;
        -d|--description)
            PR_DESCRIPTION="$2"
            shift 2
            ;;
        -l|--label)
            PR_LABELS="$2"
            shift 2
            ;;
        -a|--assignee)
            PR_ASSIGNEE="$2"
            shift 2
            ;;
        -r|--reviewer)
            PR_REVIEWER="$2"
            shift 2
            ;;
        -m|--message)
            COMMIT_MESSAGE="$2"
            shift 2
            ;;
        -f|--force)
            FORCE_PUSH=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$BRANCH_NAME" ]]; then
    print_error "Branch name is required"
    show_usage
    exit 1
fi

if [[ -z "$PR_TITLE" ]]; then
    print_error "PR title is required"
    show_usage
    exit 1
fi

# Set default commit message if not provided
if [[ -z "$COMMIT_MESSAGE" ]]; then
    COMMIT_MESSAGE="$PR_TITLE"
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed. Please install it first:"
    echo "  https://cli.github.com/"
    exit 1
fi

# Check if gh is authenticated
if ! gh auth status > /dev/null 2>&1; then
    print_error "GitHub CLI is not authenticated. Please run: gh auth login"
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
print_info "Current branch: $CURRENT_BRANCH"

# Check if branch already exists
if git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
    if [[ "$FORCE_PUSH" == true ]]; then
        print_warning "Branch '$BRANCH_NAME' already exists. Force recreating..."
        git branch -D "$BRANCH_NAME"
    else
        print_error "Branch '$BRANCH_NAME' already exists. Use --force to recreate it."
        exit 1
    fi
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    print_info "Found uncommitted changes"
else
    print_warning "No uncommitted changes found. Nothing to commit."
    # Still proceed with branch creation and PR if requested
fi

# Create and switch to new branch
print_info "Creating new branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

# Add all changes
if [[ -n $(git status --porcelain) ]]; then
    print_info "Adding all changes to git"
    git add .
fi

# Commit changes
if [[ -n $(git status --porcelain) ]]; then
    print_info "Committing changes with message: '$COMMIT_MESSAGE'"
    git commit -m "$COMMIT_MESSAGE"
else
    print_warning "No changes to commit"
fi

# Push the branch
print_info "Pushing branch to remote"
if [[ "$FORCE_PUSH" == true ]]; then
    git push -u origin "$BRANCH_NAME" --force-with-lease
else
    git push -u origin "$BRANCH_NAME"
fi

# Build PR command
PR_COMMAND="gh pr create --title \"$PR_TITLE\" --body \"$PR_DESCRIPTION\""

# Add labels if provided
if [[ -n "$PR_LABELS" ]]; then
    PR_COMMAND="$PR_COMMAND --label \"$PR_LABELS\""
fi

# Add assignee if provided
if [[ -n "$PR_ASSIGNEE" ]]; then
    PR_COMMAND="$PR_COMMAND --assignee \"$PR_ASSIGNEE\""
fi

# Add reviewer if provided
if [[ -n "$PR_REVIEWER" ]]; then
    PR_COMMAND="$PR_COMMAND --reviewer \"$PR_REVIEWER\""
fi

# Create the PR
print_info "Creating pull request..."
print_info "Command: $PR_COMMAND"

if eval "$PR_COMMAND"; then
    print_success "Pull request created successfully!"

    # Get the PR URL
    PR_URL=$(gh pr view --json url -q .url)
    if [[ -n "$PR_URL" ]]; then
        print_success "PR URL: $PR_URL"
    fi

    # Switch back to original branch
    print_info "Switching back to original branch: $CURRENT_BRANCH"
    git checkout "$CURRENT_BRANCH"
else
    print_error "Failed to create pull request"
    exit 1
fi

print_success "All operations completed successfully! 🎉"
