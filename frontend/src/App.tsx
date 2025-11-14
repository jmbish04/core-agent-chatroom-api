import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LoginModal } from './components/LoginModal'
import { Dashboard } from './components/Dashboard'
import { useStore } from './lib/store'

function App() {
  const [showLogin, setShowLogin] = useState(true)
  const { agent, isAuthenticated } = useStore()

  useEffect(() => {
    // Check if agent is already logged in (from localStorage)
    const savedAgent = localStorage.getItem('vibe-agent')
    if (savedAgent) {
      const agentData = JSON.parse(savedAgent)
      useStore.getState().setAgent(agentData)
      setShowLogin(false)
    }
  }, [])

  const handleLogin = (agentData: any) => {
    useStore.getState().setAgent(agentData)
    localStorage.setItem('vibe-agent', JSON.stringify(agentData))
    setShowLogin(false)
  }

  const handleLogout = () => {
    useStore.getState().clearAgent()
    localStorage.removeItem('vibe-agent')
    setShowLogin(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <AnimatePresence mode="wait">
        {showLogin ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <LoginModal onLogin={handleLogin} />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
          >
            <Dashboard onLogout={handleLogout} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
