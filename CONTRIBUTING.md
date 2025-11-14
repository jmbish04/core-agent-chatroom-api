# Contributing to Core Agent Chatroom API

## 🚀 Quick PR Creation

We provide an automated script to create branches, commit changes, and open pull requests using GitHub CLI.

### Prerequisites

1. **Install GitHub CLI**:
   ```bash
   # macOS
   brew install gh

   # Ubuntu/Debian
   curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
   sudo apt update
   sudo apt install gh
   ```

2. **Authenticate GitHub CLI**:
   ```bash
   gh auth login
   ```

### Using the PR Creation Script

The `create-pr.sh` script automates the entire PR workflow:

```bash
# Basic usage - creates branch, commits all changes, opens PR
./create-pr.sh -b feature/new-feature -t "Add awesome new feature"

# Full example with all options
./create-pr.sh \
  --branch feature/user-auth \
  --title "Implement user authentication system" \
  --description "This PR adds JWT-based authentication with role-based access control" \
  --label "enhancement,security" \
  --assignee "your-username" \
  --reviewer "code-reviewer" \
  --message "feat: implement JWT authentication"
```

### Script Options

| Option | Short | Description | Required |
|--------|-------|-------------|----------|
| `--branch` | `-b` | Branch name to create | ✅ |
| `--title` | `-t` | Pull request title | ✅ |
| `--description` | `-d` | Pull request description | ❌ |
| `--label` | `-l` | Comma-separated labels (e.g., "bug,urgent") | ❌ |
| `--assignee` | `-a` | GitHub username to assign PR to | ❌ |
| `--reviewer` | `-r` | GitHub username for code review | ❌ |
| `--message` | `-m` | Custom commit message (defaults to PR title) | ❌ |
| `--force` | `-f` | Force push if branch exists | ❌ |

### Examples

#### Feature Development
```bash
./create-pr.sh \
  -b feature/agent-setup-guide \
  -t "Add AI Agent Setup Guide to Frontend" \
  -d "Creates a comprehensive guide page for AI agents to integrate with the chatroom system" \
  -l "enhancement,frontend,documentation"
```

#### Bug Fix
```bash
./create-pr.sh \
  -b fix/api-endpoint-error \
  -t "Fix API endpoint returning 500 error" \
  -d "Resolves issue where /api/tasks endpoint fails with validation error" \
  -l "bug,api" \
  -r "backend-reviewer"
```

#### Urgent Hotfix
```bash
./create-pr.sh \
  -b hotfix/security-patch \
  -t "Security: Fix authentication bypass vulnerability" \
  -d "Critical security fix for JWT token validation" \
  -l "security,urgent" \
  -a "security-team-lead"
```

### What the Script Does

1. **Validates** all prerequisites (git repo, gh CLI, authentication)
2. **Creates** a new branch from your current branch
3. **Adds** all uncommitted changes to git
4. **Commits** changes with your specified message
5. **Pushes** the branch to GitHub
6. **Creates** a pull request with all specified metadata
7. **Returns** you to the original branch

### Troubleshooting

#### "gh: command not found"
```bash
# Install GitHub CLI
brew install gh  # macOS
# or follow installation instructions at https://cli.github.com/
```

#### "You are not logged in"
```bash
gh auth login
# Follow the interactive prompts to authenticate
```

#### "Branch already exists"
```bash
# Use --force to recreate the branch
./create-pr.sh -b existing-branch -t "Title" --force
```

#### No changes to commit
The script will still create the branch and PR, but warn about no changes.

### Workflow Recommendations

1. **Work on features in branches** named `feature/description`
2. **Use bug fix branches** named `fix/issue-description`
3. **Hotfixes** use `hotfix/critical-issue`
4. **Always include descriptions** for context
5. **Use appropriate labels** for categorization
6. **Request reviews** from relevant team members

### Development Workflow

```bash
# 1. Make your changes
git status  # See what you've changed

# 2. Create PR (this handles everything)
./create-pr.sh -b feature/my-awesome-feature -t "Add awesome feature"

# 3. The script will:
#    - Create branch 'feature/my-awesome-feature'
#    - Commit your changes
#    - Push to GitHub
#    - Open a PR
#    - Return you to original branch
```

Happy contributing! 🎉
