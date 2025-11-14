import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  Input,
  ScrollShadow,
  Badge,
  Card,
  CardBody,
} from '@heroui/react'
import {
  Terminal,
  Send,
  Wifi,
  WifiOff,
  Trash2,
  Download,
  Play,
  Pause,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { WebSocketClient } from '../lib/api'

interface WebSocketConsoleProps {
  isOpen: boolean
  onClose: () => void
}

interface LogEntry {
  id: string
  timestamp: Date
  type: 'sent' | 'received' | 'error' | 'info'
  message: string
  data?: any
}

export function WebSocketConsole({ isOpen, onClose }: WebSocketConsoleProps) {
  const { selectedProjectId } = useStore()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [command, setCommand] = useState('')
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const addLog = (type: LogEntry['type'], message: string, data?: any) => {
    const log: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      message,
      data,
    }
    setLogs(prev => [...prev.slice(-99), log]) // Keep last 100 logs
  }

  useEffect(() => {
    if (isOpen && selectedProjectId) {
      addLog('info', 'Initializing WebSocket connection...')

      const client = new WebSocketClient(selectedProjectId)

      client.on('connected', () => {
        setIsConnected(true)
        addLog('info', 'WebSocket connected successfully')
      })

      client.on('disconnected', () => {
        setIsConnected(false)
        addLog('error', 'WebSocket disconnected')
      })

      client.on('message', (message: any) => {
        addLog('received', `Received: ${message.type}`, message)
      })

      client.on('error', (error: any) => {
        addLog('error', `Error: ${error.message || error}`, error)
      })

      client.connect()
      setWsClient(client)

      return () => {
        client.disconnect()
        setWsClient(null)
        setIsConnected(false)
      }
    }
  }, [isOpen, selectedProjectId])

  useEffect(() => {
    if (isAutoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, isAutoScroll])

  const handleSendCommand = () => {
    if (!command.trim() || !wsClient) return

    try {
      const message = JSON.parse(command)
      wsClient.send(message.type || 'message', message.payload || message)
      addLog('sent', `Sent: ${message.type || 'message'}`, message)
      setCommand('')
    } catch (error) {
      addLog('error', `Invalid JSON: ${error}`)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendCommand()
    }
  }

  const clearLogs = () => {
    setLogs([])
  }

  const downloadLogs = () => {
    const logText = logs.map(log =>
      `[${log.timestamp.toISOString()}] ${log.type.toUpperCase()}: ${log.message}${
        log.data ? ` ${JSON.stringify(log.data, null, 2)}` : ''
      }`
    ).join('\n')

    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `websocket-logs-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'sent': return 'text-blue-400'
      case 'received': return 'text-green-400'
      case 'error': return 'text-red-400'
      case 'info': return 'text-yellow-400'
      default: return 'text-slate-400'
    }
  }

  const quickCommands = [
    { label: 'Ping', command: '{"type": "ping"}' },
    { label: 'Status', command: '{"type": "agents.status"}' },
    { label: 'Tasks', command: '{"type": "tasks.list"}' },
    { label: 'Register', command: '{"type": "agents.register", "payload": {"agentName": "test"}}' },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          size="5xl"
          backdrop="blur"
          classNames={{
            base: "bg-slate-900/95 backdrop-blur-md border border-slate-700",
            header: "border-b border-slate-700",
            body: "p-0",
          }}
        >
          <ModalContent>
            <ModalHeader className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Terminal className="w-6 h-6 text-green-400" />
                <span className="text-xl font-bold text-white">WebSocket Console</span>
                  <div className="flex items-center space-x-1">
                    {isConnected ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
                    <Badge
                      color={isConnected ? 'success' : 'danger'}
                      variant="flat"
                      size="sm"
                    >
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => setIsAutoScroll(!isAutoScroll)}
                  className={isAutoScroll ? 'text-purple-400' : 'text-slate-400'}
                >
                  {isAutoScroll ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  onPress={clearLogs}
                  className="text-slate-400"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  onPress={downloadLogs}
                  className="text-slate-400"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </ModalHeader>

            <ModalBody className="flex flex-col h-96">
              {/* Quick Commands */}
              <div className="p-4 border-b border-slate-700">
                <div className="flex flex-wrap gap-2">
                  {quickCommands.map((cmd) => (
                    <Button
                      key={cmd.label}
                      size="sm"
                      variant="light"
                      onPress={() => setCommand(cmd.command)}
                      className="text-slate-400 hover:text-white"
                    >
                      {cmd.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Logs */}
              <ScrollShadow ref={scrollRef} className="flex-1 p-4 font-mono text-sm">
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No logs yet. Send a command to see activity.</p>
                  </div>
                ) : (
                  logs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="mb-2"
                    >
                      <div className="flex items-start space-x-2">
                        <span className="text-slate-500 text-xs w-20 flex-shrink-0">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <Badge
                          color={
                            log.type === 'error' ? 'danger' :
                            log.type === 'received' ? 'success' :
                            log.type === 'sent' ? 'primary' : 'default'
                          }
                          variant="flat"
                          size="sm"
                          className="text-xs px-1 py-0"
                        >
                          {log.type}
                        </Badge>
                        <span className={`${getLogColor(log.type)} flex-1 break-all`}>
                          {log.message}
                        </span>
                      </div>
                      {log.data && (
                        <div className="ml-24 mt-1">
                          <Card className="bg-slate-800/50 border-slate-700">
                            <CardBody className="p-2">
                              <pre className="text-xs text-slate-300 overflow-x-auto">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </CardBody>
                          </Card>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </ScrollShadow>

              {/* Command Input */}
              <div className="p-4 border-t border-slate-700">
                <div className="flex space-x-3">
                  <Input
                    placeholder='Enter WebSocket message (JSON)... e.g., {"type": "ping"}'
                    value={command}
                    onValueChange={setCommand}
                    onKeyPress={handleKeyPress}
                    disabled={!isConnected}
                    classNames={{
                      input: "bg-slate-800/50 border-slate-600 text-white font-mono text-sm",
                    }}
                  />
                  <Button
                    isIconOnly
                    color="primary"
                    onPress={handleSendCommand}
                    disabled={!command.trim() || !isConnected}
                    className="bg-green-500 hover:bg-green-600"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Press Enter to send • Use valid JSON format • Commands are sent to the active project room
                </div>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </AnimatePresence>
  )
}
