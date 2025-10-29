import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Upload, Sparkles, Download, Settings, AlertTriangle } from 'lucide-react'
import { ApiKeyModal } from '@/components/ApiKeyModal'
import { generateFlashcardsBatch, type FlashcardContent, createImagePrompt, generateImageFromPrompt } from '@/services/openai'
import { buildAnkiTSV, downloadText } from '@/utils/ankiExport'

function App() {
  const [wordList, setWordList] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [flashcards, setFlashcards] = useState<FlashcardContent[]>([])
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [apiKey, setApiKey] = useState<string>('')
  const [generateImages, setGenerateImages] = useState<boolean>(true)
  const [imageSize, setImageSize] = useState<string>('512x512')
  const [imageModel, setImageModel] = useState<string>('dall-e-2')
  const [imageStyle, setImageStyle] = useState<'natural' | 'vivid'>('natural')
  const [imageQuality, setImageQuality] = useState<'standard' | 'hd'>('hd')
  const [imageStatus, setImageStatus] = useState<Record<number, 'pending' | 'success' | 'failed'>>({})
  const [imageErrors, setImageErrors] = useState<Record<number, string>>({})
  const DEBUG_IMAGES: boolean = (import.meta.env.VITE_DEBUG_IMAGES as any) !== 'false'
  const [showPromptsOnly, setShowPromptsOnly] = useState<boolean>(false)
  
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
    console.log('[ui] processWords clicked')
    // Check if API key is configured
    if (!apiKey || apiKey === 'sk-placeholder-for-development') {
      setShowApiKeyModal(true)
      return
    }
    setIsProcessing(true)
    setProgress({ completed: 0, total: 0 })
    setImageStatus({})
    setImageErrors({})
    
    // Parse word list (one word per line)
    const words = wordList
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0)
    
    if (DEBUG_IMAGES) {
      console.log('[ui] starting generation', {
        words: words.length,
        generateImages,
        imageSize,
        hasApiKey: !!apiKey,
      })
    }

    console.log('Processing words:', words)
    
    try {
      // Update environment variable with current API key
      // @ts-ignore
      import.meta.env.VITE_OPENAI_API_KEY = apiKey
      
      // 1) Generate text content first (no images yet)
      const generatedCards = await generateFlashcardsBatch(
        words,
        (completed, total) => {
          setProgress({ completed, total })
        },
        apiKey,
        { generateImages: false }
      )
      setFlashcards(generatedCards)

      // 2) Always compute prompts first if requested (or if images are on)
      if (generateImages || showPromptsOnly) {
        const size = imageSize
        for (let i = 0; i < generatedCards.length; i++) {
          let prompt: string | null = null;
          try {
            prompt = await createImagePrompt(generatedCards[i].word, {
              definition: generatedCards[i].definition,
              synonyms: generatedCards[i].synonyms,
              examples: generatedCards[i].examples,
              apiKey,
            });
            setFlashcards(prev => {
              const next = [...prev];
              next[i] = { ...next[i], imagePrompt: prompt as string };
              return next;
            });
          } catch (e) {
            if (DEBUG_IMAGES) console.warn('[ui] prompt generation failed', e);
          }

          if (generateImages) {
            if (DEBUG_IMAGES) console.log('[ui] image start', { index: i, word: generatedCards[i].word, size, model: imageModel, style: imageStyle, quality: imageQuality });
            setImageStatus(prev => ({ ...prev, [i]: 'pending' }));
            try {
              const url = await generateImageFromPrompt(prompt || '', { apiKey, size, model: imageModel, style: imageStyle, quality: imageQuality });
              if (url) {
                setFlashcards(prev => {
                  const next = [...prev];
                  next[i] = { ...next[i], imageUrl: url };
                  return next;
                });
                setImageStatus(prev => ({ ...prev, [i]: 'success' }));
                setImageErrors(prev => ({ ...prev, [i]: '' }));
                if (DEBUG_IMAGES) console.log('[ui] image success', { index: i, len: url.length });
              } else {
                setImageStatus(prev => ({ ...prev, [i]: 'failed' }));
                setImageErrors(prev => ({ ...prev, [i]: 'No URL returned' }));
                if (DEBUG_IMAGES) console.warn('[ui] image no url', { index: i });
              }
            } catch (e) {
              setImageStatus(prev => ({ ...prev, [i]: 'failed' }));
              const message = e instanceof Error ? e.message : String(e);
              setImageErrors(prev => ({ ...prev, [i]: message }));
              if (DEBUG_IMAGES) console.error('[ui] image error', { index: i, message });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing words:', error)
      // Show error message or fallback
    } finally {
      setIsProcessing(false)
    }
  }
  
  const exportToAnki = () => {
    if (!flashcards.length) return;
    const tsv = buildAnkiTSV(flashcards);
    const stamp = new Date().toISOString().slice(0,10);
    downloadText(`isee-vocab-${stamp}.tsv`, tsv);
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
            
            <div className="flex gap-4 flex-wrap items-center">
              <div className="relative inline-block">
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-0"
                />
                <Button variant="outline" className="relative z-10">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </Button>
              </div>
              
              <Button 
                onClick={processWords}
                disabled={!wordList.trim() || isProcessing}
                className="relative z-10"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isProcessing ? 'Generating...' : 'Generate Flashcards'}
              </Button>

              {/* Image generation controls */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={generateImages}
                  onChange={(e) => setGenerateImages(e.target.checked)}
                />
                Generate images
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showPromptsOnly}
                  onChange={(e) => setShowPromptsOnly(e.target.checked)}
                  disabled={generateImages}
                />
                Show prompts (no images)
              </label>
              <label className="flex items-center gap-2 text-sm">
                Size
                <select
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                  disabled={!generateImages}
                >
                  {imageModel === 'dall-e-2' && (
                    <>
                      <option value="256x256">256×256</option>
                      <option value="512x512">512×512</option>
                      <option value="1024x1024">1024×1024</option>
                    </>
                  )}
                  {imageModel === 'gpt-image-1' && (
                    <>
                      <option value="1024x1024">1024×1024</option>
                      <option value="1024x1536">1024×1536 (portrait)</option>
                      <option value="1536x1024">1536×1024 (landscape)</option>
                      <option value="auto">auto</option>
                    </>
                  )}
                  {imageModel === 'dall-e-3' && (
                    <>
                      <option value="1024x1024">1024×1024</option>
                      <option value="1024x1792">1024×1792 (portrait)</option>
                      <option value="1792x1024">1792×1024 (landscape)</option>
                    </>
                  )}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                Model
                <select
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  disabled={!generateImages}
                >
                  <option value="dall-e-2">dall-e-2 (faster)</option>
                  <option value="gpt-image-1">gpt-image-1 (better)</option>
                  <option value="dall-e-3">dall-e-3</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                Style
                <select
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={imageStyle}
                  onChange={(e) => setImageStyle(e.target.value as 'natural' | 'vivid')}
                  disabled={!generateImages || imageModel !== 'dall-e-3'}
                >
                  <option value="natural">natural</option>
                  <option value="vivid">vivid</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                Quality
                <select
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={imageQuality}
                  onChange={(e) => setImageQuality(e.target.value as 'standard' | 'hd')}
                  disabled={!generateImages || imageModel !== 'dall-e-3'}
                >
                  <option value="standard">standard</option>
                  <option value="hd">hd</option>
                </select>
              </label>
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
                    <div className="flex items-center gap-3">
                      {generateImages && (
                        imageStatus[index] === 'pending' ? (
                          <div className="w-16 h-16 rounded border grid place-items-center text-[10px] text-muted-foreground animate-pulse">
                            Generating…
                          </div>
                        ) : imageStatus[index] === 'failed' ? (
                          <div className="w-16 h-16 rounded border grid place-items-center text-[10px] text-muted-foreground text-center px-1" title={imageErrors[index] || 'Image generation failed'}>
                            Image failed
                          </div>
                        ) : card.imageUrl ? (
                          <img
                            src={card.imageUrl}
                            alt={`${card.word} illustration`}
                            className="w-16 h-16 rounded object-cover border"
                            loading="lazy"
                          />
                        ) : null
                      )}
                      <h3 className="font-semibold text-lg">{card.word}</h3>
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
                    <p className="text-sm"><span className="font-medium">Synonyms:</span> {card.synonyms.join(', ')}</p>
                    {card.imagePrompt && (
                      <div className="mt-2">
                        <p className="text-sm font-medium">Image prompt sent to the model:</p>
                        <pre className="text-xs bg-muted rounded p-2 whitespace-pre-wrap break-words max-h-48 overflow-auto">{card.imagePrompt}</pre>
                      </div>
                    )}
                    {generateImages && imageStatus[index] === 'failed' && imageErrors[index] && (
                      <p className="text-xs text-red-600">Image error: {imageErrors[index]}</p>
                    )}
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
