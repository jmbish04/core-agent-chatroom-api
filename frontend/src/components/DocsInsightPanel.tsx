import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Spinner,
  Badge,
  Tooltip,
} from '@heroui/react'
import {
  BookOpen,
  ExternalLink,
  Search,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { docsApi, DocsQueryResponse, DocsSource } from '../lib/api'

interface DocsInsightPanelProps {
  isOpen: boolean
  onClose: () => void
  query?: string
  topic?: string
}

export function DocsInsightPanel({
  isOpen,
  onClose,
  query: initialQuery = '',
  topic: initialTopic = 'workers'
}: DocsInsightPanelProps) {
  const [query, setQuery] = useState(initialQuery)
  const [topic, setTopic] = useState(initialTopic)
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<DocsQueryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialQuery) {
      handleSearch()
    }
  }, [initialQuery])

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await docsApi.query({
        query: query.trim(),
        topic: topic as any,
        maxResults: 5,
      })
      setResults(response.data)
    } catch (err) {
      console.error('Docs search failed:', err)
      setError('Failed to fetch documentation. Please try again.')
      setResults(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success'
    if (confidence >= 0.6) return 'warning'
    return 'danger'
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.8) return <CheckCircle className="w-4 h-4" />
    if (confidence >= 0.6) return <AlertCircle className="w-4 h-4" />
    return <AlertCircle className="w-4 h-4" />
  }

  const topics = [
    { key: 'workers', label: 'Workers' },
    { key: 'durable-objects', label: 'Durable Objects' },
    { key: 'd1', label: 'D1 Database' },
    { key: 'r2', label: 'R2 Storage' },
    { key: 'ai', label: 'AI' },
    { key: 'agents', label: 'Agents' },
    { key: 'general', label: 'General' },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 h-full w-96 bg-slate-900/95 backdrop-blur-md border-l border-slate-700 z-50 overflow-y-auto"
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Docs Insights</h2>
                    <p className="text-sm text-slate-400">Cloudflare Documentation</p>
                  </div>
                </div>
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onPress={onClose}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Search */}
              <div className="space-y-4 mb-6">
                <Input
                  placeholder="Ask about Cloudflare features..."
                  value={query}
                  onValueChange={setQuery}
                  onKeyPress={handleKeyPress}
                  startContent={<Search className="w-4 h-4 text-slate-400" />}
                  classNames={{
                    input: "bg-slate-800/50 border-slate-600 text-white",
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  {topics.map((topicOption) => (
                    <Button
                      key={topicOption.key}
                      size="sm"
                      variant={topic === topicOption.key ? 'solid' : 'light'}
                      onPress={() => setTopic(topicOption.key)}
                      className={topic === topicOption.key ? 'bg-purple-500 text-white' : 'text-slate-400'}
                    >
                      {topicOption.label}
                    </Button>
                  ))}
                </div>

                <Button
                  onPress={handleSearch}
                  isLoading={isLoading}
                  className="w-full bg-purple-500 hover:bg-purple-600"
                  disabled={!query.trim()}
                >
                  {isLoading ? 'Searching...' : 'Search Documentation'}
                </Button>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
                >
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 text-sm">{error}</span>
                  </div>
                </motion.div>
              )}

              {/* Results */}
              {results && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Answer */}
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Lightbulb className="w-4 h-4 text-yellow-400" />
                          <span className="text-white font-medium">Answer</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {getConfidenceIcon(results.confidence)}
                          <Badge
                            color={getConfidenceColor(results.confidence)}
                            variant="flat"
                            size="sm"
                          >
                            {(results.confidence * 100).toFixed(0)}% confident
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        {results.answer}
                      </p>
                    </CardBody>
                  </Card>

                  {/* Sources */}
                  <div>
                    <h3 className="text-white font-medium mb-3 flex items-center">
                      <BookOpen className="w-4 h-4 mr-2" />
                      Sources
                    </h3>
                    <div className="space-y-2">
                      {results.sources.map((source, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <Card className="bg-slate-800/30 border-slate-700 hover:bg-slate-800/50 transition-colors">
                            <CardBody className="p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="text-white text-sm font-medium mb-1 line-clamp-1">
                                    {source.title}
                                  </h4>
                                  <p className="text-slate-400 text-xs line-clamp-2 mb-2">
                                    {source.snippet}
                                  </p>
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center space-x-1 text-purple-400 hover:text-purple-300 text-xs transition-colors"
                                  >
                                    <span>View Documentation</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            </CardBody>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Empty State */}
              {!results && !isLoading && !error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-sm">
                    Search Cloudflare documentation for insights
                  </p>
                  <p className="text-slate-500 text-xs mt-2">
                    Get real-time guidance on Workers, Durable Objects, D1, and more
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Hook for using docs insights
export const useDocsInsights = () => {
  const { showDocsInsight, toggleDocsInsight } = useStore()

  const openDocsPanel = () => {
    // If you intend to use query/topic, you should set them in the store here.
    // For example: useStore.getState().setInitialDocsQuery({ query, topic });
    toggleDocsInsight()
  }

  return {
    isOpen: showDocsInsight,
    openDocsPanel,
    closeDocsPanel: toggleDocsInsight,
  }
}
