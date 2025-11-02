import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Upload, Sparkles, Download, Settings, AlertTriangle } from 'lucide-react'
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 px-4 py-16 text-slate-100">
      <div className="mx-auto flex flex-col gap-12" style={{ maxWidth: '900px', width: '100%' }}>
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center space-y-6">
          <div className="inline-flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 px-5 py-2 text-xs font-bold uppercase tracking-[0.3em] text-purple-200 shadow-lg shadow-purple-500/20 backdrop-blur-sm">
              <Sparkles className="h-3 w-3" />
              Anki-ready in minutes
            </span>
          </div>
          <h1 className="text-5xl font-bold leading-tight sm:text-6xl bg-gradient-to-r from-white via-purple-200 to-indigo-200 bg-clip-text text-transparent">
            ISEE Vocabulary Flashcard Generator
          </h1>
          <p className="text-lg text-slate-300 sm:text-xl leading-relaxed max-w-2xl mx-auto">
            Transform your word lists into stunning, AI-powered flashcards complete with professional audio, vivid imagery, and contextual examples—perfectly formatted for Anki.
          </p>
        
          {/* API Key Status */}
          <div className="mt-6 flex items-center justify-center gap-3">
            {apiKey && apiKey !== 'sk-placeholder-for-development' ? (
              <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/30 px-5 py-2 text-sm font-medium text-emerald-100 shadow-lg shadow-emerald-500/10">
                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
                OpenAI API Connected
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-400/30 px-5 py-2 text-sm font-medium text-orange-100 shadow-lg shadow-orange-500/10">
                <AlertTriangle className="w-4 h-4" />
                API Key Required
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowApiKeyModal(true)}
              className="rounded-full shadow-lg hover:shadow-xl transition-all"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Input Section */}
        <Card className="border-purple-500/20 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-4 border-b border-white/10 pb-6">
            <CardTitle className="text-3xl font-bold text-white flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-400/30">
                <Upload className="h-6 w-6 text-purple-200" />
              </div>
              Enter Vocabulary Words
            </CardTitle>
            <CardDescription className="text-slate-300 text-base">
              Paste words (one per line) or upload a simple text/CSV file. We'll handle definitions, imagery, audio, and export-ready formatting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <Textarea
              placeholder="Enter words here, one per line...&#10;&#10;Example:&#10;aberrant&#10;abstruse&#10;acumen&#10;alacrity"
              value={wordList}
              onChange={(e) => setWordList(e.target.value)}
              className="min-h-[240px] rounded-xl border-purple-500/20 bg-slate-950/60 font-mono text-base text-slate-50 shadow-inner focus:border-purple-400/40 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
            
            <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-6">
              <div className="relative inline-block overflow-hidden rounded-xl border border-purple-400/30 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 hover:from-purple-500/20 hover:to-indigo-500/20 transition-all shadow-lg">
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                <Button variant="ghost" className="relative z-0 text-slate-100 font-medium">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </Button>
              </div>

              <Button
                onClick={processWords}
                disabled={!wordList.trim() || isProcessing}
                variant="ghost"
                className="relative z-10 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-semibold shadow-xl hover:shadow-2xl hover:shadow-purple-500/50 transition-all rounded-xl px-6"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isProcessing ? 'Generating...' : 'Generate Flashcards'}
              </Button>

              {/* Image generation controls */}
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={generateImages}
                  onChange={(e) => setGenerateImages(e.target.checked)}
                />
                Generate images
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={generateAudio}
                  onChange={(e) => setGenerateAudio(e.target.checked)}
                />
                Generate pronunciation
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Voice
                <select
                  className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  disabled={!generateAudio}
                >
                  <option value="alloy">alloy</option>
                  <option value="aria">aria</option>
                  <option value="verse">verse</option>
                  <option value="coral">coral</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Size
                <select
                  className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm"
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

              <label className="flex items-center gap-2 text-sm text-slate-300">
                Model
                <select
                  className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  disabled={!generateImages}
                >
                  <option value="dall-e-2">dall-e-2 (faster)</option>
                  <option value="gpt-image-1">gpt-image-1 (better)</option>
                  <option value="dall-e-3">dall-e-3</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                Style
                <select
                  className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm"
                  value={imageStyle}
                  onChange={(e) => setImageStyle(e.target.value as 'natural' | 'vivid')}
                  disabled={!generateImages || imageModel !== 'dall-e-3'}
                >
                  <option value="natural">natural</option>
                  <option value="vivid">vivid</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                Quality
                <select
                  className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm"
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
          <Card className="border-purple-500/20 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl backdrop-blur-xl">
            <CardHeader className="border-b border-white/10 pb-6">
              <CardTitle className="text-3xl font-bold text-white flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-400/30">
                  <Sparkles className="h-6 w-6 text-emerald-200" />
                </div>
                Generated Flashcards
              </CardTitle>
              <CardDescription className="text-slate-300 text-base">
                {flashcards.length} flashcard{flashcards.length !== 1 ? 's' : ''} ready for export
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Preview of generated cards */}
              <div className="space-y-8 pr-1">
                {flashcards.map((card, index) => {
                  const word = card.word.charAt(0).toUpperCase() + card.word.slice(1)
                  const frontAudio = card.audioUrl
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
                    <div key={index} className="rounded-2xl border border-purple-400/20 bg-gradient-to-br from-white/10 to-white/5 shadow-xl backdrop-blur-sm hover:shadow-2xl hover:border-purple-400/30 transition-all">
                      <div className="grid gap-6 p-6 md:grid-cols-2">
                        <div className="rounded-xl border border-purple-400/20 bg-gradient-to-br from-slate-900/90 to-slate-950/90 shadow-lg">
                          <div className="px-4 py-3 border-b border-purple-400/20 bg-gradient-to-r from-purple-500/10 to-indigo-500/10">
                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-purple-200">Front</span>
                          </div>
                          <div className="p-5 space-y-4">
                            <div className="flex flex-wrap items-center gap-4">
                              <h3 className="text-3xl font-bold tracking-tight text-white">{word}</h3>
                              {frontAudio && (
                                <audio
                                  controls
                                  preload="metadata"
                                  controlsList="nodownload"
                                  src={frontAudio}
                                  className="h-10 max-w-[180px]"
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-purple-400/20 bg-gradient-to-br from-slate-900/90 to-slate-950/90 shadow-lg">
                          <div className="px-4 py-3 border-b border-purple-400/20 bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">Back</span>
                          </div>
                          <div className="p-5 space-y-4">
                            {generateImages && (
                              imageStatus[index] === 'pending' ? (
                                <div className="grid aspect-video w-full place-items-center rounded-lg border border-white/10 bg-white/5 text-center text-xs text-slate-300 animate-pulse">
                                  Generating illustration…
                                </div>
                              ) : imageStatus[index] === 'failed' ? (
                                <div className="rounded-lg border border-dashed border-red-400/30 bg-red-400/10 p-4 text-center text-xs text-red-200">
                                  {imageErrors[index] || 'Illustration unavailable'}
                                </div>
                              ) : card.imageUrl ? (
                                <div
                                  className="w-full max-w-sm"
                                  style={{ maxWidth: '440px', marginTop: '1.5rem' }}
                                >
                                  <div
                                    className="overflow-hidden rounded-lg border border-white/10 bg-white/10 shadow-sm"
                                    style={{ height: '300px' }}
                                  >
                                    <img
                                      src={card.imageUrl}
                                      alt={`${card.word} illustration`}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      loading="lazy"
                                    />
                                  </div>
                                </div>
                              ) : null
                            )}

                            {card.definition && (
                              <p className="text-base leading-relaxed text-slate-100">{card.definition}</p>
                            )}

                            {examples.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-slate-100">Examples</p>
                                <ul className="space-y-2 text-sm text-slate-300">
                                  {examples.map((example, i) => (
                                    <li key={i} className="rounded-md border-l-4 border-primary/60 bg-white/5 px-3 py-2">
                                      {example}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {synonyms.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-slate-100">Synonyms</p>
                                <p className="text-sm text-slate-300">{synonyms.join(', ')}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                <Button onClick={exportToAnki} variant="ghost" className="h-14 rounded-xl border-2 border-purple-400/30 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 hover:from-purple-500/20 hover:to-indigo-500/20 text-slate-100 font-semibold shadow-xl hover:shadow-2xl transition-all">
                  <Download className="h-5 w-5 mr-2" />
                  Export TSV + media (.zip)
                </Button>
                <Button onClick={exportToApkg} variant="ghost" className="h-14 rounded-xl border-2 border-purple-400/30 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 hover:from-purple-500/20 hover:to-indigo-500/20 text-slate-100 font-semibold shadow-xl hover:shadow-2xl transition-all">
                  <Download className="h-5 w-5 mr-2" />
                  Export Anki package (.apkg)
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Features Info */}
        <Card className="border-purple-500/20 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl backdrop-blur-xl">
          <CardHeader className="border-b border-white/10 pb-6">
            <CardTitle className="text-3xl font-bold text-white">What&apos;s Included</CardTitle>
            <CardDescription className="text-slate-300 text-base">
              Every output mirrors the way cards render inside Anki—no extra tweaking required.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <ul className="grid gap-4 text-base text-slate-200 sm:grid-cols-2">
              <li className="flex items-start gap-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 p-4 shadow-lg hover:shadow-xl transition-all">
                <span className="text-2xl">🎯</span>
                <span className="leading-relaxed">Kid-friendly language crafted for ISEE-level learners.</span>
              </li>
              <li className="flex items-start gap-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 p-4 shadow-lg hover:shadow-xl transition-all">
                <span className="text-2xl">📝</span>
                <span className="leading-relaxed">Three context-rich example sentences per word.</span>
              </li>
              <li className="flex items-start gap-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 p-4 shadow-lg hover:shadow-xl transition-all">
                <span className="text-2xl">🔁</span>
                <span className="leading-relaxed">Synonym chips for quick mental associations.</span>
              </li>
              <li className="flex items-start gap-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 p-4 shadow-lg hover:shadow-xl transition-all">
                <span className="text-2xl">🖼️</span>
                <span className="leading-relaxed">Image-first backs that match Anki&apos;s media layout.</span>
              </li>
              <li className="flex items-start gap-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 p-4 shadow-lg hover:shadow-xl transition-all">
                <span className="text-2xl">🔊</span>
                <span className="leading-relaxed">Pronunciation clips attached to the front of each card.</span>
              </li>
              <li className="flex items-start gap-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 p-4 shadow-lg hover:shadow-xl transition-all">
                <span className="text-2xl">📦</span>
                <span className="leading-relaxed">Export as TSV or .apkg and drop straight into existing decks.</span>
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
