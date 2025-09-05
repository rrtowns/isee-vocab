import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
});

export interface FlashcardContent {
  word: string;
  definition: string;
  examples: string[];
  synonyms: string[];
  difficulty?: string;
}

export interface OpenAIResponse {
  definition: string;
  examples: string[];
  synonyms: string[];
  difficulty: string;
}

/**
 * Generate flashcard content for a single word using OpenAI
 */
export async function generateFlashcardContent(word: string): Promise<FlashcardContent> {
  const prompt = `Create educational content for the word "${word}" suitable for a 10-year-old student preparing for the ISEE exam.

Please provide:
1. A simple, clear definition (1-2 sentences, age-appropriate)
2. Three example sentences using the word in different contexts
3. 3-4 synonyms or similar phrases
4. Difficulty level (easy, medium, or hard)

Format your response as JSON with this exact structure:
{
  "definition": "simple definition here",
  "examples": [
    "First example sentence with ${word}.",
    "Second example sentence with ${word}.",
    "Third example sentence with ${word}."
  ],
  "synonyms": ["synonym1", "synonym2", "synonym3", "phrase4"],
  "difficulty": "medium"
}

Make sure the definition is simple enough for a 10-year-old to understand, and the examples show the word used naturally.`;

  try {
    const completion = await openai.chat.completions.create({
      model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert educator who creates vocabulary materials for young students. Always respond with valid JSON only, no additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: parseInt(import.meta.env.VITE_OPENAI_MAX_TOKENS) || 1500,
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content received from OpenAI');
    }

    // Parse the JSON response
    const parsedContent: OpenAIResponse = JSON.parse(content);
    
    return {
      word,
      definition: parsedContent.definition,
      examples: parsedContent.examples,
      synonyms: parsedContent.synonyms,
      difficulty: parsedContent.difficulty
    };
  } catch (error) {
    console.error(`Error generating content for word "${word}":`, error);
    
    // Return fallback content if API fails
    return {
      word,
      definition: `A ${word} is... (OpenAI generation failed)`,
      examples: [
        `The ${word} was very important.`,
        `She showed great ${word} in her work.`,
        `This is an example of ${word}.`
      ],
      synonyms: ['similar word', 'related term', 'synonym'],
      difficulty: 'medium'
    };
  }
}

/**
 * Generate flashcard content for multiple words in batch
 */
export async function generateFlashcardsBatch(
  words: string[], 
  onProgress?: (completed: number, total: number) => void
): Promise<FlashcardContent[]> {
  const results: FlashcardContent[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    try {
      const content = await generateFlashcardContent(word);
      results.push(content);
      
      // Call progress callback
      if (onProgress) {
        onProgress(i + 1, words.length);
      }
      
      // Add a small delay to avoid rate limiting
      if (i < words.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Failed to process word "${word}":`, error);
      
      // Add fallback content for failed words
      results.push({
        word,
        definition: `Definition for ${word} (failed to generate)`,
        examples: [`Example with ${word}.`],
        synonyms: ['synonym'],
        difficulty: 'medium'
      });
    }
  }
  
  return results;
}

/**
 * Test OpenAI connection and API key
 */
export async function testOpenAIConnection(): Promise<boolean> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello, respond with just "OK"' }],
      max_tokens: 10
    });
    
    return !!completion.choices[0]?.message?.content;
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return false;
  }
}