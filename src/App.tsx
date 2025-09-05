import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileText, Sparkles, Download } from 'lucide-react'

function App() {
  const [wordList, setWordList] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [flashcards, setFlashcards] = useState<any[]>([])
  
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
    setIsProcessing(true)
    // Parse word list (one word per line)
    const words = wordList
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0)
    
    console.log('Processing words:', words)
    
    // TODO: Call API to generate flashcard content
    // For now, just create placeholder data
    const placeholderCards = words.map(word => ({
      word,
      definition: `Definition for ${word}`,
      examples: [`Example sentence with ${word}`],
      synonyms: ['synonym1', 'synonym2'],
      imageUrl: null,
      audioUrl: null
    }))
    
    setFlashcards(placeholderCards)
    setIsProcessing(false)
  }
  
  const exportToAnki = () => {
    // TODO: Implement Anki export
    console.log('Exporting to Anki:', flashcards)
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
                {isProcessing ? 'Processing...' : 'Generate Flashcards'}
              </Button>
            </div>
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
                  <div key={index} className="p-4 border rounded-lg space-y-2">
                    <h3 className="font-semibold text-lg">{card.word}</h3>
                    <p className="text-sm text-muted-foreground">{card.definition}</p>
                    <div className="text-sm">
                      <span className="font-medium">Example: </span>
                      {card.examples[0]}
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
                <span>2-3 example sentences for context</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🖼️</span>
                <span>Square illustrations for visual memory</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🔊</span>
                <span>Audio pronunciation for each word</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🔄</span>
                <span>Synonyms and related phrases</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📚</span>
                <span>Ready-to-import Anki deck format</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App