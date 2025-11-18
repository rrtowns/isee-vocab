import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Volume2, BookPlus, RefreshCw } from 'lucide-react'
import { LoadingImage } from './LoadingImage'

interface FlashcardPreviewProps {
  word: string
  definition?: string
  imageUrl?: string
  audioUrl?: string
  examples?: string[]
  synonyms?: string[]
  audioAvailable?: boolean
  isSaved?: boolean
  onSave?: (isSaved: boolean) => void
  isImageGenerating?: boolean
  onRegenerateImage?: () => void
}

export function FlashcardPreview({
  word,
  definition,
  imageUrl,
  audioUrl,
  examples = [],
  synonyms = [],
  audioAvailable,
  isSaved = false,
  onSave,
  isImageGenerating = false,
  onRegenerateImage,
}: FlashcardPreviewProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [isHoveringImage, setIsHoveringImage] = useState(false)

  const playAudio = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audio.play().catch(err => console.error('Error playing audio:', err))
    }
  }

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSave?.(!isSaved)
  }

  const handleRegenerateImage = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRegenerateImage?.()
  }

  // Helper function to render definition with word bolded
  const renderDefinitionWithBoldWord = () => {
    if (!definition) return null;

    // Case-insensitive search for the word in the definition
    const regex = new RegExp(`\\b(${word})\\b`, 'i');
    const match = definition.match(regex);

    if (match) {
      const parts = definition.split(regex);
      return (
        <>
          {parts.map((part, index) => {
            // If this part matches the word (case-insensitive), bold it
            if (index % 2 === 1) {
              return <span key={index} className="font-semibold">{part}</span>;
            }
            return <span key={index}>{part}</span>;
          })}
        </>
      );
    }

    return definition;
  };

  return (
    <div className="w-full h-[500px]" style={{ perspective: '1000px' }}>
      <div
        className="relative w-full h-full cursor-pointer"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: 'transform 0.6s',
        }}
        onClick={handleFlip}
      >
        {/* Front of card */}
        <Card
          className="absolute top-0 left-0 w-full p-12 shadow-lg border-0 bg-gradient-to-br from-white to-indigo-50/30 backdrop-blur-sm h-[500px] flex flex-col items-center justify-center"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {/* Add to Study Button */}
          {onSave && (
            <button
              onClick={handleSave}
              className={`absolute top-6 right-6 p-3 rounded-full transition-all shadow-lg ${
                isSaved
                  ? 'bg-gradient-to-br from-green-500 to-emerald-500 text-white'
                  : 'bg-white hover:bg-gray-50 text-gray-600 hover:text-indigo-600'
              }`}
              title={isSaved ? 'Remove from Study' : 'Add to Study'}
            >
              <BookPlus className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          )}

          <div className="flex flex-col items-center gap-6">
            <h3
              className="text-5xl text-center"
              style={{
                color: 'rgb(79 70 229)',
                paddingBottom: '0.5rem',
                paddingTop: '0.5rem',
                display: 'inline-block',
                lineHeight: '2',
                overflow: 'visible'
              }}
            >{word}</h3>
            {audioAvailable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playAudio()
                }}
                aria-label={`Play pronunciation for ${word}`}
                className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-lg"
              >
                <Volume2 className="w-7 h-7 text-white" />
              </button>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-12 text-center">Click to reveal definition</p>
        </Card>

        {/* Back of card */}
        <Card
          className="absolute top-0 left-0 w-full p-8 shadow-lg border-0 bg-white/90 backdrop-blur-sm overflow-hidden h-[500px] flex flex-col"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
            <div
              className="rounded-2xl overflow-hidden shadow-lg h-full relative group"
              onMouseEnter={() => setIsHoveringImage(true)}
              onMouseLeave={() => setIsHoveringImage(false)}
            >
              <LoadingImage
                src={imageUrl}
                alt={word}
                className="w-full h-full object-cover"
                isGenerating={isImageGenerating}
              />
              {onRegenerateImage && !isImageGenerating && isHoveringImage && (
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center cursor-pointer transition-all"
                  onClick={handleRegenerateImage}
                >
                  <div className="flex flex-col items-center gap-2 text-white">
                    <RefreshCw className="w-12 h-12" />
                    <span className="text-sm font-medium">Regenerate Image</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 overflow-y-auto pr-2">
              {definition && (
                <div>
                  <p className="text-gray-800">
                    {renderDefinitionWithBoldWord()}
                  </p>
                </div>
              )}

              {examples.length > 0 && (
                <div>
                  <h4 className="text-sm text-gray-500 mb-2">Examples</h4>
                  <ul className="space-y-2">
                    {examples.map((example, index) => (
                      <li key={index} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-indigo-500 flex-shrink-0">•</span>
                        <span>{example}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {synonyms.length > 0 && (
                <div>
                  <h4 className="text-sm text-gray-500 mb-2">Synonyms</h4>
                  <div className="flex flex-wrap gap-2">
                    {synonyms.map((synonym, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 rounded-full text-sm border border-gray-200"
                      >
                        {synonym}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-400 mt-4 text-center flex-shrink-0">Click to flip back</p>
        </Card>
      </div>
    </div>
  )
}
