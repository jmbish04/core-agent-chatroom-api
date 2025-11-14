# Vibe Systems Control Plane Frontend

A modern React + Vite frontend for the Vibe Systems Control Plane, built with HeroUI and deployed to Cloudflare Pages.

## Features

- 🎨 **Modern UI**: Built with HeroUI components and Tailwind CSS
- ⚡ **Real-time**: WebSocket integration for live agent coordination
- 📊 **Analytics**: Interactive charts and task progress tracking
- 🤖 **Agent Management**: Presence tracking and status updates
- 📚 **Docs Integration**: Real-time Cloudflare documentation insights via MCP
- 🎉 **Celebrations**: Animated confetti for task completions
- 🔧 **Developer Tools**: WebSocket console and command center

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **UI Library**: HeroUI (NextUI) + Tailwind CSS
- **State Management**: Zustand
- **Animations**: Framer Motion
- **Charts**: Recharts
- **HTTP Client**: Axios
- **Data Fetching**: React Query
- **Deployment**: Cloudflare Pages

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Deploy to Cloudflare Pages
npm run deploy
```

### Development

The development server will start on `http://localhost:5173` and proxy API requests to the backend worker.

### Environment Variables

Create a `.env.local` file:

```env
VITE_API_BASE_URL=http://localhost:8787
```

In production, this should point to your deployed Cloudflare Worker.

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # Reusable UI components
│   │   ├── LoginModal.tsx
│   │   ├── Dashboard.tsx
│   │   ├── SidebarProjects.tsx
│   │   ├── ProjectDashboard.tsx
│   │   ├── TaskList.tsx
│   │   ├── EpicList.tsx
│   │   ├── BurndownChart.tsx
│   │   ├── AgentStats.tsx
│   │   ├── Chatroom.tsx
│   │   ├── CommandModal.tsx
│   │   ├── WebSocketConsole.tsx
│   │   ├── Celebration.tsx
│   │   └── DocsInsightPanel.tsx
│   ├── lib/                # Utilities and configuration
│   │   ├── api.ts         # API client and WebSocket
│   │   ├── store.ts       # Zustand store
│   │   └── utils.ts       # Helper functions
│   ├── hooks/             # Custom React hooks
│   ├── pages/             # Page components (if needed)
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Additional utilities
├── public/                # Static assets
├── dist/                  # Build output
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
└── wrangler.toml          # Cloudflare Pages config
```

## Backend Integration

This frontend connects to the Vibe Systems Control Plane API (Cloudflare Worker backend). Make sure the backend is running and accessible.

### API Endpoints Used

- `GET /api/tasks` - Fetch all tasks
- `POST /api/tasks` - Create new tasks
- `POST /api/tasks/{id}/status` - Update task status
- `GET /api/tasks/stats` - Get task statistics
- `POST /api/agents/check-in` - Agent presence updates
- `WebSocket /ws` - Real-time communication

## Deployment

### Cloudflare Pages

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to Cloudflare Pages**:
   ```bash
   npm run deploy
   ```

3. **Environment Variables**: Set `VITE_API_BASE_URL` in your Pages project settings to point to your deployed Worker.

### Manual Deployment

You can also deploy the `dist` folder to any static hosting service.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview

# Deploy to Cloudflare Pages
npm run deploy

# Deploy to preview environment
npm run deploy:preview
```

## Browser Support

- Chrome/Edge 88+
- Firefox 87+
- Safari 14+

## Contributing

1. Follow the existing code style
2. Use TypeScript for all new code
3. Add proper error handling
4. Test WebSocket functionality
5. Update this README for any new features

## License

MIT
