import { motion } from 'framer-motion'
import { Card, CardBody, Progress, Badge } from '@heroui/react'
import { Target, CheckCircle, Clock } from 'lucide-react'
import { Task } from '../lib/api'

interface EpicListProps {
  tasks: Task[]
  projectId: string
}

export function EpicList({ tasks, projectId }: EpicListProps) {
  // Group tasks by epic (using parentTaskId or epicId)
  const epics = tasks.reduce((acc, task) => {
    const epicId = task.epicId || task.parentTaskId || 'no-epic'
    if (!acc[epicId]) {
      acc[epicId] = []
    }
    acc[epicId].push(task)
    return acc
  }, {} as Record<string, Task[]>)

  const epicList = Object.entries(epics).map(([epicId, epicTasks]) => {
    const completedTasks = epicTasks.filter(task => task.status === 'done').length
    const totalTasks = epicTasks.length
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
    const blockedTasks = epicTasks.filter(task => task.status === 'blocked').length

    // Find the epic task (if it exists) or use the first task as representative
    const epicTask = epicTasks.find(task => task.id === epicId) || epicTasks[0]

    return {
      id: epicId,
      name: epicTask?.title || 'Uncategorized Tasks',
      description: epicTask?.description,
      tasks: epicTasks,
      completedTasks,
      totalTasks,
      progress,
      blockedTasks,
      createdAt: epicTask?.createdAt,
    }
  })

  const getProgressColor = (progress: number, blocked: number) => {
    if (blocked > 0) return 'danger'
    if (progress >= 80) return 'success'
    if (progress >= 60) return 'warning'
    return 'primary'
  }

  return (
    <div className="space-y-4">
      {epicList.map((epic, index) => (
        <motion.div
          key={epic.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
        >
          <Card className="bg-slate-800/50 border-slate-700">
            <CardBody className="p-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <Target className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-lg">
                        {epic.name}
                      </h3>
                      {epic.description && (
                        <p className="text-sm text-slate-400 mt-1">
                          {epic.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {epic.blockedTasks > 0 && (
                      <Badge color="danger" variant="flat">
                        {epic.blockedTasks} blocked
                      </Badge>
                    )}
                    <Badge color="primary" variant="flat">
                      {epic.completedTasks}/{epic.totalTasks} tasks
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-white font-medium">
                      {Math.round(epic.progress)}%
                    </span>
                  </div>
                  <Progress
                    value={epic.progress}
                    color={getProgressColor(epic.progress, epic.blockedTasks)}
                    size="md"
                    className="h-2"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-700">
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-white">
                        {epic.completedTasks}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">Completed</p>
                  </div>

                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-white">
                        {epic.totalTasks - epic.completedTasks}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">Remaining</p>
                  </div>

                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Target className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-white">
                        {epic.totalTasks}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">Total</p>
                  </div>
                </div>

                {/* Task breakdown */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-300">Tasks</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {epic.tasks.slice(0, 5).map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between text-sm py-1 px-2 rounded bg-slate-700/30"
                      >
                        <span className="text-slate-300 truncate flex-1">
                          {task.title}
                        </span>
                        <Badge
                          color={
                            task.status === 'done' ? 'success' :
                            task.status === 'blocked' ? 'danger' :
                            task.status === 'in_progress' ? 'warning' : 'default'
                          }
                          variant="flat"
                          size="sm"
                        >
                          {task.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    ))}
                    {epic.tasks.length > 5 && (
                      <div className="text-xs text-slate-400 text-center py-1">
                        +{epic.tasks.length - 5} more tasks
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      ))}

      {epicList.length === 0 && (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No epics found</p>
          <p className="text-slate-500 text-sm">Tasks will be organized into epics here</p>
        </div>
      )}
    </div>
  )
}
