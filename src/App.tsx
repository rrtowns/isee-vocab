import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Sparkles, Settings, ChevronDown, FileText, Package, PlusCircle, BookOpen, Brain, BookPlus, Check, X, ArrowUpDown, Trash2 } from 'lucide-react'
import { ApiKeyModal } from '@/components/ApiKeyModal'
import { FlashcardPreview } from '@/components/FlashcardPreview'
import { StudyCard } from '@/components/StudyCard'
import { generateFlashcardsBatch, type FlashcardContent, createImagePrompt, generateImageFromPrompt, verifyOpenAIKey } from '@/services/openai'
import { buildAnkiTSV, downloadText, exportAnkiZip, exportAnkiApkg } from '@/utils/ankiExport'
import { toast, Toaster } from 'sonner'
import { supabase, saveFlashcard, getSavedFlashcards, deleteFlashcard, type FlashcardRow } from '@/lib/supabase'

type PreviewCard = {
  word: string
  definition?: string
  examples?: string[]
  synonyms?: string[]
  imageUrl?: string
  audioUrl?: string
  audioAvailable?: boolean
}

function App() {
  // Constants
  const MAX_CONCURRENT_IMAGES = 3 // Number of images to generate in parallel

  // Mode state
  const [activeMode, setActiveMode] = useState<'create' | 'study' | 'test'>('create')

  // Existing create mode state
  const [wordList, setWordList] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [flashcards, setFlashcards] = useState<FlashcardContent[]>([])
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [imageProgress, setImageProgress] = useState({ completed: 0, total: 0 })
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [apiKey, setApiKey] = useState<string>('')
  const [generateImages, setGenerateImages] = useState<boolean>(true)
  const [imageSize] = useState<string>('1024x1024')
  const [imageModel, setImageModel] = useState<string>('dall-e-3')
  const [imageStyle, setImageStyle] = useState<'natural' | 'vivid'>('vivid')
  const [imageQuality, setImageQuality] = useState<'standard' | 'hd'>('hd')
  const [imageStatus, setImageStatus] = useState<Record<number, 'pending' | 'success' | 'failed'>>({})
  const [_imageErrors, setImageErrors] = useState<Record<number, string>>({})
  const DEBUG_IMAGES: boolean = (import.meta.env.VITE_DEBUG_IMAGES as any) !== 'false'
  const [generateAudio, setGenerateAudio] = useState<boolean>(true)
  const [voice, setVoice] = useState<string>((import.meta.env.VITE_OPENAI_VOICE as any) || 'alloy')
  const [extraKidFriendly] = useState<boolean>(true)
  const [showSettings, setShowSettings] = useState(false)

  // Study mode state - load from Supabase
  const [savedCardIds, setSavedCardIds] = useState<Set<string>>(new Set())
  const [savedCardsData, setSavedCardsData] = useState<Map<string, PreviewCard>>(new Map())
  const [cardAddedDates, setCardAddedDates] = useState<Map<string, number>>(new Map())
  const [isLoadingSavedCards, setIsLoadingSavedCards] = useState(true)
  const [selectedCardsForStudy, setSelectedCardsForStudy] = useState<Set<string>>(new Set())
  const [isStudying, setIsStudying] = useState(false)
  const [studyDeck, setStudyDeck] = useState<string[]>([])
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [stillLearningCards, setStillLearningCards] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'dateAdded' | 'alphabetical'>('dateAdded')

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

  // Load saved cards from Supabase on mount
  useEffect(() => {
    const loadSavedCards = async () => {
      if (!supabase) {
        console.log('Supabase not configured, saved cards disabled')
        setIsLoadingSavedCards(false)
        return
      }

      try {
        const cards = await getSavedFlashcards()

        const ids = new Set<string>()
        const data = new Map<string, PreviewCard>()
        const dates = new Map<string, number>()

        cards.forEach((card: FlashcardRow) => {
          ids.add(card.id)
          data.set(card.id, {
            word: card.word,
            definition: card.definition,
            examples: card.examples,
            synonyms: card.synonyms,
            imageUrl: card.image_url,
            audioUrl: card.audio_url,
            audioAvailable: !!card.audio_url,
          })
          dates.set(card.id, new Date(card.created_at).getTime())
        })

        setSavedCardIds(ids)
        setSavedCardsData(data)
        setCardAddedDates(dates)
      } catch (error) {
        console.error('Error loading saved cards:', error)
        toast.error('Failed to load saved cards from cloud')
      } finally {
        setIsLoadingSavedCards(false)
      }
    }

    loadSavedCards()
  }, [])

  // Helper function to check if a word is already saved
  const isWordSaved = (word: string): boolean => {
    const wordLower = word.toLowerCase()
    for (const card of savedCardsData.values()) {
      if (card.word.toLowerCase() === wordLower) {
        return true
      }
    }
    return false
  }

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

    // Parse word list (one word per line)
    const words = wordList
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0)

    // Set progress immediately with total count
    setIsProcessing(true)
    setProgress({ completed: 0, total: words.length })
    setImageStatus({})
    setImageErrors({})

    // Quick health check so the "Connected" badge isn't misleading
    try {
      const res = await verifyOpenAIKey(apiKey)
      console.log('[ui] verify key result', res)
      if (!res.ok) {
        alert(`OpenAI API key did not validate. ${res.error ? 'Details: ' + res.error : ''}`)
        setShowApiKeyModal(true)
        setIsProcessing(false)
        setProgress({ completed: 0, total: 0 })
        return
      }
    } catch (e) {
      console.warn('OpenAI validation failed', e)
    }
    
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

      // Reset flashcards before starting new generation
      setFlashcards([])

      // 1) Generate text content first (no images yet)
      const generatedCards = await generateFlashcardsBatch(
        words,
        (completed, total) => {
          setProgress({ completed, total })
        },
        apiKey,
        {
          generateImages: false,
          generateAudio,
          voice,
          extraKidFriendly,
          onCardReady: (card) => {
            // Add each card as soon as it's ready
            setFlashcards(prev => [...prev, card])
          }
        }
      )

      // 2) Generate images in parallel batches
      if (generateImages) {
        const size = imageSize
        const totalImages = generatedCards.length

        // Initialize image progress
        setImageProgress({ completed: 0, total: totalImages })

        if (DEBUG_IMAGES) console.log('[ui] starting parallel image generation', { total: totalImages, batchSize: MAX_CONCURRENT_IMAGES })

        // Process images in batches
        for (let batchStart = 0; batchStart < totalImages; batchStart += MAX_CONCURRENT_IMAGES) {
          const batchEnd = Math.min(batchStart + MAX_CONCURRENT_IMAGES, totalImages)
          const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i)

          if (DEBUG_IMAGES) console.log('[ui] processing batch', { batchStart, batchEnd, indices: batchIndices })

          // Generate all images in this batch concurrently
          const batchPromises = batchIndices.map(async (i) => {
            let prompt: string | null = null

            try {
              // Step 1: Generate image prompt
              prompt = await createImagePrompt(generatedCards[i].word, {
                definition: generatedCards[i].definition,
                synonyms: generatedCards[i].synonyms,
                examples: generatedCards[i].examples,
                apiKey,
              })

              setFlashcards(prev => {
                const next = [...prev]
                next[i] = { ...next[i], imagePrompt: prompt as string }
                return next
              })
            } catch (e) {
              if (DEBUG_IMAGES) console.warn('[ui] prompt generation failed', { index: i, error: e })
            }

            // Step 2: Generate image from prompt
            if (DEBUG_IMAGES) console.log('[ui] image start', { index: i, word: generatedCards[i].word, size, model: imageModel, style: imageStyle, quality: imageQuality })
            setImageStatus(prev => ({ ...prev, [i]: 'pending' }))

            try {
              const url = await generateImageFromPrompt(prompt || '', { apiKey, size, model: imageModel, style: imageStyle, quality: imageQuality })

              if (url) {
                setFlashcards(prev => {
                  const next = [...prev]
                  next[i] = { ...next[i], imageUrl: url }
                  return next
                })
                setImageStatus(prev => ({ ...prev, [i]: 'success' }))
                setImageErrors(prev => ({ ...prev, [i]: '' }))
                if (DEBUG_IMAGES) console.log('[ui] image success', { index: i, len: url.length })
              } else {
                setImageStatus(prev => ({ ...prev, [i]: 'failed' }))
                setImageErrors(prev => ({ ...prev, [i]: 'No URL returned' }))
                if (DEBUG_IMAGES) console.warn('[ui] image no url', { index: i })
              }
            } catch (e) {
              setImageStatus(prev => ({ ...prev, [i]: 'failed' }))
              const message = e instanceof Error ? e.message : String(e)
              setImageErrors(prev => ({ ...prev, [i]: message }))
              if (DEBUG_IMAGES) console.error('[ui] image error', { index: i, message })
            } finally {
              // Update progress
              setImageProgress(prev => ({ ...prev, completed: prev.completed + 1 }))
            }
          })

          // Wait for all images in this batch to complete
          await Promise.allSettled(batchPromises)

          if (DEBUG_IMAGES) console.log('[ui] batch complete', { batchStart, batchEnd })
        }

        if (DEBUG_IMAGES) console.log('[ui] all images complete')
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

  // Study mode handlers
  const handleSaveCard = async (cardWord: string, isSaved: boolean) => {
    const cardId = cardWord.toLowerCase()

    if (!supabase) {
      toast.error('Cloud storage not configured')
      return
    }

    if (isSaved) {
      // Find the card data
      const cardData = previewCards.find(c => c.word.toLowerCase() === cardId)
      if (!cardData) {
        toast.error('Card data not found')
        return
      }

      try {
        // Save to Supabase
        const savedCard = await saveFlashcard({
          word: cardData.word,
          definition: cardData.definition || '',
          examples: cardData.examples || [],
          synonyms: cardData.synonyms || [],
          imageUrl: cardData.imageUrl,
          audioUrl: cardData.audioUrl,
        })

        // Update local state
        setSavedCardIds(prev => new Set(prev).add(savedCard.id))
        setSavedCardsData(prev => {
          const newMap = new Map(prev)
          newMap.set(savedCard.id, {
            word: savedCard.word,
            definition: savedCard.definition,
            examples: savedCard.examples,
            synonyms: savedCard.synonyms,
            imageUrl: savedCard.image_url,
            audioUrl: savedCard.audio_url,
            audioAvailable: !!savedCard.audio_url,
          })
          return newMap
        })
        setCardAddedDates(prev => {
          const newMap = new Map(prev)
          newMap.set(savedCard.id, new Date(savedCard.created_at).getTime())
          return newMap
        })

        toast.success(`Added to Study`)
      } catch (error) {
        console.error('Error saving card:', error)
        const message = error instanceof Error ? error.message : String(error)
        toast.error(`Failed to save card: ${message}`)
      }
    } else {
      // Find the card ID in saved cards by word
      let dbCardId: string | null = null
      for (const [id, card] of savedCardsData.entries()) {
        if (card.word.toLowerCase() === cardId) {
          dbCardId = id
          break
        }
      }

      if (!dbCardId) {
        toast.error('Card not found in saved cards')
        return
      }

      try {
        // Delete from Supabase
        await deleteFlashcard(dbCardId)

        // Update local state
        setSavedCardIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(dbCardId!)
          return newSet
        })
        setSavedCardsData(prev => {
          const newMap = new Map(prev)
          newMap.delete(dbCardId!)
          return newMap
        })
        setCardAddedDates(prev => {
          const newMap = new Map(prev)
          newMap.delete(dbCardId!)
          return newMap
        })

        toast.info(`Removed from Study`)
      } catch (error) {
        console.error('Error deleting card:', error)
        const message = error instanceof Error ? error.message : String(error)
        toast.error(`Failed to delete card: ${message}`)
      }
    }
  }

  const handleSaveAll = async () => {
    if (!previewCards.length) return

    if (!supabase) {
      toast.error('Cloud storage not configured')
      return
    }

    try {
      // Save all cards to Supabase
      const savePromises = previewCards.map(card =>
        saveFlashcard({
          word: card.word,
          definition: card.definition || '',
          examples: card.examples || [],
          synonyms: card.synonyms || [],
          imageUrl: card.imageUrl,
          audioUrl: card.audioUrl,
        })
      )

      const savedCards = await Promise.all(savePromises)

      // Update local state with all saved cards
      setSavedCardIds(prev => {
        const newSet = new Set(prev)
        savedCards.forEach(card => newSet.add(card.id))
        return newSet
      })

      setSavedCardsData(prev => {
        const newMap = new Map(prev)
        savedCards.forEach(card => {
          newMap.set(card.id, {
            word: card.word,
            definition: card.definition,
            examples: card.examples,
            synonyms: card.synonyms,
            imageUrl: card.image_url,
            audioUrl: card.audio_url,
            audioAvailable: !!card.audio_url,
          })
        })
        return newMap
      })

      setCardAddedDates(prev => {
        const newMap = new Map(prev)
        savedCards.forEach(card => {
          newMap.set(card.id, new Date(card.created_at).getTime())
        })
        return newMap
      })

      toast.success('All cards added to Study')
    } catch (error) {
      console.error('Error saving all cards:', error)
      const message = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save cards: ${message}`)
    }
  }

  const handleRegenerateImage = async (index: number) => {
    const card = flashcards[index]
    if (!card) {
      toast.error('Cannot regenerate image: card not found')
      return
    }

    const DEBUG_IMAGES = import.meta.env.VITE_DEBUG_IMAGES === 'true'
    const size = imageSize as '1024x1024' | '1792x1024' | '1024x1792'

    if (DEBUG_IMAGES) console.log('[ui] regenerating image with new concept', { index, word: card.word })

    setImageStatus(prev => ({ ...prev, [index]: 'pending' }))

    try {
      // Generate a NEW image prompt (different concept)
      if (DEBUG_IMAGES) console.log('[ui] generating new prompt', { index, word: card.word })
      const newPrompt = await createImagePrompt(card.word, {
        definition: card.definition,
        synonyms: card.synonyms,
        examples: card.examples,
        apiKey
      })

      if (!newPrompt) {
        setImageStatus(prev => ({ ...prev, [index]: 'failed' }))
        setImageErrors(prev => ({ ...prev, [index]: 'No prompt generated' }))
        toast.error('Failed to generate new image concept')
        return
      }

      // Update the card with the new prompt
      setFlashcards(prev => {
        const next = [...prev]
        next[index] = { ...next[index], imagePrompt: newPrompt }
        return next
      })

      if (DEBUG_IMAGES) console.log('[ui] new prompt generated, creating image', { index, promptLength: newPrompt.length })

      // Generate image with the new prompt
      const url = await generateImageFromPrompt(newPrompt, {
        apiKey,
        size,
        model: imageModel,
        style: imageStyle,
        quality: imageQuality
      })

      if (url) {
        setFlashcards(prev => {
          const next = [...prev]
          next[index] = { ...next[index], imageUrl: url }
          return next
        })
        setImageStatus(prev => ({ ...prev, [index]: 'success' }))
        setImageErrors(prev => ({ ...prev, [index]: '' }))
        toast.success('Image regenerated with new concept')
        if (DEBUG_IMAGES) console.log('[ui] image regeneration success', { index, len: url.length })
      } else {
        setImageStatus(prev => ({ ...prev, [index]: 'failed' }))
        setImageErrors(prev => ({ ...prev, [index]: 'No URL returned' }))
        toast.error('Failed to regenerate image: no URL returned')
        if (DEBUG_IMAGES) console.warn('[ui] image regeneration no url', { index })
      }
    } catch (e) {
      setImageStatus(prev => ({ ...prev, [index]: 'failed' }))
      const message = e instanceof Error ? e.message : String(e)
      setImageErrors(prev => ({ ...prev, [index]: message }))
      toast.error(`Failed to regenerate image: ${message}`)
      if (DEBUG_IMAGES) console.error('[ui] image regeneration error', { index, message })
    }
  }

  const handleToggleCardSelection = (cardId: string) => {
    setSelectedCardsForStudy(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) {
        newSet.delete(cardId)
      } else {
        newSet.add(cardId)
      }
      return newSet
    })
  }

  const handleSelectAllCards = () => {
    setSelectedCardsForStudy(new Set(savedCardIds))
  }

  const handleDeselectAllCards = () => {
    setSelectedCardsForStudy(new Set())
  }

  const handleDeleteCardFromStudy = async (cardId: string) => {
    try {
      // Delete from Supabase
      await deleteFlashcard(cardId)

      // Update local state - remove from all relevant Sets/Maps
      setSavedCardIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(cardId)
        return newSet
      })
      setSavedCardsData(prev => {
        const newMap = new Map(prev)
        newMap.delete(cardId)
        return newMap
      })
      setCardAddedDates(prev => {
        const newMap = new Map(prev)
        newMap.delete(cardId)
        return newMap
      })
      // Also remove from selected cards if it was selected
      setSelectedCardsForStudy(prev => {
        const newSet = new Set(prev)
        newSet.delete(cardId)
        return newSet
      })

      toast.success('Card deleted')
    } catch (error) {
      console.error('Error deleting card:', error)
      const message = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete card: ${message}`)
    }
  }

  const handleStartStudying = () => {
    if (selectedCardsForStudy.size === 0) {
      toast.error('Please select at least one card to study')
      return
    }
    const deck = Array.from(selectedCardsForStudy)
    setStudyDeck(deck)
    setCurrentCardIndex(0)
    setStillLearningCards(new Set(deck))
    setIsStudying(true)
    toast.success(`Starting study session with ${deck.length} cards`)
  }

  const handleMarkCard = (cardId: string, known: boolean) => {
    if (known) {
      setStillLearningCards(prev => {
        const newSet = new Set(prev)
        newSet.delete(cardId)
        return newSet
      })
      toast.success('Marked as Known')
    } else {
      toast.info('Marked as Still Learning')
    }

    const nextIndex = currentCardIndex + 1
    if (nextIndex >= studyDeck.length) {
      const updatedStillLearning = known
        ? new Set([...stillLearningCards].filter(id => id !== cardId))
        : stillLearningCards

      if (updatedStillLearning.size === 0) {
        toast.success('🎉 Study session complete! All cards mastered!')
        setIsStudying(false)
        setSelectedCardsForStudy(new Set())
      } else {
        const newDeck = Array.from(updatedStillLearning)
        setStudyDeck(newDeck)
        setCurrentCardIndex(0)
        toast.info(`Reviewing ${newDeck.length} cards you're still learning`)
      }
    } else {
      setCurrentCardIndex(nextIndex)
    }
  }

  const handleEndStudySession = () => {
    setIsStudying(false)
    setSelectedCardsForStudy(new Set())
    setStudyDeck([])
    setCurrentCardIndex(0)
    setStillLearningCards(new Set())
    toast.info('Study session ended')
  }

  const getSortedCards = () => {
    const cardsArray = Array.from(savedCardIds)
    if (sortBy === 'alphabetical') {
      return cardsArray.sort((a, b) => {
        const cardA = savedCardsData.get(a)
        const cardB = savedCardsData.get(b)
        const wordA = cardA?.word?.toLowerCase() || ''
        const wordB = cardB?.word?.toLowerCase() || ''
        return wordA.localeCompare(wordB)
      })
    } else {
      return cardsArray.sort((a, b) => {
        const dateA = cardAddedDates.get(a) || 0
        const dateB = cardAddedDates.get(b) || 0
        return dateB - dateA
      })
    }
  }

  const hasGeneratedCards = flashcards.length > 0

  const previewCards: PreviewCard[] = hasGeneratedCards
    ? flashcards.map((card) => ({
        word: card.word
          ? card.word.charAt(0).toUpperCase() + card.word.slice(1)
          : '',
        definition: card.definition,
        imageUrl: card.imageUrl,
        audioUrl: card.audioUrl,
        examples: Array.isArray(card.examples)
          ? card.examples.filter(Boolean)
          : typeof card.examples === 'string'
            ? [card.examples]
            : [],
        synonyms: Array.isArray(card.synonyms)
          ? card.synonyms.filter(Boolean)
          : typeof card.synonyms === 'string'
            ? [card.synonyms]
            : [],
        audioAvailable: Boolean(card.audioUrl),
      }))
    : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Toaster position="top-center" richColors />
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">FlashForge</h1>
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
        <div className="text-center mb-8">
          <h2 className="text-4xl mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Transform your word lists into stunning flashcards
          </h2>
          <p className="text-gray-600 max-w-3xl mx-auto">
            AI-powered flashcards complete with professional audio, vivid imagery, and contextual examples—perfectly formatted for Anki.
          </p>
        </div>

        {/* Mode Navigation */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center gap-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200">
            <button
              onClick={() => setActiveMode('create')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${
                activeMode === 'create'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <PlusCircle className="w-5 h-5" />
              <span className="font-medium">Create</span>
            </button>
            <button
              onClick={() => setActiveMode('study')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${
                activeMode === 'study'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="font-medium">Study</span>
            </button>
            <button
              onClick={() => setActiveMode('test')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${
                activeMode === 'test'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Brain className="w-5 h-5" />
              <span className="font-medium">Test</span>
            </button>
          </div>
        </div>

        {/* Create Mode Content */}
        {activeMode === 'create' && (
          <>
        {/* Main Input Card */}
        <Card className="p-8 mb-8 shadow-lg border-0 bg-white/90 backdrop-blur-sm">
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
              placeholder={'Enter words here, one per line...\n\nExample:\naberrant\nabstruse\nacumen\nalacrity'}
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
                      <option value="echo">echo</option>
                      <option value="fable">fable</option>
                      <option value="onyx">onyx</option>
                      <option value="nova">nova</option>
                      <option value="shimmer">shimmer</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white gap-2 transition-colors disabled:from-indigo-200 disabled:to-purple-200 disabled:text-white/80"
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

          {/* Progress Bar - Text Generation */}
          {isProcessing && progress.total > 0 && progress.completed < progress.total && (
            <div className="space-y-3 mt-6 p-4 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100">
              <div className="flex justify-between text-sm font-medium">
                <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Generating flashcards...</span>
                <span className="text-indigo-600">{progress.completed} of {progress.total}</span>
              </div>
              <Progress
                value={(progress.completed / progress.total) * 100}
                className="h-2 bg-indigo-100"
              />
            </div>
          )}

          {/* Progress Bar - Image Generation */}
          {isProcessing && imageProgress.total > 0 && imageProgress.completed < imageProgress.total && (
            <div className="space-y-3 mt-6 p-4 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100">
              <div className="flex justify-between text-sm font-medium">
                <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Generating images...</span>
                <span className="text-green-600">{imageProgress.completed} of {imageProgress.total}</span>
              </div>
              <Progress
                value={(imageProgress.completed / imageProgress.total) * 100}
                className="h-2 bg-green-100"
              />
            </div>
          )}
        </Card>

        {/* What's Included */}
        {!hasGeneratedCards && (
          <Card className="p-8 mb-12 shadow-lg border-0 bg-white/90 backdrop-blur-sm">
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
                  <p className="text-sm text-gray-900">Image-first backs that match Anki&apos;s media layout.</p>
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
        )}

        {/* Preview */}
        {hasGeneratedCards && (
          <section className="space-y-4 mb-16">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-2xl text-gray-900">Preview</h3>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={exportToAnki}
                >
                  <FileText className="w-4 h-4" />
                  Export TSV
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={exportToApkg}
                >
                  <Package className="w-4 h-4" />
                  Export Anki
                </Button>
                <Button
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 gap-2"
                  onClick={handleSaveAll}
                  disabled={previewCards.filter(card => !isWordSaved(card.word)).length === 0}
                >
                  <BookPlus className="w-4 h-4" />
                  Add All to Study
                </Button>
              </div>
            </div>

            {previewCards
              .filter(card => !isWordSaved(card.word))
              .map((card, filteredIndex) => {
                // Find the actual index in the flashcards array (case-insensitive)
                const actualIndex = flashcards.findIndex(fc =>
                  fc.word.toLowerCase() === card.word.toLowerCase()
                )
                return (
                  <FlashcardPreview
                    key={`${card.word}-${filteredIndex}`}
                    word={card.word}
                    definition={card.definition}
                    examples={card.examples}
                    synonyms={card.synonyms}
                    imageUrl={card.imageUrl}
                    audioUrl={card.audioUrl}
                    audioAvailable={card.audioAvailable}
                    isSaved={isWordSaved(card.word)}
                    onSave={(isSaved) => handleSaveCard(card.word, isSaved)}
                    isImageGenerating={imageStatus[actualIndex] === 'pending'}
                    onRegenerateImage={() => handleRegenerateImage(actualIndex)}
                  />
                )
              })}
          </section>
        )}
          </>
        )}

        {/* Study Mode Content */}
        {activeMode === 'study' && (
          <div className="space-y-6">
            {isLoadingSavedCards ? (
              <Card className="p-12 mb-8 shadow-lg border-0 bg-white/90 backdrop-blur-sm text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping"></div>
                    <div className="absolute inset-0 rounded-full bg-indigo-500/30 animate-pulse"></div>
                    <div className="absolute inset-2 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-white animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                  </div>
                  <p className="text-gray-600">Loading saved cards from cloud...</p>
                </div>
              </Card>
            ) : savedCardIds.size === 0 ? (
              <Card className="p-12 mb-8 shadow-lg border-0 bg-white/90 backdrop-blur-sm text-center">
                <BookOpen className="w-16 h-16 mx-auto mb-6 text-indigo-600" />
                <h3 className="text-2xl mb-4">No Cards Yet</h3>
                <p className="text-gray-600 max-w-2xl mx-auto mb-6">
                  Add flashcards from the Create tab to build your study collection. Click the <BookPlus className="w-4 h-4 inline-block mx-1" /> button on any card to add it here.
                </p>
                <Button
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                  onClick={() => setActiveMode('create')}
                >
                  Go to Create
                </Button>
              </Card>
            ) : isStudying ? (
              <>
                {/* Active Study Session */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl">Study Session</h3>
                      <p className="text-gray-600 mt-1">
                        Card {currentCardIndex + 1} of {studyDeck.length} • {stillLearningCards.size} still learning
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleEndStudySession}
                    >
                      End Session
                    </Button>
                  </div>

                  {/* Show current card */}
                  {studyDeck[currentCardIndex] && (() => {
                    const cardId = studyDeck[currentCardIndex]
                    const card = savedCardsData.get(cardId)
                    if (!card) return null

                    return (
                      <StudyCard
                        cardId={cardId}
                        word={card.word}
                        definition={card.definition}
                        imageUrl={card.imageUrl}
                        audioUrl={card.audioUrl}
                        audioAvailable={card.audioAvailable}
                        examples={card.examples}
                        synonyms={card.synonyms}
                        onMarkCard={handleMarkCard}
                      />
                    )
                  })()}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <h3 className="text-2xl text-gray-900">Word Bank ({savedCardIds.size} cards)</h3>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4 text-gray-500" />
                      <Select value={sortBy} onValueChange={(value: 'dateAdded' | 'alphabetical') => setSortBy(value)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dateAdded">Date Added</SelectItem>
                          <SelectItem value="alphabetical">Alphabetical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleSelectAllCards}
                      disabled={selectedCardsForStudy.size === savedCardIds.size}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDeselectAllCards}
                      disabled={selectedCardsForStudy.size === 0}
                    >
                      Deselect All
                    </Button>
                    <Button
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                      onClick={handleStartStudying}
                      disabled={selectedCardsForStudy.size === 0}
                    >
                      Start Studying ({selectedCardsForStudy.size})
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getSortedCards().map(cardId => {
                    const card = savedCardsData.get(cardId)
                    if (!card) return null

                    return (
                      <Card
                        key={cardId}
                        className="relative p-6 hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => handleToggleCardSelection(cardId)}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteCardFromStudy(cardId)
                          }}
                          className="absolute top-3 right-3 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete card"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="flex items-start gap-4">
                          <Checkbox
                            checked={selectedCardsForStudy.has(cardId)}
                            onCheckedChange={() => handleToggleCardSelection(cardId)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1">
                            <h4 className="text-xl mb-2 text-indigo-600">{card.word}</h4>
                            <p className="text-sm text-gray-600">
                              {card.definition?.split('.')[0] + '.'}
                            </p>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Test Mode Content */}
        {activeMode === 'test' && (
          <Card className="p-12 mb-8 shadow-lg border-0 bg-white/90 backdrop-blur-sm text-center">
            <Brain className="w-16 h-16 mx-auto mb-6 text-indigo-600" />
            <h3 className="text-2xl mb-4">Test Mode</h3>
            <p className="text-gray-600 max-w-2xl mx-auto mb-6">
              Challenge yourself! Test your knowledge with quizzes and track your progress.
            </p>
            <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
              Start Test
            </Button>
          </Card>
        )}
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
