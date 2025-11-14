import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs'
import { TaskList } from './TaskList'
import { EpicList } from './EpicList'
import { BurndownChart } from './BurndownChart'
import { AgentStats } from './AgentStats'
import { useStore } from '../lib/store'
import { tasksApi, statsApi, Task, TaskStatsResponse } from '../lib/api'

export function ProjectDashboard() {
  const { selectedProjectId, tasks, setTasks } = useStore()
  const [stats, setStats] = useState<TaskStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!selectedProjectId) return

    const loadProjectData = async () => {
      setIsLoading(true)
      try {
        // Load tasks for the project
        const tasksResponse = await tasksApi.getAll()
        const projectTasks = tasksResponse.data.tasks.filter(
          task => task.projectId === selectedProjectId
        )
        setTasks(projectTasks)

        // Load stats
        const statsResponse = await statsApi.getStats()
        setStats(statsResponse.data)
      } catch (error) {
        console.error('Failed to load project data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadProjectData()
  }, [selectedProjectId, setTasks])

  if (!selectedProjectId) return null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-6 h-full overflow-y-auto"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Project Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700">
          <h1 className="text-2xl font-bold text-white mb-2">
            Project Dashboard
          </h1>
          <p className="text-slate-400">
            Monitor progress, manage tasks, and coordinate with your team
          </p>
        </div>

        {/* Stats Overview */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <AgentStats stats={stats} />
          </motion.div>
        )}

        {/* Main Content Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Tabs defaultValue="tasks" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-slate-800/50 border border-slate-700">
              <TabsTrigger
                value="tasks"
                className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
              >
                Tasks
              </TabsTrigger>
              <TabsTrigger
                value="epics"
                className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
              >
                Epics
              </TabsTrigger>
              <TabsTrigger
                value="analytics"
                className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
              >
                Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="mt-6">
              <TaskList tasks={tasks} projectId={selectedProjectId} />
            </TabsContent>

            <TabsContent value="epics" className="mt-6">
              <EpicList tasks={tasks} projectId={selectedProjectId} />
            </TabsContent>

            <TabsContent value="analytics" className="mt-6">
              <BurndownChart tasks={tasks} />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </motion.div>
  )
}
