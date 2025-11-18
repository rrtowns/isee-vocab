import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Cloud storage features will be disabled.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Database types
export interface FlashcardRow {
  id: string
  word: string
  definition: string
  examples: string[]
  synonyms: string[]
  difficulty?: string
  image_url?: string
  audio_url?: string
  created_at: string
  updated_at: string
}

export interface UserCardRow {
  id: string
  user_id: string
  flashcard_id: string
  saved_at: string
}

// Helper functions for flashcard operations
export async function saveFlashcard(flashcard: {
  word: string
  definition: string
  examples: string[]
  synonyms: string[]
  difficulty?: string
  imageUrl?: string
  audioUrl?: string
}) {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  // First, upload media files to storage if they exist
  let storedImageUrl: string | undefined
  let storedAudioUrl: string | undefined

  if (flashcard.imageUrl && flashcard.imageUrl.startsWith('data:')) {
    storedImageUrl = await uploadImage(flashcard.word, flashcard.imageUrl)
  }

  if (flashcard.audioUrl && flashcard.audioUrl.startsWith('data:')) {
    storedAudioUrl = await uploadAudio(flashcard.word, flashcard.audioUrl)
  }

  // Insert or update flashcard in database
  const { data, error } = await supabase
    .from('flashcards')
    .upsert({
      word: flashcard.word,
      definition: flashcard.definition,
      examples: flashcard.examples,
      synonyms: flashcard.synonyms,
      difficulty: flashcard.difficulty,
      image_url: storedImageUrl || flashcard.imageUrl,
      audio_url: storedAudioUrl || flashcard.audioUrl,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'word'
    })
    .select()
    .single()

  if (error) throw error
  return data as FlashcardRow
}

export async function getSavedFlashcards() {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  // For now, get all flashcards (later we'll filter by user)
  const { data, error } = await supabase
    .from('flashcards')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as FlashcardRow[]
}

export async function deleteFlashcard(id: string) {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  const { error } = await supabase
    .from('flashcards')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Storage helper functions
async function uploadImage(word: string, dataUrl: string): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  // Convert data URL to blob
  const response = await fetch(dataUrl)
  const blob = await response.blob()

  // Create filename
  const fileName = `${word.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('flashcard-images')
    .upload(fileName, blob, {
      contentType: 'image/png',
      upsert: false,
    })

  if (error) throw error

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('flashcard-images')
    .getPublicUrl(data.path)

  return publicUrl
}

async function uploadAudio(word: string, dataUrl: string): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  // Convert data URL to blob
  const response = await fetch(dataUrl)
  const blob = await response.blob()

  // Create filename
  const fileName = `${word.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.mp3`

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('flashcard-audio')
    .upload(fileName, blob, {
      contentType: 'audio/mpeg',
      upsert: false,
    })

  if (error) throw error

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('flashcard-audio')
    .getPublicUrl(data.path)

  return publicUrl
}
