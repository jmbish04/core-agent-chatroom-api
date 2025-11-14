import { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Button,
  Avatar,
  Badge,
  Card,
  CardBody,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from '@heroui/react'
import {
  Settings,
  Terminal,
  MessageSquare,
  BarChart3,
  Users,
  LogOut,
  Zap,
  BookOpen,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { SidebarProjects } from './SidebarProjects'
import { ProjectDashboard } from './ProjectDashboard'
import { Chatroom } from './Chatroom'
import { CommandModal } from './CommandModal'
import { WebSocketConsole } from './WebSocketConsole'
import { Celebration } from './Celebration'
import { AgentSetup } from './AgentSetup'

interface DashboardProps {
  onLogout: () => void
}

export function Dashboard({ onLogout }: DashboardProps) {
  const {
    agent,
    selectedProjectId,
    showCommandModal,
    showWebSocketConsole,
    showAgentSetup,
    toggleCommandModal,
    toggleWebSocketConsole,
    toggleAgentSetup,
  } = useStore()

  if (!agent) return null

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top Navigation */}
      <Navbar
        className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800"
        maxWidth="full"
      >
        <NavbarBrand>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Vibe Systems</h1>
              <p className="text-xs text-slate-400">Control Plane</p>
            </div>
          </div>
        </NavbarBrand>

        <NavbarContent justify="center">
          <NavbarItem>
            <div className="flex items-center space-x-2">
              <Avatar
                src={`data:image/svg+xml,${encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50%" font-size="50" text-anchor="middle" dy="0.35em">${agent.avatar}</text></svg>`
                )}`}
                size="sm"
                className="bg-slate-700"
              />
              <div>
                <p className="text-sm font-medium">{agent.name}</p>
                <Badge
                  color={
                    agent.status === 'available' ? 'success' :
                    agent.status === 'busy' ? 'warning' : 'default'
                  }
                  variant="flat"
                  size="sm"
                >
                  {agent.status}
                </Badge>
              </div>
            </div>
          </NavbarItem>
        </NavbarContent>

        <NavbarContent justify="end">
          <NavbarItem>
            <Button
              isIconOnly
              variant="light"
              onPress={toggleAgentSetup}
              className="text-slate-400 hover:text-white"
              title="Agent Setup Guide"
            >
              <BookOpen className="w-5 h-5" />
            </Button>
          </NavbarItem>
          <NavbarItem>
            <Button
              isIconOnly
              variant="light"
              onPress={toggleCommandModal}
              className="text-slate-400 hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </NavbarItem>
          <NavbarItem>
            <Button
              isIconOnly
              variant="light"
              onPress={toggleWebSocketConsole}
              className="text-slate-400 hover:text-white"
            >
              <Terminal className="w-5 h-5" />
            </Button>
          </NavbarItem>
          <NavbarItem>
            <Button
              isIconOnly
              variant="light"
              onPress={onLogout}
              className="text-slate-400 hover:text-red-400"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </NavbarItem>
        </NavbarContent>
      </Navbar>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <motion.div
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-80 bg-slate-900/50 border-r border-slate-800 overflow-y-auto"
        >
          <SidebarProjects />
        </motion.div>

        {/* Main Content Area */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex-1 flex"
        >
          {selectedProjectId ? (
            <div className="flex flex-1">
              {/* Project Dashboard */}
              <div className="flex-1 overflow-y-auto">
                <ProjectDashboard />
              </div>

              {/* Chatroom Sidebar */}
              <motion.div
                initial={{ x: 300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="w-96 bg-slate-900/30 border-l border-slate-800 overflow-y-auto"
              >
                <Chatroom />
              </motion.div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <BarChart3 className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Welcome to the Control Plane
                </h2>
                <p className="text-slate-400 mb-6">
                  Select a project from the sidebar to begin coordinating tasks
                </p>
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardBody className="text-center p-4">
                      <Users className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-300">Agent Coordination</p>
                    </CardBody>
                  </Card>
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardBody className="text-center p-4">
                      <MessageSquare className="w-8 h-8 text-pink-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-300">Real-time Chat</p>
                    </CardBody>
                  </Card>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Agent Setup Page */}
      {showAgentSetup && (
        <AgentSetup onClose={toggleAgentSetup} />
      )}

      {/* Modals */}
      <CommandModal isOpen={showCommandModal} onClose={toggleCommandModal} />
      <WebSocketConsole isOpen={showWebSocketConsole} onClose={toggleWebSocketConsole} />

      {/* Celebration Component */}
      <Celebration />
    </div>
  )
}
