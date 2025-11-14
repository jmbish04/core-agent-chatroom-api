import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Card,
  CardBody,
  Button,
  Progress,
  Badge,
  Avatar,
  Tooltip,
} from '@heroui/react'
import {
  FolderOpen,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
} from 'lucide-react'
import { useStore, Project } from '../lib/store'
import { tasksApi, statsApi } from '../lib/api'

// Mock data for now - in real app this would come from API
const mockProjects: Project[] = [
  {
    id: 'project-1',
    name: 'AI Agent Coordination',
    description: 'Core multi-agent communication and task orchestration',
    taskCount: 24,
    completedTasks: 18,
    blockedTasks: 2,
    activeAgents: 5,
  },
  {
    id: 'project-2',
    name: 'Cloudflare Integration',
    description: 'Workers, Durable Objects, and D1 database implementation',
    taskCount: 16,
    completedTasks: 12,
    blockedTasks: 1,
    activeAgents: 3,
  },
  {
    id: 'project-3',
    name: 'Frontend Dashboard',
    description: 'React + HeroUI control plane interface',
    taskCount: 12,
    completedTasks: 8,
    blockedTasks: 0,
    activeAgents: 2,
  },
]

export function SidebarProjects() {
  const { projects, selectedProjectId, selectProject, setProjects } = useStore()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Load projects - for now using mock data
    setProjects(mockProjects)
  }, [setProjects])

  const handleProjectSelect = (projectId: string) => {
    selectProject(selectedProjectId === projectId ? null : projectId)
  }

  const getProgressColor = (completed: number, total: number) => {
    const percentage = (completed / total) * 100
    if (percentage >= 80) return 'success'
    if (percentage >= 60) return 'warning'
    return 'primary'
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Projects</h2>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          className="text-slate-400 hover:text-white"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-3">
        {projects.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Card
              className={`cursor-pointer transition-all duration-200 ${
                selectedProjectId === project.id
                  ? 'bg-purple-500/20 border-purple-400/50'
                  : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70'
              }`}
              onPress={() => handleProjectSelect(project.id)}
            >
              <CardBody className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <FolderOpen className="w-4 h-4 text-slate-400" />
                      <h3 className="font-medium text-white text-sm">
                        {project.name}
                      </h3>
                    </div>
                    <div className="flex space-x-1">
                      {project.blockedTasks > 0 && (
                        <Tooltip content={`${project.blockedTasks} blocked tasks`}>
                          <Badge color="danger" variant="flat" size="sm">
                            <AlertTriangle className="w-3 h-3" />
                          </Badge>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {project.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Progress</span>
                      <span className="text-white">
                        {project.completedTasks}/{project.taskCount}
                      </span>
                    </div>
                    <Progress
                      value={(project.completedTasks / project.taskCount) * 100}
                      color={getProgressColor(project.completedTasks, project.taskCount)}
                      size="sm"
                      className="h-1"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-400">
                        {project.activeAgents} agents
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3 text-green-400" />
                      <span className="text-green-400">
                        {project.completedTasks}
                      </span>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        ))}
      </div>

      {projects.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-8"
        >
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No projects yet</p>
          <p className="text-slate-500 text-xs">Create your first project to get started</p>
        </motion.div>
      )}
    </div>
  )
}
