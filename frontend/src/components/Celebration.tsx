import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { CheckCircle, Sparkles, Trophy } from 'lucide-react'

interface CelebrationProps {}

export function Celebration({}: CelebrationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [celebrationType, setCelebrationType] = useState<'task' | 'milestone' | 'project'>('task')

  // Listen for task completion events
  useEffect(() => {
    const handleTaskComplete = () => {
      setCelebrationType('task')
      setIsVisible(true)
      triggerConfetti()
    }

    const handleMilestone = () => {
      setCelebrationType('milestone')
      setIsVisible(true)
      triggerConfetti()
    }

    const handleProjectComplete = () => {
      setCelebrationType('project')
      setIsVisible(true)
      triggerConfetti()
    }

    // Listen for custom events (you can dispatch these from your task completion logic)
    window.addEventListener('taskCompleted', handleTaskComplete)
    window.addEventListener('milestoneReached', handleMilestone)
    window.addEventListener('projectCompleted', handleProjectComplete)

    return () => {
      window.removeEventListener('taskCompleted', handleTaskComplete)
      window.removeEventListener('milestoneReached', handleMilestone)
      window.removeEventListener('projectCompleted', handleProjectComplete)
    }
  }, [])

  const triggerConfetti = () => {
    const duration = 3000
    const animationEnd = Date.now() + duration

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        clearInterval(interval)
        return
      }

      const particleCount = 50 * (timeLeft / duration)

      confetti({
        particleCount,
        startVelocity: randomInRange(50, 100),
        spread: randomInRange(50, 70),
        origin: {
          x: randomInRange(0.1, 0.3),
          y: Math.random() - 0.2
        },
        colors: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']
      })

      confetti({
        particleCount,
        startVelocity: randomInRange(50, 100),
        spread: randomInRange(50, 70),
        origin: {
          x: randomInRange(0.7, 0.9),
          y: Math.random() - 0.2
        },
        colors: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']
      })
    }, 250)
  }

  const getCelebrationConfig = () => {
    switch (celebrationType) {
      case 'task':
        return {
          icon: CheckCircle,
          title: 'Task Completed! 🎉',
          message: 'Great job! Another task down.',
          color: 'text-green-400',
          bgColor: 'bg-green-500/20',
          borderColor: 'border-green-400/50',
        }
      case 'milestone':
        return {
          icon: Trophy,
          title: 'Milestone Reached! 🏆',
          message: 'Congratulations on this achievement!',
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/20',
          borderColor: 'border-yellow-400/50',
        }
      case 'project':
        return {
          icon: Sparkles,
          title: 'Project Complete! ✨',
          message: 'Amazing work! Project successfully delivered.',
          color: 'text-purple-400',
          bgColor: 'bg-purple-500/20',
          borderColor: 'border-purple-400/50',
        }
      default:
        return {
          icon: CheckCircle,
          title: 'Achievement Unlocked!',
          message: 'Keep up the great work!',
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/20',
          borderColor: 'border-blue-400/50',
        }
    }
  }

  const config = getCelebrationConfig()
  const Icon = config.icon

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 pointer-events-none"
            onClick={() => setIsVisible(false)}
          />

          {/* Celebration Modal */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 50 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 25,
              duration: 0.5
            }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: [0.9, 1.05, 1] }}
              transition={{
                duration: 0.6,
                times: [0, 0.6, 1],
                ease: "easeOut"
              }}
              className={`relative ${config.bgColor} ${config.borderColor} border-2 rounded-2xl p-8 shadow-2xl max-w-md mx-auto`}
            >
              {/* Animated background glow */}
              <motion.div
                animate={{
                  boxShadow: [
                    '0 0 20px rgba(139, 92, 246, 0.3)',
                    '0 0 40px rgba(139, 92, 246, 0.6)',
                    '0 0 20px rgba(139, 92, 246, 0.3)',
                  ]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 rounded-2xl"
              />

              <div className="relative z-10 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{
                    duration: 0.8,
                    times: [0, 0.6, 1],
                    ease: "easeOut"
                  }}
                  className="mb-6"
                >
                  <div className={`w-20 h-20 ${config.bgColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
                    <Icon className={`w-10 h-10 ${config.color}`} />
                  </div>
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="text-2xl font-bold text-white mb-3"
                >
                  {config.title}
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="text-slate-300 mb-6"
                >
                  {config.message}
                </motion.p>

                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7, duration: 0.3 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsVisible(false)}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  Continue
                </motion.button>
              </div>

              {/* Floating particles */}
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{
                    opacity: 0,
                    scale: 0,
                    x: 0,
                    y: 0
                  }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0],
                    x: Math.random() * 200 - 100,
                    y: Math.random() * 200 - 100,
                  }}
                  transition={{
                    duration: 2,
                    delay: Math.random() * 0.5,
                    ease: "easeOut"
                  }}
                  className={`absolute w-2 h-2 ${config.bgColor} rounded-full`}
                  style={{
                    left: '50%',
                    top: '50%',
                  }}
                />
              ))}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Utility function to trigger celebrations from anywhere in the app
export const triggerCelebration = (type: 'task' | 'milestone' | 'project' = 'task') => {
  const event = new CustomEvent(type === 'task' ? 'taskCompleted' :
                               type === 'milestone' ? 'milestoneReached' : 'projectCompleted')
  window.dispatchEvent(event)
}
