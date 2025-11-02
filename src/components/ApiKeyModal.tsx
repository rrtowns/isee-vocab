import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Key, AlertCircle, CheckCircle } from 'lucide-react'
import { testOpenAIConnection } from '@/services/openai'

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  onApiKeySet: (apiKey: string) => void
  currentApiKey?: string
}

export function ApiKeyModal({ isOpen, onClose, onApiKeySet, currentApiKey }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState(currentApiKey || '')
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState<string>('')
  
  useEffect(() => {
    if (currentApiKey) {
      setApiKey(currentApiKey)
    }
  }, [currentApiKey])
  
  const testConnection = async () => {
    if (!apiKey.trim()) return
    
    setIsTestingConnection(true)
    setConnectionStatus('idle')
    console.log('[ui] Test Connection clicked, keySuffix=', apiKey.slice(-4))
    
    try {
      const res = await (async () => {
        try {
          // Prefer the detailed verifier if available (tree-shaken otherwise)
          const mod = await import('@/services/openai')
          if (typeof mod.verifyOpenAIKey === 'function') {
            // @ts-ignore dynamic
            return mod.verifyOpenAIKey(apiKey)
          }
        } catch {}
        return { ok: await testOpenAIConnection(apiKey) }
      })()
      console.log('[ui] Test Connection result:', res)
      setConnectionStatus(res.ok ? 'success' : 'error')
      setConnectionMessage(res.ok ? '' : (res.error || 'Unknown error'))
    } catch (error) {
      console.error('Connection test error:', error)
      setConnectionStatus('error')
    } finally {
      setIsTestingConnection(false)
    }
  }
  
  const handleSave = () => {
    if (!apiKey.trim()) return
    
    // Store in localStorage for persistence
    localStorage.setItem('openai_api_key', apiKey)
    onApiKeySet(apiKey)
    onClose()
  }
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            OpenAI API Configuration
          </CardTitle>
          <CardDescription>
            Enter your OpenAI API key to enable flashcard generation. Your key is stored locally and never sent to our servers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Get your API key from{' '}
              <a 
                href="https://platform.openai.com/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                OpenAI Platform
              </a>
            </p>
          </div>
          
          {connectionStatus !== 'idle' && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              connectionStatus === 'success' 
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            }`}>
              {connectionStatus === 'success' ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">Connection successful!</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">Connection failed. {connectionMessage ? `(${connectionMessage})` : 'Please check your API key.'}</span>
                </>
              )}
            </div>
          )}
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={!apiKey.trim() || isTestingConnection}
              className="flex-1"
            >
              {isTestingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!apiKey.trim() || connectionStatus === 'error'}
              className="flex-1"
            >
              Save & Continue
            </Button>
          </div>
          
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full"
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
