import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  Textarea,
  Avatar,
} from '@heroui/react'
import { Agent } from '../lib/store'

interface LoginModalProps {
  onLogin: (agent: Agent) => void
}

const AVATAR_EMOJIS = [
  '🤖', '👨‍💻', '👩‍💻', '🧑‍🔬', '👨‍🚀', '👩‍🚀', '🧑‍🎨', '🎯', '⚡', '🔥',
  '🚀', '💡', '🎨', '🔧', '⚙️', '🛠️', '📊', '📈', '🎪', '🎭'
]

const AGENT_STATUSES = [
  { key: 'available', label: 'Available' },
  { key: 'busy', label: 'Busy' },
  { key: 'offline', label: 'Offline' },
] as const

export function LoginModal({ onLogin }: LoginModalProps) {
  const [agentName, setAgentName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_EMOJIS[0])
  const [status, setStatus] = useState<'available' | 'busy' | 'offline'>('available')
  const [note, setNote] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!agentName.trim()) return

    setIsLoading(true)

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    const agent: Agent = {
      name: agentName.trim(),
      avatar: selectedAvatar,
      status,
      note: note.trim() || undefined,
    }

    onLogin(agent)
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Modal
          isOpen={true}
          hideCloseButton
          size="lg"
          backdrop="blur"
          classNames={{
            base: "bg-slate-900/95 backdrop-blur-md border border-slate-700",
            header: "border-b border-slate-700",
            body: "py-6",
            footer: "border-t border-slate-700",
          }}
        >
          <ModalContent>
            <form onSubmit={handleSubmit}>
              <ModalHeader className="flex flex-col gap-1">
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-center"
                >
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Vibe Systems
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    Control Plane v2
                  </p>
                </motion.div>
              </ModalHeader>

              <ModalBody className="space-y-6">
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-center"
                >
                  <h2 className="text-xl font-semibold text-white mb-2">
                    Agent Check-in
                  </h2>
                  <p className="text-slate-400 text-sm">
                    Enter the command center and coordinate with your team
                  </p>
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="space-y-4"
                >
                  <Input
                    label="Agent Name"
                    placeholder="Enter your agent name"
                    value={agentName}
                    onValueChange={setAgentName}
                    isRequired
                    classNames={{
                      label: "text-slate-300",
                      input: "bg-slate-800/50 border-slate-600 text-white",
                    }}
                  />

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Avatar
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {AVATAR_EMOJIS.map((emoji) => (
                        <motion.button
                          key={emoji}
                          type="button"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedAvatar(emoji)}
                          className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg transition-colors ${
                            selectedAvatar === emoji
                              ? 'border-purple-400 bg-purple-400/20'
                              : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                          }`}
                        >
                          {emoji}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <Select
                    label="Status"
                    placeholder="Select your status"
                    selectedKeys={[status]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as typeof status
                      setStatus(selected)
                    }}
                    classNames={{
                      label: "text-slate-300",
                      trigger: "bg-slate-800/50 border-slate-600 text-white",
                      listbox: "bg-slate-800 border-slate-600",
                    }}
                  >
                    {AGENT_STATUSES.map((statusOption) => (
                      <SelectItem key={statusOption.key}>
                        {statusOption.label}
                      </SelectItem>
                    ))}
                  </Select>

                  <Textarea
                    label="Note (optional)"
                    placeholder="Any additional notes about your current status..."
                    value={note}
                    onValueChange={setNote}
                    classNames={{
                      label: "text-slate-300",
                      input: "bg-slate-800/50 border-slate-600 text-white min-h-[80px]",
                    }}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center justify-center p-4 bg-slate-800/30 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center space-x-3">
                    <Avatar
                      src={`data:image/svg+xml,${encodeURIComponent(
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50%" font-size="50" text-anchor="middle" dy="0.35em">${selectedAvatar}</text></svg>`
                      )}`}
                      size="lg"
                      className="bg-slate-700"
                    />
                    <div>
                      <p className="text-white font-medium">{agentName || 'Agent Name'}</p>
                      <p className="text-slate-400 text-sm capitalize">{status}</p>
                    </div>
                  </div>
                </motion.div>
              </ModalBody>

              <ModalFooter>
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="w-full"
                >
                  <Button
                    type="submit"
                    color="primary"
                    size="lg"
                    isLoading={isLoading}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    disabled={!agentName.trim()}
                  >
                    {isLoading ? 'Checking In...' : 'Enter Command Center'}
                  </Button>
                </motion.div>
              </ModalFooter>
            </form>
          </ModalContent>
        </Modal>
      </motion.div>
    </div>
  )
}
