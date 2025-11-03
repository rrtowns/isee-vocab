import { Card } from '@/components/ui/card'
import { Volume2, Image as ImageIcon } from 'lucide-react'

interface FlashcardPreviewProps {
  word: string
  definition?: string
  imageUrl?: string
  audioUrl?: string
  examples?: string[]
  synonyms?: string[]
  audioAvailable?: boolean
}

export function FlashcardPreview({
  word,
  definition,
  imageUrl,
  audioUrl,
  examples = [],
  synonyms = [],
  audioAvailable,
}: FlashcardPreviewProps) {
  const playAudio = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audio.play().catch(err => console.error('Error playing audio:', err))
    }
  }
  return (
    <div className="space-y-4">
      <Card className="p-6 shadow-lg border-0 bg-white/90 backdrop-blur-sm">
        <div className="px-3 py-1 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 rounded-full text-sm inline-block mb-4">
          FRONT
        </div>
        <div className="flex items-center gap-3">
          <h3 className="text-3xl text-gray-900">{word}</h3>
          {audioAvailable && (
            <button
              type="button"
              onClick={playAudio}
              aria-label={`Play pronunciation for ${word}`}
              className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 rounded-full flex items-center justify-center transition-all hover:scale-105"
            >
              <Volume2 className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </Card>

      <Card className="p-8 shadow-lg border-0 bg-white/90 backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-1 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 rounded-full text-sm inline-block mb-6">
          BACK
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-100 flex items-center justify-center">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={word}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full gap-3 py-10 text-gray-400">
                <ImageIcon className="w-10 h-10" />
                <span className="text-sm">Generated artwork preview</span>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {definition && (
              <div>
                <p className="text-gray-800">
                  <span className="font-semibold">{word}</span> {definition}
                </p>
              </div>
            )}

            {examples.length > 0 && (
              <div>
                <h4 className="text-sm text-gray-500 mb-3">Examples</h4>
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
                <h4 className="text-sm text-gray-500 mb-3">Synonyms</h4>
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
      </Card>
    </div>
  )
}
