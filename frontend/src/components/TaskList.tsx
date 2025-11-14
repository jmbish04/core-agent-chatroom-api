import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Card,
  CardBody,
  Button,
  Badge,
  Avatar,
  Select,
  SelectItem,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Tooltip,
} from '@heroui/react'
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  User,
  MoreVertical,
  Play,
  Pause,
  Flag,
} from 'lucide-react'
import { Task } from '../lib/api'
import { useStore } from '../lib/store'

interface TaskListProps {
  tasks: Task[]
  projectId: string
}

const STATUS_CONFIG = {
  pending: { color: 'default' as const, icon: Clock, label: 'Pending' },
  backlog: { color: 'secondary' as const, icon: Clock, label: 'Backlog' },
  todo: { color: 'primary' as const, icon: Flag, label: 'To Do' },
  in_progress: { color: 'warning' as const, icon: Play, label: 'In Progress' },
  review: { color: 'secondary' as const, icon: Clock, label: 'Review' },
  blocked: { color: 'danger' as const, icon: AlertTriangle, label: 'Blocked' },
  done: { color: 'success' as const, icon: CheckCircle, label: 'Done' },
  cancelled: { color: 'default' as const, icon: Clock, label: 'Cancelled' },
  on_hold: { color: 'default' as const, icon: Pause, label: 'On Hold' },
}

const PRIORITY_CONFIG = {
  low: { color: 'success' as const, label: 'Low' },
  medium: { color: 'warning' as const, label: 'Medium' },
  high: { color: 'danger' as const, label: 'High' },
  critical: { color: 'danger' as const, label: 'Critical' },
}

export function TaskList({ tasks, projectId }: TaskListProps) {
  const { agent } = useStore()
  const [filter, setFilter] = useState<'all' | 'my' | 'blocked'>('all')

  const filteredTasks = tasks.filter(task => {
    if (filter === 'my') return task.assignedAgent === agent?.name
    if (filter === 'blocked') return task.status === 'blocked'
    return true
  })

  const getStatusIcon = (status: Task['status']) => {
    const config = STATUS_CONFIG[status]
    const Icon = config.icon
    return <Icon className="w-4 h-4" />
  }

  const handleStatusChange = async (taskId: string, newStatus: Task['status']) => {
    try {
      // In a real app, this would call the API
      console.log(`Updating task ${taskId} to status ${newStatus}`)
    } catch (error) {
      console.error('Failed to update task status:', error)
    }
  }

  const handleAssignToMe = async (taskId: string) => {
    if (!agent) return
    try {
      // In a real app, this would call the API
      console.log(`Assigning task ${taskId} to ${agent.name}`)
    } catch (error) {
      console.error('Failed to assign task:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant={filter === 'all' ? 'solid' : 'light'}
            onPress={() => setFilter('all')}
            className={filter === 'all' ? 'bg-purple-500 text-white' : ''}
          >
            All Tasks ({tasks.length})
          </Button>
          <Button
            size="sm"
            variant={filter === 'my' ? 'solid' : 'light'}
            onPress={() => setFilter('my')}
            className={filter === 'my' ? 'bg-purple-500 text-white' : ''}
          >
            My Tasks ({tasks.filter(t => t.assignedAgent === agent?.name).length})
          </Button>
          <Button
            size="sm"
            variant={filter === 'blocked' ? 'solid' : 'light'}
            onPress={() => setFilter('blocked')}
            className={filter === 'blocked' ? 'bg-purple-500 text-white' : ''}
          >
            Blocked ({tasks.filter(t => t.status === 'blocked').length})
          </Button>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No tasks found</p>
            <p className="text-slate-500 text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          filteredTasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-colors">
                <CardBody className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center space-x-3">
                        <h3 className="font-medium text-white">{task.title}</h3>
                        <Badge
                          color={PRIORITY_CONFIG[task.priority].color}
                          variant="flat"
                          size="sm"
                        >
                          {PRIORITY_CONFIG[task.priority].label}
                        </Badge>
                        <div className="flex items-center space-x-1">
                          {getStatusIcon(task.status)}
                          <Badge
                            color={STATUS_CONFIG[task.status].color}
                            variant="flat"
                            size="sm"
                          >
                            {STATUS_CONFIG[task.status].label}
                          </Badge>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-sm text-slate-400 line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center space-x-4 text-xs text-slate-500">
                        {task.assignedAgent && (
                          <div className="flex items-center space-x-1">
                            <User className="w-3 h-3" />
                            <span>{task.assignedAgent}</span>
                          </div>
                        )}
                        <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
                        {task.estimatedHours && (
                          <span>{task.estimatedHours}h estimated</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Select
                        size="sm"
                        selectedKeys={[task.status]}
                        onSelectionChange={(keys) => {
                          const newStatus = Array.from(keys)[0] as Task['status']
                          handleStatusChange(task.id, newStatus)
                        }}
                        classNames={{
                          trigger: "bg-slate-700/50 border-slate-600 min-w-32",
                          listbox: "bg-slate-700 border-slate-600",
                        }}
                      >
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                          <SelectItem key={key}>
                            <div className="flex items-center space-x-2">
                              <config.icon className="w-4 h-4" />
                              <span>{config.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </Select>

                      <Dropdown>
                        <DropdownTrigger>
                          <Button isIconOnly size="sm" variant="light">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                          className="bg-slate-700 border-slate-600"
                          aria-label="Task actions"
                        >
                          {task.assignedAgent ? null : (
                            <DropdownItem
                              key="assign"
                              onPress={() => handleAssignToMe(task.id)}
                            >
                              Assign to me
                            </DropdownItem>
                          )}
                          <DropdownItem key="edit">
                            Edit task
                          </DropdownItem>
                          <DropdownItem key="duplicate">
                            Duplicate
                          </DropdownItem>
                          <DropdownItem
                            key="delete"
                            className="text-red-400"
                          >
                            Delete
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
