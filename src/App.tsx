import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Upload, Sparkles, Download, Settings, AlertTriangle } from 'lucide-react'
import { ApiKeyModal } from '@/components/ApiKeyModal'
import { generateFlashcardsBatch, type FlashcardContent } from '@/services/openai'

function App() {
  const [wordList, setWordList] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [flashcards, setFlashcards] = useState<FlashcardContent[]>([])
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [apiKey, setApiKey] = useState<string>('')
  
  // Load API key from localStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai_api_key')
    if (savedApiKey) {
      setApiKey(savedApiKey)
      // Set it in the environment variable for the OpenAI client
      // @ts-ignore - This is for runtime configuration
      import.meta.env.VITE_OPENAI_API_KEY = savedApiKey
    }
  }, [])
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        setWordList(content)
      }
      reader.readAsText(file)
    }
  }
  
  const processWords = async () => {
    // Check if API key is configured
    if (!apiKey || apiKey === 'sk-placeholder-for-development') {
      setShowApiKeyModal(true)
      return
    }
    
    setIsProcessing(true)
    setProgress({ completed: 0, total: 0 })
    
    // Parse word list (one word per line)
    const words = wordList
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0)
    
    console.log('Processing words:', words)
    
    try {
      // Update environment variable with current API key
      // @ts-ignore
      import.meta.env.VITE_OPENAI_API_KEY = apiKey
      
      const generatedCards = await generateFlashcardsBatch(
        words,
        (completed, total) => {
          setProgress({ completed, total })
        }
      )
      
      setFlashcards(generatedCards)
    } catch (error) {
      console.error('Error processing words:', error)
      // Show error message or fallback
    } finally {
      setIsProcessing(false)
    }
  }
  
  const exportToAnki = () => {
    // TODO: Implement Anki export
    console.log('Exporting to Anki:', flashcards)
  }
  
  const handleApiKeySet = (newApiKey: string) => {
    setApiKey(newApiKey)
    // @ts-ignore
    import.meta.env.VITE_OPENAI_API_KEY = newApiKey
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">ISEE Vocabulary Flashcard Generator</h1>
          <p className="text-muted-foreground">
            Transform your vocabulary list into engaging Anki flashcards with AI-generated content
          </p>
          
          {/* API Key Status */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {apiKey && apiKey !== 'sk-placeholder-for-development' ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/20 rounded-full text-sm text-green-700 dark:text-green-400">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                OpenAI API Connected
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-orange-100 dark:bg-orange-900/20 rounded-full text-sm text-orange-700 dark:text-orange-400">
                <AlertTriangle className="w-3 h-3" />
                API Key Required
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowApiKeyModal(true)}
            >
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </Button>
          </div>
        </div>
        
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Enter Vocabulary Words</CardTitle>
            <CardDescription>
              Paste your word list below (one word per line) or upload a text/CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter words here, one per line...&#10;&#10;Example:&#10;aberrant&#10;abstruse&#10;acumen&#10;alacrity"
              value={wordList}
              onChange={(e) => setWordList(e.target.value)}
              className="min-h-[200px] font-mono"
            />
            
            <div className="flex gap-4">
              <div className="relative">
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </Button>
              </div>
              
              <Button 
                onClick={processWords}
                disabled={!wordList.trim() || isProcessing}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isProcessing ? 'Generating...' : 'Generate Flashcards'}
              </Button>
            </div>
            
            {/* Progress Bar */}
            {isProcessing && progress.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Generating flashcards...</span>
                  <span>{progress.completed} of {progress.total}</span>
                </div>
                <Progress value={(progress.completed / progress.total) * 100} />
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Results Section */}
        {flashcards.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Generated Flashcards</CardTitle>
              <CardDescription>
                {flashcards.length} flashcards ready for export
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preview of first few cards */}
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {flashcards.slice(0, 3).map((card, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{card.word}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        card.difficulty === 'easy' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                        card.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                      }`}>
                        {card.difficulty}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{card.definition}</p>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Examples:</p>
                      {card.examples.map((example, i) => (
                        <p key={i} className="text-sm pl-4 border-l-2 border-muted">
                          {example}
                        </p>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-sm font-medium">Synonyms:</span>
                      {card.synonyms.map((synonym, i) => (
                        <span key={i} className="px-2 py-1 bg-muted rounded text-xs">
                          {synonym}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {flashcards.length > 3 && (
                  <p className="text-center text-muted-foreground">
                    ... and {flashcards.length - 3} more cards
                  </p>
                )}
              </div>
              
              <Button onClick={exportToAnki} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Export to Anki
              </Button>
            </CardContent>
          </Card>
        )}
        
        {/* Features Info */}
        <Card>
          <CardHeader>
            <CardTitle>What's Included</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start">
                <span className="mr-2">🎯</span>
                <span>Kid-friendly definitions (10-year-old level)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📝</span>
                <span>3 contextual example sentences per word</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🔄</span>
                <span>3-4 synonyms and related phrases</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📊</span>
                <span>Difficulty level assessment (easy/medium/hard)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🖼️</span>
                <span>Square illustrations for visual memory (coming soon)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🔊</span>
                <span>Audio pronunciation for each word (coming soon)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📚</span>
                <span>Ready-to-import Anki deck format</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
      
      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onApiKeySet={handleApiKeySet}
        currentApiKey={apiKey}
      />
    </div>
  )
}

export default App