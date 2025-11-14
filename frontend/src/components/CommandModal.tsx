import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  Input,
  Select,
  SelectItem,
  Card,
  CardBody,
  Badge,
} from '@heroui/react'
import {
  Settings,
  User,
  Bell,
  Palette,
  Zap,
  Shield,
  Globe,
  Terminal,
  Save,
  RotateCcw,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { agentsApi } from '../lib/api'

interface CommandModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CommandModal({ isOpen, onClose }: CommandModalProps) {
  const { agent } = useStore()
  const [activeTab, setActiveTab] = useState('presence')
  const [agentStatus, setAgentStatus] = useState(agent?.status || 'available')
  const [agentNote, setAgentNote] = useState(agent?.note || '')
  const [isUpdating, setIsUpdating] = useState(false)

  const handleUpdatePresence = async () => {
    if (!agent) return

    setIsUpdating(true)
    try {
      await agentsApi.checkIn({
        agentName: agent.name,
        status: agentStatus as any,
        note: agentNote || undefined,
      })

      // Update local state
      useStore.getState().setAgent({
        ...agent,
        status: agentStatus as any,
        note: agentNote || undefined,
      })
    } catch (error) {
      console.error('Failed to update presence:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const commandSections = [
    {
      id: 'presence',
      label: 'Presence',
      icon: User,
      description: 'Update your agent status and availability',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      description: 'Configure notification preferences',
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: Palette,
      description: 'Customize the interface theme and layout',
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: Zap,
      description: 'Manage external service connections',
    },
    {
      id: 'security',
      label: 'Security',
      icon: Shield,
      description: 'Security and privacy settings',
    },
    {
      id: 'system',
      label: 'System',
      icon: Terminal,
      description: 'System diagnostics and controls',
    },
  ]

  const renderPresenceTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Agent Presence</h3>
        <p className="text-slate-400 text-sm mb-6">
          Update your status to let the team know your availability and current activity.
        </p>
      </div>

      <div className="space-y-4">
        <Select
          label="Status"
          placeholder="Select your status"
          selectedKeys={[agentStatus]}
          onSelectionChange={(keys) => setAgentStatus(Array.from(keys)[0] as typeof agentStatus)}
          classNames={{
            label: "text-slate-300",
            trigger: "bg-slate-800/50 border-slate-600 text-white",
            listbox: "bg-slate-700 border-slate-600",
          }}
        >
          <SelectItem key="available">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Available</span>
            </div>
          </SelectItem>
          <SelectItem key="busy">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
              <span>Busy</span>
            </div>
          </SelectItem>
          <SelectItem key="in_progress">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span>In Progress</span>
            </div>
          </SelectItem>
          <SelectItem key="blocked">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
              <span>Blocked</span>
            </div>
          </SelectItem>
          <SelectItem key="offline">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <span>Offline</span>
            </div>
          </SelectItem>
        </Select>

        <Input
          label="Status Note (optional)"
          placeholder="What are you working on?"
          value={agentNote}
          onValueChange={setAgentNote}
          classNames={{
            label: "text-slate-300",
            input: "bg-slate-800/50 border-slate-600 text-white",
          }}
        />
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700">
        <Button
          variant="light"
          onPress={onClose}
          className="text-slate-400"
        >
          Cancel
        </Button>
        <Button
          color="primary"
          onPress={handleUpdatePresence}
          isLoading={isUpdating}
          className="bg-purple-500 hover:bg-purple-600"
        >
          {isUpdating ? 'Updating...' : 'Update Presence'}
        </Button>
      </div>
    </div>
  )

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Notification Preferences</h3>
        <p className="text-slate-400 text-sm mb-6">
          Configure how and when you receive notifications about tasks and team activity.
        </p>
      </div>

      <div className="space-y-4">
        {[
          { label: 'Task assignments', description: 'When tasks are assigned to you' },
          { label: 'Task completions', description: 'When team members complete tasks' },
          { label: 'Blocked tasks', description: 'When tasks become blocked' },
          { label: 'Team mentions', description: 'When someone mentions you in chat' },
          { label: 'System alerts', description: 'Important system notifications' },
        ].map((item) => (
          <Card key={item.label} className="bg-slate-800/50 border-slate-700">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium">{item.label}</h4>
                  <p className="text-slate-400 text-sm">{item.description}</p>
                </div>
                <Badge color="success" variant="flat">Enabled</Badge>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )

  const renderAppearanceTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Appearance Settings</h3>
        <p className="text-slate-400 text-sm mb-6">
          Customize the look and feel of your command center.
        </p>
      </div>

      <div className="space-y-4">
        <Select
          label="Theme"
          placeholder="Select theme"
          defaultSelectedKeys={['dark']}
          classNames={{
            label: "text-slate-300",
            trigger: "bg-slate-800/50 border-slate-600 text-white",
            listbox: "bg-slate-700 border-slate-600",
          }}
        >
          <SelectItem key="dark">Dark Theme</SelectItem>
          <SelectItem key="light" isDisabled>Light Theme (Coming Soon)</SelectItem>
        </Select>

        <Select
          label="Layout Density"
          placeholder="Select density"
          defaultSelectedKeys={['comfortable']}
          classNames={{
            label: "text-slate-300",
            trigger: "bg-slate-800/50 border-slate-600 text-white",
            listbox: "bg-slate-700 border-slate-600",
          }}
        >
          <SelectItem key="compact">Compact</SelectItem>
          <SelectItem key="comfortable">Comfortable</SelectItem>
          <SelectItem key="spacious">Spacious</SelectItem>
        </Select>
      </div>
    </div>
  )

  const renderIntegrationsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Integrations</h3>
        <p className="text-slate-400 text-sm mb-6">
          Connect external services and tools to enhance your workflow.
        </p>
      </div>

      <div className="space-y-4">
        {[
          { name: 'Cloudflare Docs MCP', status: 'connected', description: 'Real-time documentation insights' },
          { name: 'GitHub', status: 'available', description: 'Repository integration and PR tracking' },
          { name: 'Slack', status: 'available', description: 'Team communication sync' },
          { name: 'Jira', status: 'available', description: 'Issue tracking integration' },
        ].map((integration) => (
          <Card key={integration.name} className="bg-slate-800/50 border-slate-700">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-white font-medium">{integration.name}</h4>
                  <p className="text-slate-400 text-sm">{integration.description}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge
                    color={integration.status === 'connected' ? 'success' : 'default'}
                    variant="flat"
                    size="sm"
                  >
                    {integration.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="light"
                    className="text-slate-400"
                  >
                    {integration.status === 'connected' ? 'Configure' : 'Connect'}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Security & Privacy</h3>
        <p className="text-slate-400 text-sm mb-6">
          Manage your security settings and data privacy preferences.
        </p>
      </div>

      <div className="space-y-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">Session Management</h4>
                <p className="text-slate-400 text-sm">Manage your active sessions</p>
              </div>
              <Button size="sm" variant="light" className="text-slate-400">
                View Sessions
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">Data Export</h4>
                <p className="text-slate-400 text-sm">Download your data and activity logs</p>
              </div>
              <Button size="sm" variant="light" className="text-slate-400">
                Export Data
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )

  const renderSystemTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">System Diagnostics</h3>
        <p className="text-slate-400 text-sm mb-6">
          Monitor system performance and troubleshoot issues.
        </p>
      </div>

      <div className="space-y-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">System Health</h4>
                <p className="text-slate-400 text-sm">Check overall system status</p>
              </div>
              <Badge color="success" variant="flat">Healthy</Badge>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">WebSocket Connection</h4>
                <p className="text-slate-400 text-sm">Real-time communication status</p>
              </div>
              <Badge color="success" variant="flat">Connected</Badge>
            </div>
          </CardBody>
        </Card>

        <div className="flex space-x-3">
          <Button
            variant="light"
            className="text-slate-400"
            startContent={<RotateCcw className="w-4 h-4" />}
          >
            Clear Cache
          </Button>
          <Button
            variant="light"
            className="text-slate-400"
            startContent={<Terminal className="w-4 h-4" />}
          >
            Open Console
          </Button>
        </div>
      </div>
    </div>
  )

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'presence':
        return renderPresenceTab()
      case 'notifications':
        return renderNotificationsTab()
      case 'appearance':
        return renderAppearanceTab()
      case 'integrations':
        return renderIntegrationsTab()
      case 'security':
        return renderSecurityTab()
      case 'system':
        return renderSystemTab()
      default:
        return renderPresenceTab()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          size="4xl"
          backdrop="blur"
          classNames={{
            base: "bg-slate-900/95 backdrop-blur-md border border-slate-700",
            header: "border-b border-slate-700",
            body: "p-0",
          }}
        >
          <ModalContent>
            <ModalHeader className="flex items-center space-x-3">
              <Settings className="w-6 h-6 text-purple-400" />
              <span className="text-xl font-bold text-white">Command Center</span>
            </ModalHeader>

            <ModalBody className="flex">
              {/* Sidebar */}
              <div className="w-64 border-r border-slate-700 p-4">
                <div className="space-y-2">
                  {commandSections.map((section) => {
                    const Icon = section.icon
                    return (
                      <motion.button
                        key={section.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setActiveTab(section.id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          activeTab === section.id
                            ? 'bg-purple-500/20 border border-purple-400/50'
                            : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className={`w-5 h-5 ${
                            activeTab === section.id ? 'text-purple-400' : 'text-slate-400'
                          }`} />
                          <div>
                            <div className={`font-medium ${
                              activeTab === section.id ? 'text-white' : 'text-slate-300'
                            }`}>
                              {section.label}
                            </div>
                            <div className="text-xs text-slate-400">
                              {section.description}
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 p-6">
                {renderActiveTab()}
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </AnimatePresence>
  )
}
