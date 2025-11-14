import { motion } from 'framer-motion'
import {
  Card,
  CardBody,
  Badge,
  Avatar,
  Progress,
} from '@heroui/react'
import {
  Users,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react'
import { TaskStatsResponse } from '../lib/api'

interface AgentStatsProps {
  stats: TaskStatsResponse
}

export function AgentStats({ stats }: AgentStatsProps) {
  const { counts, agentActivity, blocked } = stats

  const activeAgents = agentActivity.filter(agent => agent.status !== 'offline')
  const busyAgents = agentActivity.filter(agent => agent.status === 'busy' || agent.status === 'in_progress')
  const blockedAgents = agentActivity.filter(agent => agent.status === 'blocked')

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'success'
      case 'busy':
      case 'in_progress': return 'warning'
      case 'blocked': return 'danger'
      case 'error': return 'danger'
      default: return 'default'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available': return <CheckCircle className="w-4 h-4" />
      case 'busy':
      case 'in_progress': return <Activity className="w-4 h-4" />
      case 'blocked': return <AlertTriangle className="w-4 h-4" />
      case 'error': return <AlertTriangle className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Overall Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="lg:col-span-2"
      >
        <Card className="bg-slate-800/50 border-slate-700">
          <CardBody className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-purple-400" />
              Project Overview
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {counts.total}
                </div>
                <div className="text-sm text-slate-400">Total Tasks</div>
              </div>

              <div className="text-center">
                <div className="text-3xl font-bold text-green-400 mb-2">
                  {counts.done}
                </div>
                <div className="text-sm text-slate-400">Completed</div>
              </div>

              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-400 mb-2">
                  {counts.in_progress}
                </div>
                <div className="text-sm text-slate-400">In Progress</div>
              </div>

              <div className="text-center">
                <div className="text-3xl font-bold text-red-400 mb-2">
                  {counts.blocked}
                </div>
                <div className="text-sm text-slate-400">Blocked</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-400">Overall Progress</span>
                <span className="text-white font-medium">
                  {Math.round((counts.done / Math.max(1, counts.total)) * 100)}%
                </span>
              </div>
              <Progress
                value={(counts.done / Math.max(1, counts.total)) * 100}
                color="success"
                size="md"
                className="h-3"
              />
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* Active Agents */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="bg-slate-800/50 border-slate-700">
          <CardBody className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-400" />
              Active Agents ({activeAgents.length})
            </h3>

            <div className="space-y-3">
              {activeAgents.slice(0, 5).map((agent, index) => (
                <motion.div
                  key={agent.agentName}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <Avatar
                      src={`data:image/svg+xml,${encodeURIComponent(
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50%" font-size="50" text-anchor="middle" dy="0.35em">${agent.agentName.charAt(0).toUpperCase()}</text></svg>`
                      )}`}
                      size="sm"
                      className="bg-slate-700"
                    />
                    <div>
                      <div className="text-sm font-medium text-white">
                        {agent.agentName}
                      </div>
                      {agent.taskId && (
                        <div className="text-xs text-slate-400">
                          Task #{agent.taskId}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    {getStatusIcon(agent.status)}
                    <Badge
                      color={getStatusColor(agent.status)}
                      variant="flat"
                      size="sm"
                    >
                      {agent.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </motion.div>
              ))}

              {activeAgents.length === 0 && (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No active agents</p>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* Blocked Tasks */}
      {blocked.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-3"
        >
          <Card className="bg-slate-800/50 border-slate-700">
            <CardBody className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-red-400" />
                Blocked Tasks ({blocked.length})
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {blocked.map((blocker, index) => (
                  <motion.div
                    key={blocker.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 * index }}
                    className="bg-red-500/10 border border-red-500/20 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-white text-sm">
                          Task #{blocker.taskId}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">
                          {blocker.reason || 'No reason provided'}
                        </p>
                      </div>
                      <Badge
                        color={
                          blocker.severity === 'critical' ? 'danger' :
                          blocker.severity === 'high' ? 'danger' :
                          blocker.severity === 'medium' ? 'warning' : 'default'
                        }
                        variant="flat"
                        size="sm"
                      >
                        {blocker.severity}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        Agent: {blocker.blockedAgent}
                      </span>
                      {blocker.blockingOwner && (
                        <span className="text-slate-400">
                          Owner: {blocker.blockingOwner}
                        </span>
                      )}
                    </div>

                    {blocker.humanInterventionReason && (
                      <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-200">
                        <strong>Needs human help:</strong> {blocker.humanInterventionReason}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
