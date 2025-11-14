import { motion } from 'framer-motion'
import {
  Card,
  CardBody,
  CardHeader,
  Select,
  SelectItem,
} from '@heroui/react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import { Task } from '../lib/api'
import { useState } from 'react'

interface BurndownChartProps {
  tasks: Task[]
}

export function BurndownChart({ tasks }: BurndownChartProps) {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('week')

  // Generate mock burndown data based on tasks
  const generateBurndownData = () => {
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(task => task.status === 'done').length
    const remainingTasks = totalTasks - completedTasks

    // Mock data points for the last 30 days
    const data = []
    let remaining = totalTasks

    for (let i = 29; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)

      // Simulate gradual completion
      if (i < 15) {
        remaining = Math.max(0, remaining - Math.random() * 0.5)
      }

      data.push({
        date: date.toISOString().split('T')[0],
        ideal: totalTasks - (totalTasks / 30) * (29 - i),
        actual: Math.max(0, remaining),
        completed: totalTasks - remaining,
      })
    }

    return data
  }

  const chartData = generateBurndownData()

  // Calculate metrics
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(task => task.status === 'done').length
  const inProgressTasks = tasks.filter(task => task.status === 'in_progress').length
  const blockedTasks = tasks.filter(task => task.status === 'blocked').length
  const velocity = completedTasks / Math.max(1, (Date.now() - new Date(tasks[0]?.createdAt || Date.now()).getTime()) / (1000 * 60 * 60 * 24))

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-slate-800/50 border-slate-700">
            <CardBody className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">
                  {completedTasks}
                </div>
                <div className="text-sm text-slate-400">Completed</div>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-slate-800/50 border-slate-700">
            <CardBody className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400 mb-1">
                  {inProgressTasks}
                </div>
                <div className="text-sm text-slate-400">In Progress</div>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-slate-800/50 border-slate-700">
            <CardBody className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400 mb-1">
                  {blockedTasks}
                </div>
                <div className="text-sm text-slate-400">Blocked</div>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-slate-800/50 border-slate-700">
            <CardBody className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400 mb-1">
                  {velocity.toFixed(1)}
                </div>
                <div className="text-sm text-slate-400">Tasks/Day</div>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      </div>

      {/* Burndown Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-white">Burndown Chart</h3>
              <p className="text-sm text-slate-400">Task completion over time</p>
            </div>
            <Select
              size="sm"
              selectedKeys={[timeRange]}
              onSelectionChange={(keys) => setTimeRange(Array.from(keys)[0] as typeof timeRange)}
              classNames={{
                trigger: "bg-slate-700/50 border-slate-600",
                listbox: "bg-slate-700 border-slate-600",
              }}
            >
              <SelectItem key="week">Last Week</SelectItem>
              <SelectItem key="month">Last Month</SelectItem>
              <SelectItem key="quarter">Last Quarter</SelectItem>
            </Select>
          </CardHeader>
          <CardBody>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="idealGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#9ca3af"
                    fontSize={12}
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#f9fafb',
                    }}
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <Area
                    type="monotone"
                    dataKey="ideal"
                    stroke="#8b5cf6"
                    fillOpacity={1}
                    fill="url(#idealGradient)"
                    strokeWidth={2}
                    name="Ideal Burndown"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    name="Actual Progress"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* Task Status Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Task Status Breakdown</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { status: 'todo', count: tasks.filter(t => t.status === 'todo').length, color: 'blue' },
                { status: 'in_progress', count: tasks.filter(t => t.status === 'in_progress').length, color: 'yellow' },
                { status: 'review', count: tasks.filter(t => t.status === 'review').length, color: 'purple' },
                { status: 'blocked', count: tasks.filter(t => t.status === 'blocked').length, color: 'red' },
                { status: 'done', count: tasks.filter(t => t.status === 'done').length, color: 'green' },
              ].map((item) => (
                <div key={item.status} className="text-center">
                  <div className={`text-2xl font-bold text-${item.color}-400 mb-1`}>
                    {item.count}
                  </div>
                  <div className="text-sm text-slate-400 capitalize">
                    {item.status.replace('_', ' ')}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </motion.div>
    </div>
  )
}
