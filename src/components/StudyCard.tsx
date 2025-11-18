import { Card } from './ui/card';
import { useState, useEffect } from 'react';
import { Volume2, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { LoadingImage } from './LoadingImage';

interface StudyCardProps {
  cardId: string;
  word: string;
  definition?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioAvailable?: boolean;
  examples?: string[];
  synonyms?: string[];
  onMarkCard: (cardId: string, known: boolean) => void;
}

export function StudyCard({
  cardId,
  word,
  definition,
  imageUrl,
  audioUrl,
  audioAvailable,
  examples = [],
  synonyms = [],
  onMarkCard,
}: StudyCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [enableTransition, setEnableTransition] = useState(true);

  // Reset flip state when card changes (without animation)
  useEffect(() => {
    setEnableTransition(false);
    setIsFlipped(false);
    // Re-enable transition after a brief delay
    const timer = setTimeout(() => {
      setEnableTransition(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [cardId]);

  const handleMarkKnown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkCard(cardId, true);
  };

  const handleMarkStillLearning = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkCard(cardId, false);
  };

  const playAudio = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(err => console.error('Error playing audio:', err));
    }
  };

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
      <div className="space-y-4">
        <div className="w-full h-[500px]" style={{ perspective: '1000px' }}>
          <div
            className="relative w-full h-full cursor-pointer"
            onClick={() => setIsFlipped(!isFlipped)}
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transition: enableTransition ? 'transform 0.6s' : 'none',
            }}
          >
            {/* Front of Card */}
            <Card
              className="absolute top-0 left-0 w-full p-12 shadow-2xl border-0 bg-gradient-to-br from-white to-indigo-50/30 backdrop-blur-sm h-[500px] flex flex-col items-center justify-center"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                willChange: 'transform',
                zIndex: 2,
              }}
            >
              <div className="flex flex-col items-center gap-6">
                <h3 className="text-5xl text-center bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{word}</h3>
                {audioAvailable && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playAudio();
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

            {/* Back of Card */}
            <Card
              className="absolute top-0 left-0 w-full p-8 shadow-2xl border-0 bg-white/90 backdrop-blur-sm overflow-hidden h-[500px] flex flex-col"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                willChange: 'transform',
                zIndex: 1,
              }}
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
                  {/* Image */}
                  <div className="rounded-2xl overflow-hidden shadow-lg h-full">
                    <LoadingImage
                      src={imageUrl}
                      alt={word}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Content */}
                  <div className="space-y-4 overflow-y-auto pr-2">
                    {/* Definition */}
                    <div>
                      <p className="text-gray-800">
                        {renderDefinitionWithBoldWord()}
                      </p>
                    </div>

                    {/* Examples */}
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

                    {/* Synonyms */}
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

        {/* Know/Still Learning Buttons - Show only when flipped */}
        {isFlipped && (
          <div className="flex justify-center gap-4 mt-8">
            <Button
              onClick={handleMarkStillLearning}
              size="lg"
              className="gap-2 bg-yellow-500 hover:bg-yellow-600 text-white w-48"
            >
              <X className="w-5 h-5" />
              Still Learning
            </Button>
            <Button
              onClick={handleMarkKnown}
              size="lg"
              className="gap-2 bg-gradient-to-br from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white w-48"
            >
              <Check className="w-5 h-5" />
              Know
            </Button>
          </div>
        )}
      </div>
    );
}
