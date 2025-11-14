import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Avatar,
  Badge,
  ScrollShadow,
} from '@heroui/react'
import {
  MessageSquare,
  Send,
  Hash,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useStore, Message } from '../lib/store'
import { WebSocketClient } from '../lib/api'

export function Chatroom() {
  const { agent, selectedProjectId, messages, selectedThreadId, addMessage, setMessages } = useStore()
  const [newMessage, setNewMessage] = useState('')
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!selectedProjectId || !agent) return

    // Initialize WebSocket connection
    const client = new WebSocketClient(selectedProjectId)

    client.on('connected', () => {
      setIsConnected(true)
      client.send('agents.register', { agentName: agent.name })
    })

    client.on('disconnected', () => {
      setIsConnected(false)
    })

    client.on('message', (message: any) => {
      const newMsg: Message = {
        id: crypto.randomUUID(),
        taskId: message.taskId,
        agentName: message.agentName || 'System',
        content: message.content,
        timestamp: new Date().toISOString(),
        type: message.type || 'message',
      }
      addMessage(newMsg)
    })

    client.connect()
    setWsClient(client)

    return () => {
      client.disconnect()
    }
  }, [selectedProjectId, agent, addMessage])

  const handleSendMessage = () => {
    if (!newMessage.trim() || !wsClient || !agent) return

    const message = {
      content: newMessage.trim(),
      taskId: selectedThreadId,
    }

    wsClient.send('message', message)

    // Add message to local state immediately for optimistic updates
    const optimisticMessage: Message = {
      id: crypto.randomUUID(),
      taskId: selectedThreadId || undefined,
      agentName: agent.name,
      content: newMessage.trim(),
      timestamp: new Date().toISOString(),
      type: 'message',
    }
    addMessage(optimisticMessage)

    setNewMessage('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Filter messages by selected thread
  const threadMessages = messages.filter(msg =>
    !selectedThreadId || msg.taskId === selectedThreadId
  )

  // Group messages by task/thread
  const threads = messages.reduce((acc, message) => {
    const threadId = message.taskId || 'general'
    if (!acc[threadId]) {
      acc[threadId] = []
    }
    acc[threadId].push(message)
    return acc
  }, {} as Record<string, Message[]>)

  return (
    <div className="h-full flex flex-col bg-slate-900/50">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Chatroom</h2>
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
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">3 agents online</span>
          </div>
        </div>

        {selectedThreadId && (
          <div className="flex items-center space-x-2 mt-2">
            <Hash className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">
              Thread: Task #{selectedThreadId}
            </span>
          </div>
        )}
      </div>

      {/* Thread List */}
      <div className="flex-1 flex">
        <div className="w-64 border-r border-slate-700 p-3">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Threads</h3>
          <ScrollShadow className="h-full space-y-2">
            {Object.entries(threads).map(([threadId, threadMessages]) => (
              <motion.div
                key={threadId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedThreadId === threadId
                    ? 'bg-purple-500/20 border border-purple-400/50'
                    : 'bg-slate-800/50 hover:bg-slate-800/70'
                }`}
                onClick={() => useStore.getState().selectThread(
                  selectedThreadId === threadId ? null : threadId
                )}
              >
                <div className="flex items-center space-x-2 mb-1">
                  {threadId === 'general' ? (
                    <Hash className="w-4 h-4 text-slate-400" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                  )}
                  <span className="text-sm font-medium text-white truncate">
                    {threadId === 'general' ? 'General' : `Task ${threadId}`}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  {threadMessages.length} messages
                </div>
                <div className="text-xs text-slate-500 mt-1 truncate">
                  {threadMessages[threadMessages.length - 1]?.content}
                </div>
              </motion.div>
            ))}
          </ScrollShadow>
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col">
          <ScrollShadow className="flex-1 p-4 space-y-4">
            {threadMessages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No messages yet</p>
                <p className="text-slate-500 text-sm">
                  {selectedThreadId ? `Start the conversation for Task ${selectedThreadId}` : 'Start the conversation'}
                </p>
              </div>
            ) : (
              threadMessages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex space-x-3 ${
                    message.agentName === agent?.name ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.agentName !== agent?.name && (
                    <Avatar
                      src={`data:image/svg+xml,${encodeURIComponent(
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50%" font-size="50" text-anchor="middle" dy="0.35em">${message.agentName.charAt(0).toUpperCase()}</text></svg>`
                      )}`}
                      size="sm"
                      className="bg-slate-700 mt-1"
                    />
                  )}

                  <div className={`max-w-xs lg:max-w-md ${
                    message.agentName === agent?.name ? 'order-first' : ''
                  }`}>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        {message.agentName}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                      {message.type === 'system' && (
                        <Badge color="secondary" variant="flat" size="sm">
                          System
                        </Badge>
                      )}
                    </div>

                    <div className={`p-3 rounded-lg ${
                      message.agentName === agent?.name
                        ? 'bg-purple-500/20 border border-purple-400/30'
                        : 'bg-slate-800/50 border border-slate-700'
                    }`}>
                      <p className="text-sm text-white whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  </div>

                  {message.agentName === agent?.name && (
                    <Avatar
                      src={`data:image/svg+xml,${encodeURIComponent(
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50%" font-size="50" text-anchor="middle" dy="0.35em">${message.agentName.charAt(0).toUpperCase()}</text></svg>`
                      )}`}
                      size="sm"
                      className="bg-slate-700 mt-1"
                    />
                  )}
                </motion.div>
              ))
            )}
          </ScrollShadow>

          {/* Message Input */}
          <div className="p-4 border-t border-slate-700">
            <div className="flex space-x-3">
              <Input
                placeholder="Type your message..."
                value={newMessage}
                onValueChange={setNewMessage}
                onKeyPress={handleKeyPress}
                disabled={!isConnected}
                classNames={{
                  input: "bg-slate-800/50 border-slate-600 text-white",
                }}
              />
              <Button
                isIconOnly
                color="primary"
                onPress={handleSendMessage}
                disabled={!newMessage.trim() || !isConnected}
                className="bg-purple-500 hover:bg-purple-600"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
