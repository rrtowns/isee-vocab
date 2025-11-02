import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Upload, Sparkles, Download, Settings, ChevronDown, FileText, Package, Key, Volume2 } from 'lucide-react'
import { ApiKeyModal } from '@/components/ApiKeyModal'
import { generateFlashcardsBatch, type FlashcardContent, createImagePrompt, generateImageFromPrompt, verifyOpenAIKey } from '@/services/openai'
import { buildAnkiTSV, downloadText, exportAnkiZip, exportAnkiApkg } from '@/utils/ankiExport'

function App() {
  const [wordList, setWordList] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [flashcards, setFlashcards] = useState<FlashcardContent[]>([])
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [apiKey, setApiKey] = useState<string>('')
  const [generateImages, setGenerateImages] = useState<boolean>(true)
  const [imageSize, setImageSize] = useState<string>('1024x1024')
  const [imageModel, setImageModel] = useState<string>('dall-e-3')
  const [imageStyle, setImageStyle] = useState<'natural' | 'vivid'>('vivid')
  const [imageQuality, setImageQuality] = useState<'standard' | 'hd'>('hd')
  const [imageStatus, setImageStatus] = useState<Record<number, 'pending' | 'success' | 'failed'>>({})
  const [imageErrors, setImageErrors] = useState<Record<number, string>>({})
  const DEBUG_IMAGES: boolean = (import.meta.env.VITE_DEBUG_IMAGES as any) !== 'false'
  const [generateAudio, setGenerateAudio] = useState<boolean>(true)
  const [voice, setVoice] = useState<string>((import.meta.env.VITE_OPENAI_VOICE as any) || 'alloy')
  const [showSettings, setShowSettings] = useState(false)

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
    // Quick health check so the "Connected" badge isn't misleading
    try {
      const res = await verifyOpenAIKey(apiKey)
      console.log('[ui] verify key result', res)
      if (!res.ok) {
        alert(`OpenAI API key did not validate. ${res.error ? 'Details: ' + res.error : ''}`)
        setShowApiKeyModal(true)
        return
      }
    } catch (e) {
      console.warn('OpenAI validation failed', e)
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
        imageModel,
        imageStyle,
        imageQuality,
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
        { generateImages: false, generateAudio, voice }
      )
      setFlashcards(generatedCards)

      // 2) Always compute prompts first if requested (or if images are on)
      if (generateImages) {
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
  
  const exportToAnki = async () => {
    if (!flashcards.length) return;
    try {
      await exportAnkiZip(flashcards, { deckName: 'isee-vocab' })
    } catch (e) {
      console.warn('[anki] zip export failed, falling back to TSV', e)
      const tsv = buildAnkiTSV(flashcards)
      const stamp = new Date().toISOString().slice(0,10)
      downloadText(`isee-vocab-${stamp}.tsv`, tsv)
    }
  }

  const exportToApkg = async () => {
    if (!flashcards.length) return;
    await exportAnkiApkg(flashcards, { deckName: 'isee-vocab' })
  }
  
  const handleApiKeySet = (newApiKey: string) => {
    setApiKey(newApiKey)
    // @ts-ignore
    import.meta.env.VITE_OPENAI_API_KEY = newApiKey
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="tracking-tight text-gray-900">ANKI-READY IN MINUTES</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowApiKeyModal(true)}
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Transform your word lists into stunning flashcards
          </h2>
          <p className="text-gray-600 max-w-3xl mx-auto">
            AI-powered flashcards complete with professional audio, vivid imagery, and contextual examples—perfectly formatted for Anki.
          </p>
        </div>

        {/* Main Input Card */}
        <Card className="p-8 mb-8 shadow-lg border-0 bg-purple-50/50 backdrop-blur-sm">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg text-gray-900">Enter Vocabulary Words</h3>
              </div>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
              >
                Advanced options
                <ChevronDown className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Paste words (one per line) or upload a simple text/CSV file. We'll handle definitions, imagery, audio, and export-ready formatting.
            </p>
            <Textarea
              value={wordList}
              onChange={(e) => setWordList(e.target.value)}
              placeholder="Enter words here, one per line...&#10;&#10;Example:&#10;aberrant&#10;abstruse&#10;acumen&#10;alacrity"
              className="min-h-[200px] font-mono text-sm resize-none border-gray-200 focus:border-indigo-300 focus:ring-indigo-200 placeholder:text-gray-400"
            />
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="mb-6 p-6 bg-gray-50 rounded-lg border border-gray-200 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Generate Images Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="images"
                      checked={generateImages}
                      onChange={(e) => setGenerateImages(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <label htmlFor="images" className="text-sm text-gray-900">Generate images</label>
                  </div>
                  <div className="space-y-3 pl-7">
                    <div>
                      <label className={`text-sm mb-2 block ${!generateImages ? 'text-gray-400' : 'text-gray-600'}`}>Model</label>
                      <select
                        disabled={!generateImages}
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg text-sm ${
                          generateImages
                            ? 'bg-white border-gray-200 text-gray-900'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <option value="dall-e-2">dall-e-2</option>
                        <option value="dall-e-3">dall-e-3</option>
                        <option value="gpt-image-1">gpt-image-1</option>
                      </select>
                    </div>
                    <div>
                      <label className={`text-sm mb-2 block ${!generateImages || imageModel === 'gpt-image-1' ? 'text-gray-400' : 'text-gray-600'}`}>Style</label>
                      <select
                        disabled={!generateImages || imageModel === 'gpt-image-1'}
                        value={imageStyle}
                        onChange={(e) => setImageStyle(e.target.value as 'natural' | 'vivid')}
                        className={`w-full px-3 py-2 border rounded-lg text-sm ${
                          generateImages && imageModel !== 'gpt-image-1'
                            ? 'bg-white border-gray-200 text-gray-900'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <option value="vivid">vivid</option>
                        <option value="natural">natural</option>
                      </select>
                    </div>
                    <div>
                      <label className={`text-sm mb-2 block ${!generateImages || imageModel === 'gpt-image-1' ? 'text-gray-400' : 'text-gray-600'}`}>Quality</label>
                      <select
                        disabled={!generateImages || imageModel === 'gpt-image-1'}
                        value={imageQuality}
                        onChange={(e) => setImageQuality(e.target.value as 'standard' | 'hd')}
                        className={`w-full px-3 py-2 border rounded-lg text-sm ${
                          generateImages && imageModel !== 'gpt-image-1'
                            ? 'bg-white border-gray-200 text-gray-900'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <option value="standard">standard</option>
                        <option value="hd">hd</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Generate Pronunciation Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="audio"
                      checked={generateAudio}
                      onChange={(e) => setGenerateAudio(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <label htmlFor="audio" className="text-sm text-gray-900">Generate pronunciation</label>
                  </div>
                  <div className="pl-7">
                    <label className={`text-sm mb-2 block ${!generateAudio ? 'text-gray-400' : 'text-gray-600'}`}>Voice</label>
                    <select
                      disabled={!generateAudio}
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-sm ${
                        generateAudio
                          ? 'bg-white border-gray-200 text-gray-900'
                          : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <option value="alloy">alloy</option>
                      <option value="aria">aria</option>
                      <option value="verse">verse</option>
                      <option value="coral">coral</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2 transition-colors"
              onClick={processWords}
              disabled={!wordList.trim() || isProcessing}
            >
              <Sparkles className="w-4 h-4" />
              {isProcessing ? 'Generating...' : 'Generate Flashcards'}
            </Button>
            <div className="relative inline-block">
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full cursor-pointer opacity-0 z-10"
              />
              <Button variant="outline" className="gap-2 relative z-0">
                <Upload className="w-4 h-4" />
                Upload File
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          {isProcessing && progress.total > 0 && (
            <div className="space-y-2 mt-6">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Generating flashcards...</span>
                <span>{progress.completed} of {progress.total}</span>
              </div>
              <Progress value={(progress.completed / progress.total) * 100} />
            </div>
          )}
        </Card>
        
        {/* Flashcard Previews */}
        {flashcards.length > 0 && (
          <div className="space-y-6 mb-8">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl text-gray-900">Preview</h3>
              {/* Export Buttons */}
              <div className="flex gap-3">
                <Button variant="outline" className="gap-2" onClick={exportToAnki}>
                  <FileText className="w-4 h-4" />
                  Export TSV
                </Button>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-2" onClick={exportToApkg}>
                  <Package className="w-4 h-4" />
                  Export .apkg
                </Button>
              </div>
            </div>

            {flashcards.map((card, index) => {
              const word = card.word.charAt(0).toUpperCase() + card.word.slice(1)
              const examples = Array.isArray(card.examples)
                ? card.examples.filter(Boolean)
                : typeof card.examples === 'string'
                  ? [card.examples]
                  : []
              const synonyms = Array.isArray(card.synonyms)
                ? card.synonyms.filter(Boolean)
                : typeof card.synonyms === 'string'
                  ? [card.synonyms]
                  : []

              return (
                <div key={index} className="space-y-4">
                  {/* Front of Card */}
                  <Card className="p-6 shadow-lg border-0 bg-purple-50/80 backdrop-blur-sm">
                    <div className="px-4 py-2 bg-purple-100 text-purple-700 text-sm font-medium mb-4 inline-block">
                      FRONT
                    </div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-3xl text-gray-900">{word}</h3>
                      {card.audioUrl && (
                        <button className="w-10 h-10 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center transition-colors">
                          <Volume2 className="w-5 h-5 text-white" />
                        </button>
                      )}
                    </div>
                  </Card>

                  {/* Back of Card */}
                  <Card className="p-8 shadow-lg border-0 bg-purple-50/80 backdrop-blur-sm overflow-hidden">
                    <div className="px-4 py-2 bg-purple-100 text-purple-700 text-sm font-medium mb-6 inline-block">
                      BACK
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Image */}
                      {card.imageUrl && (
                        <div className="rounded-2xl overflow-hidden shadow-lg">
                          <img
                            src={card.imageUrl}
                            alt={word}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}

                      {/* Content */}
                      <div className="space-y-6">
                        {/* Definition */}
                        {card.definition && (
                          <div>
                            <p className="text-gray-800">
                              <span className="font-semibold">{word}</span> {card.definition}
                            </p>
                          </div>
                        )}

                        {/* Examples */}
                        {examples.length > 0 && (
                          <div>
                            <h4 className="text-sm text-gray-500 mb-3">Examples</h4>
                            <ul className="space-y-2">
                              {examples.map((example, i) => (
                                <li key={i} className="flex gap-2 text-sm text-gray-700">
                                  <span className="text-indigo-500 flex-shrink-0">•</span>
                                  <span>{example}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Synonyms */}
                        {synonyms.length > 0 && (
                          <div>
                            <h4 className="text-sm text-gray-500 mb-3">Synonyms</h4>
                            <div className="flex flex-wrap gap-2">
                              {synonyms.map((synonym, i) => (
                                <span
                                  key={i}
                                  className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm"
                                >
                                  {synonym.trim()}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              )
            })}
          </div>
        )}
        
        {/* What's Included */}
        <Card className="p-8 mb-8 shadow-lg border-0 bg-purple-50/50 backdrop-blur-sm">
          <h3 className="text-lg mb-4 text-gray-900">What's Included</h3>
          <p className="text-sm text-gray-600 mb-6">
            Every output mirrors the way cards render inside Anki—no extra tweaking required.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0 text-xl">
                🎯
              </div>
              <div>
                <p className="text-sm text-gray-900">Kid-friendly language crafted for ISEE-level learners.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-lg flex items-center justify-center flex-shrink-0 text-xl">
                📝
              </div>
              <div>
                <p className="text-sm text-gray-900">Three context-rich example sentences per word.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 text-xl">
                🖼️
              </div>
              <div>
                <p className="text-sm text-gray-900">Synonym chips for quick mental associations.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 text-xl">
                🎨
              </div>
              <div>
                <p className="text-sm text-gray-900">Image-first backs that match Anki's media layout.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0 text-xl">
                🔊
              </div>
              <div>
                <p className="text-sm text-gray-900">Pronunciation clips attached to the front of each card.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg flex items-center justify-center flex-shrink-0 text-xl">
                📦
              </div>
              <div>
                <p className="text-sm text-gray-900">Export as TSV or .apkg and drop straight into existing decks.</p>
              </div>
            </div>
          </div>
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
