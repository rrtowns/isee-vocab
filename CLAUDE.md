# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ISEE Vocabulary Flashcard Generator is a React + TypeScript + Vite web application that generates educational vocabulary flashcards for ISEE exam preparation. The app uses OpenAI's APIs to generate definitions, examples, synonyms, pronunciation audio, and illustrations, then exports the cards in Anki-compatible formats (.tsv/.zip or .apkg).

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Preview production build
npm run preview
```

## Architecture

### Key Components

**App.tsx** (`src/App.tsx`)
- Main application component managing flashcard generation workflow
- Handles state for word list input, API key configuration, generation options (images, audio, quality settings)
- Orchestrates the multi-step process: text generation → image prompt creation → image generation → audio generation
- Controls export to Anki formats

**OpenAI Service** (`src/services/openai.ts`)
- Centralized service for all OpenAI API interactions
- **Client caching**: Maintains a client cache keyed by API key to avoid recreating instances
- **Text generation**: `generateFlashcardContent()` creates definitions, examples, synonyms using chat completions with JSON mode
- **Image generation**: Multi-step process with fallback models
  - `generateVisualBrief()`: Creates a structured scene plan for better image prompts
  - `createImagePrompt()`: Builds detailed prompt incorporating visual brief
  - `generateImageFromPrompt()`: Attempts image generation with fallback (dall-e-3 → dall-e-2)
  - Returns base64 data URLs to avoid CORS issues
- **Audio generation**: `generatePronunciation()` uses TTS API to create pronunciation audio, returns base64 data URLs
- **Debug logging**: Controlled by `VITE_DEBUG`, `VITE_DEBUG_IMAGES` environment variables

**Anki Export** (`src/utils/ankiExport.ts`)
- **TSV Export**: Simple tab-separated format with HTML formatting for Anki import
- **ZIP Export**: `exportAnkiZip()` packages TSV + media files (images, audio) into a single .zip
- **APKG Export**: `exportAnkiApkg()` creates native Anki package using sql.js to build SQLite database
  - Lazy-loads sql.js and sql-wasm.wasm to avoid bundle bloat
  - Uses `BrowserApkgExporter` class to construct valid Anki2 collection database
  - Handles media files by embedding them in the .apkg archive
- **Media handling**: Converts data URLs to blobs, manages media file naming (slugified word names)

### State Management

- React `useState` for all application state (no external state library)
- Key state: `flashcards`, `wordList`, `isProcessing`, `progress`, `apiKey`, image/audio generation options
- LocalStorage for API key persistence
- Image generation status tracked per-card with `imageStatus` and `imageErrors` objects

### Data Flow

1. User inputs word list (manual or file upload)
2. User configures API key and generation options
3. Click "Generate Flashcards" triggers `processWords()`:
   - Validates API key with `verifyOpenAIKey()`
   - Generates text content for all words in batch
   - If images enabled: generates visual brief → creates prompt → generates image (sequentially per card)
   - If audio enabled: generates pronunciation for each word
4. Flashcards displayed with preview (front/back card layout)
5. User exports to .zip or .apkg format

### Configuration

**Environment Variables** (`.env.example`)
- `VITE_OPENAI_API_KEY`: API key (also stored in localStorage)
- `VITE_OPENAI_MODEL`: Chat model (default: gpt-4o-mini)
- `VITE_OPENAI_IMAGE_MODEL`: Image model (default: dall-e-3)
- `VITE_OPENAI_IMAGE_SIZE`: Image dimensions (default: 1024x1024)
- `VITE_OPENAI_IMAGE_STYLE`: natural|vivid (dall-e-3 only)
- `VITE_OPENAI_IMAGE_QUALITY`: standard|hd (dall-e-3 only)
- `VITE_OPENAI_TTS_MODEL`: TTS model (default: gpt-4o-mini-tts)
- `VITE_OPENAI_VOICE`: TTS voice (default: alloy)
- `VITE_DEBUG`: Enable general debug logging
- `VITE_DEBUG_IMAGES`: Enable image generation debug logging
- `VITE_DEBUG_ANKI`: Enable Anki export debug logging

**Import Alias**
- `@/` maps to `src/` directory (configured in `vite.config.ts`)

**Vite Optimization**
- `sql.js` and `anki-apkg-export` excluded from pre-bundling (lazy-loaded only when exporting .apkg)
- `sql-wasm.wasm` served from `public/` directory

## Important Implementation Details

### Image Generation Strategy
- Two-phase approach: first generate a "visual brief" (structured JSON with scene, subject, metaphor, colors) using chat model, then incorporate that into the final image prompt
- This produces more literal, kid-friendly illustrations
- Prompts explicitly exclude text, watermarks, and naive clipart
- Base64 data URLs used throughout to avoid CORS/fetch issues with media files

### Audio Generation
- Returns base64 data URLs (not blob URLs) for reliable packaging in zip/apkg
- Audio files named as slugified word + extension (e.g., `aberrant.mp3`)

### Anki Export Formats
- **TSV + ZIP**: Most reliable, user imports TSV file after extracting zip
- **APKG**: Native Anki format, more convenient but complex
  - Requires constructing a valid Anki2 SQLite database with proper schema
  - Media files referenced by numeric index (0, 1, 2...) in `media` JSON file
  - Falls back to TSV + ZIP if sql.js loading fails

### Error Handling
- Graceful degradation: if image/audio generation fails, card is still created without media
- Image generation tries multiple models in sequence (preferred → dall-e-3 → dall-e-2)
- API key validation uses model retrieval first, falls back to 1-token chat ping if restricted

### TypeScript
- Strict mode enabled
- Type definitions in `src/types/` for third-party libs (jszip)
- `FlashcardContent` interface is the core data structure used throughout the app

## Styling

- Tailwind CSS for all styling
- Dark theme with gradient background (slate colors)
- Radix UI components wrapped in `src/components/ui/` (button, card, input, progress, textarea)
- Card preview mimics Anki's front/back layout
