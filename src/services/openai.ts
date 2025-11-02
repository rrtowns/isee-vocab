import OpenAI from 'openai';

// Debug flags
const DEBUG: boolean = (import.meta.env.VITE_DEBUG as any) !== 'false';

// Cache for OpenAI clients
const clientCache = new Map<string, OpenAI>();

function getOpenAIClient(apiKey?: string): OpenAI {
  const key = apiKey || import.meta.env.VITE_OPENAI_API_KEY || 'sk-placeholder';
  
  if (!clientCache.has(key)) {
    if (DEBUG) console.log('[openai] creating client (cache miss), keySuffix=', key.slice(-4));
    clientCache.set(key, new OpenAI({
      apiKey: key,
      dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
    }));
  }
  
  if (DEBUG) console.log('[openai] reusing client (cache hit), keySuffix=', key.slice(-4));
  return clientCache.get(key)!;
}

// Debug logging helper for image generation
const IMG_DEBUG: boolean = (import.meta.env.VITE_DEBUG_IMAGES as any) !== 'false';
function logImage(...args: any[]) {
  if (IMG_DEBUG) console.log('[images]', ...args);
}
function describeError(err: any): string {
  try {
    const status = (err as any)?.status ?? (err as any)?.response?.status;
    const code = (err as any)?.code ?? (err as any)?.response?.data?.error?.code;
    const type = (err as any)?.type ?? (err as any)?.response?.data?.error?.type;
    const message = (err as any)?.message ?? (err as any)?.response?.data?.error?.message;
    return `status=${status ?? 'n/a'} code=${code ?? 'n/a'} type=${type ?? 'n/a'} message=${message ?? 'n/a'}`;
  } catch {
    return String(err);
  }
}

export interface FlashcardContent {
  word: string;
  definition: string;
  examples: string[];
  synonyms: string[];
  difficulty?: string;
  imageUrl?: string;
  imagePrompt?: string;
  audioUrl?: string;
}

export interface OpenAIResponse {
  definition: string;
  examples: string[];
  synonyms: string[];
  difficulty: string;
}

// Visual brief for improving image generation
interface VisualBrief {
  scene?: string;
  main_subject?: string;
  background?: string;
  objects?: string[];
  colors?: string[];
  metaphor?: string;
  style?: string;
}

/**
 * Generate flashcard content for a single word using OpenAI
 */
export async function generateFlashcardContent(word: string, apiKey?: string): Promise<FlashcardContent> {
  const prompt = `Create educational content for the word "${word}" suitable for a 10-year-old student preparing for the ISEE exam.

Please provide:
1. A simple, clear definition (1–2 sentences, age-appropriate)
2. Four short, natural example sentences using the word in different contexts
3. 6–10 synonyms or short phrases (no duplicates)
4. Difficulty level (easy, medium, or hard)

Return JSON ONLY with this exact structure:
{
  "definition": "simple definition here",
  "examples": [
    "Example sentence 1.",
    "Example sentence 2.",
    "Example sentence 3.",
    "Example sentence 4."
  ],
  "synonyms": ["synonym1", "synonym2", "synonym3", "synonym4", "synonym5"],
  "difficulty": "medium"
}`;

  try {
    const completion = await getOpenAIClient(apiKey).chat.completions.create({
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
      response_format: { type: 'json_object' },
      max_tokens: parseInt(import.meta.env.VITE_OPENAI_MAX_TOKENS) || 1500,
      temperature: 0.7,
    });

    let content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('No content received from OpenAI');
    }

    // Clean potential code fences and parse JSON response
    const cleaned = stripJSONFences(content);
    let parsedContent: OpenAIResponse;
    try {
      parsedContent = JSON.parse(cleaned);
    } catch (e) {
      // Heuristic fallback: try to extract the first JSON object substring
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw e;
      parsedContent = JSON.parse(match[0]);
    }
    
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
  onProgress?: (completed: number, total: number) => void,
  apiKey?: string,
  opts?: {
    generateImages?: boolean;
    imageSize?: string;
    onImage?: (index: number, status: 'pending' | 'success' | 'failed', url?: string) => void;
    generateAudio?: boolean;
    voice?: string;
  }
): Promise<FlashcardContent[]> {
  const results: FlashcardContent[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    try {
      if (IMG_DEBUG) console.log('[cards] generating text', { index: i, word });
      const content = await generateFlashcardContent(word, apiKey);
      // Optionally generate an image for the word using the definition as context
      if (opts?.generateImages) {
        try {
          opts?.onImage?.(i, 'pending');
          const imageUrl = await generateIllustration(word, content.definition, { apiKey, size: opts?.imageSize });
          if (imageUrl) {
            content.imageUrl = imageUrl;
            opts?.onImage?.(i, 'success', imageUrl);
            logImage('success', { index: i, word, len: imageUrl.length });
          } else {
            opts?.onImage?.(i, 'failed');
            logImage('no-url-returned', { index: i, word });
          }
        } catch (e) {
          console.warn(`Image generation failed for "${word}":`, describeError(e));
          opts?.onImage?.(i, 'failed');
        }
      }

      // Optionally generate audio pronunciation
      if (opts?.generateAudio) {
        try {
          const url = await generatePronunciation(word, { apiKey, voice: opts.voice });
          if (url) content.audioUrl = url;
        } catch (e) {
          console.warn(`[audio] pronunciation failed for "${word}":`, describeError(e));
        }
      }
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

// Utility: remove surrounding ``` or ```json fences that some models add
function stripJSONFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    // Remove starting fence with optional language
    t = t.replace(/^```(?:json)?\s*/i, '');
    // Remove trailing fence
    t = t.replace(/```\s*$/i, '');
  }
  return t.trim();
}

// Build a child-friendly image prompt summarizing the word meaning
function buildImagePrompt(
  word: string,
  definition?: string,
  extras?: { synonyms?: string[]; examples?: string[] }
): string {
  const baseMeaning = definition
    ? `Meaning: ${definition}`
    : `Meaning: Depict the core idea of the word.`;
  const syn = extras?.synonyms && extras.synonyms.length
    ? `Synonyms: ${extras.synonyms.slice(0, 8).join(', ')}.`
    : '';
  const ex = extras?.examples && extras.examples.length
    ? `Context hints: ${extras.examples.slice(0, 2).join(' ')}`
    : '';

  return `Create a square, high‑quality image that clearly represents the word "${word}".
${baseMeaning}
${syn}
${ex}

Requirements:
- Make the meaning obvious at a glance using a concrete scene with clear subject(s).
- No text or handwriting anywhere (no letters, words, logos, signatures, or watermarks).
- Avoid naive doodles or clipart; choose the most effective style for this word: realistic photo, painterly illustration, or clean vector art.
- If the word is abstract, use a clear visual metaphor (e.g., one fish swimming against a school; one path diverging from a crowd).
- Center the main subject and keep the background simple with warm, high‑contrast colors.
- Keep it appropriate for a 10‑year‑old.`;
}

// Public helper: build final prompt (including visual brief) without generating an image
export async function createImagePrompt(
  word: string,
  params: { definition?: string; synonyms?: string[]; examples?: string[]; apiKey?: string }
): Promise<string> {
  const brief = await generateVisualBrief(word, {
    definition: params.definition,
    synonyms: params.synonyms,
    examples: params.examples,
    apiKey: params.apiKey,
  });
  let prompt = buildImagePrompt(word, params.definition, { synonyms: params.synonyms, examples: params.examples });
  if (brief) {
    const details: string[] = [];
    if (brief.metaphor) details.push(`Metaphor: ${brief.metaphor}.`);
    if (brief.scene) details.push(`Scene: ${brief.scene}.`);
    if (brief.main_subject) details.push(`Main subject: ${brief.main_subject}.`);
    if (brief.background) details.push(`Background: ${brief.background}.`);
    if (brief.objects?.length) details.push(`Key objects: ${brief.objects.join(', ')}.`);
    if (brief.colors?.length) details.push(`Color palette: ${brief.colors.join(', ')}.`);
    prompt += `\nFollow this scene plan:\n- ${details.join('\n- ')}\n`;
  }
  return prompt;
}

// Public helper: generate image from a previously created prompt
export async function generateImageFromPrompt(
  prompt: string,
  params?: { apiKey?: string; size?: string; model?: string; style?: 'natural' | 'vivid'; quality?: 'standard' | 'hd' }
): Promise<string | null> {
  const preferred = params?.model || (import.meta.env.VITE_OPENAI_IMAGE_MODEL as string) || 'dall-e-3';
  const size = (params?.size as string) || (import.meta.env.VITE_OPENAI_IMAGE_SIZE as string) || '1024x1024';
  const client = getOpenAIClient(params?.apiKey);
  const models = Array.from(new Set([preferred, 'dall-e-3', 'dall-e-2'])) as string[];
  logImage('generateImageFromPrompt start', { preferred, candidates: models, size });
  logImage('prompt', prompt.slice(0, 200) + (prompt.length > 200 ? '…' : ''));
  for (const model of models) {
    try {
      const req: any = { model };
      if (model === 'dall-e-3') {
        const allowed = new Set(['1024x1024','1024x1792','1792x1024']);
        req.size = allowed.has(size) ? size : '1024x1024';
        req.style = params?.style || (import.meta.env.VITE_OPENAI_IMAGE_STYLE as string) || 'natural';
        req.quality = params?.quality || (import.meta.env.VITE_OPENAI_IMAGE_QUALITY as string) || 'hd';
        req.response_format = 'b64_json';
        req.prompt = prompt;
      } else if (model === 'dall-e-2') {
        const max = 980;
        req.size = size;
        req.prompt = prompt.length > max ? (prompt.slice(0, max) + '…') : prompt;
        req.response_format = 'b64_json';
      } else {
        const allowed = new Set(['1024x1024','1024x1536','1536x1024','auto']);
        req.size = allowed.has(size) ? size : '1024x1024';
        req.response_format = 'b64_json';
        req.prompt = prompt;
      }
      logImage('attempt (from prompt)', { model, size: req.size, style: req.style, quality: req.quality });
      const image = await client.images.generate(req);
      const b64 = (image as any)?.data?.[0]?.b64_json;
      const url = (image as any)?.data?.[0]?.url;
      if (b64) return `data:image/png;base64,${b64}`;
      if (url) return url;
    } catch (e) {
      console.warn('[images] attempt (from prompt) failed', { model, err: describeError(e) });
    }
  }
  logImage('no image produced from prompt');
  return null;
}

// Ask a text model for a concise visual brief to ground the image
async function generateVisualBrief(
  word: string,
  params: { definition?: string; synonyms?: string[]; examples?: string[]; apiKey?: string }
): Promise<VisualBrief | null> {
  try {
    const system = 'You are a visual prompt planner for children\'s picture-book style illustrations. Respond with valid JSON only.';
    const user = `Create a compact visual brief for the word "${word}".
${params.definition ? `Meaning: ${params.definition}` : ''}
${params.synonyms && params.synonyms.length ? `Synonyms: ${params.synonyms.slice(0,8).join(', ')}` : ''}
${params.examples && params.examples.length ? `Examples: ${params.examples.slice(0,2).join(' ')}` : ''}

Return JSON with exactly these keys:
{
  "scene": "one sentence scene",
  "main_subject": "who/what is centered",
  "background": "short environment description",
  "objects": ["3-6 concrete objects"],
  "colors": ["3-5 colors"],
  "metaphor": "clear visual metaphor if word is abstract",
  "style": "picture-book"
}`;

    const completion = await getOpenAIClient(params.apiKey).chat.completions.create({
      model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      temperature: 0.3,
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return null;
    const cleaned = stripJSONFences(content);
    return JSON.parse(cleaned) as VisualBrief;
  } catch (err) {
    console.warn('[images] visual brief failed:', describeError(err));
    return null;
  }
}

// Generate an illustration using OpenAI Images API and return a data URL
export async function generateIllustration(
  word: string,
  definition?: string,
  params?: { apiKey?: string; size?: string; model?: string; synonyms?: string[]; examples?: string[]; style?: 'natural' | 'vivid'; quality?: 'standard' | 'hd' }
): Promise<string | null> {
  // Generate a brief to make scenes more literal and kid-friendly
  const brief = await generateVisualBrief(word, {
    definition,
    synonyms: params?.synonyms,
    examples: params?.examples,
    apiKey: params?.apiKey,
  });
  let prompt = buildImagePrompt(word, definition, { synonyms: params?.synonyms, examples: params?.examples });
  if (brief) {
    const details: string[] = [];
    if (brief.metaphor) details.push(`Metaphor: ${brief.metaphor}.`);
    if (brief.scene) details.push(`Scene: ${brief.scene}.`);
    if (brief.main_subject) details.push(`Main subject: ${brief.main_subject}.`);
    if (brief.background) details.push(`Background: ${brief.background}.`);
    if (brief.objects?.length) details.push(`Key objects: ${brief.objects.join(', ')}.`);
    if (brief.colors?.length) details.push(`Color palette: ${brief.colors.join(', ')}.`);
    prompt += `\nFollow this scene plan:\n- ${details.join('\n- ')}\n`;
  }
  const preferred = params?.model || (import.meta.env.VITE_OPENAI_IMAGE_MODEL as string) || 'dall-e-3';
  const size = (params?.size as string) || (import.meta.env.VITE_OPENAI_IMAGE_SIZE as string) || '1024x1024';
  const client = getOpenAIClient(params?.apiKey);
  const models = Array.from(new Set([preferred, 'dall-e-3', 'dall-e-2'])) as string[];
  logImage('generateIllustration start', { word, preferred, candidates: models, size });
  logImage('prompt', prompt.slice(0, 200) + (prompt.length > 200 ? '…' : ''));
  for (const model of models) {
    try {
      // Prepare request tailored per model
      const req: any = { model };
      // DALL·E 3 supports only specific sizes and style/quality
      if (model === 'dall-e-3') {
        const allowed = new Set(['1024x1024','1024x1792','1792x1024']);
        req.size = allowed.has(size) ? size : '1024x1024';
        req.style = params?.style || (import.meta.env.VITE_OPENAI_IMAGE_STYLE as string) || 'natural';
        req.quality = params?.quality || (import.meta.env.VITE_OPENAI_IMAGE_QUALITY as string) || 'hd';
        req.response_format = 'b64_json';
        req.prompt = prompt;
      } else if (model === 'dall-e-2') {
        // DALL·E 2 has a short prompt limit (~1000 chars); truncate politely
        const max = 980;
        req.size = size; // supports 256/512/1024
        req.prompt = prompt.length > max ? (prompt.slice(0, max) + '…') : prompt;
        req.response_format = 'b64_json';
      } else {
        // gpt-image-1: no style/quality here; restrict size to supported set
        const allowed = new Set(['1024x1024','1024x1536','1536x1024','auto']);
        req.size = allowed.has(size) ? size : '1024x1024';
        req.response_format = 'b64_json';
        req.prompt = prompt;
      }
      logImage('attempt', { model, size: req.size, style: req.style, quality: req.quality });
      const image = await client.images.generate(req);
      const b64 = (image as any)?.data?.[0]?.b64_json;
      const url = (image as any)?.data?.[0]?.url;
      logImage('result', { model, hasB64: !!b64, hasUrl: !!url, b64Len: b64?.length });
      if (b64) return `data:image/png;base64,${b64}`;
      if (url) return url;
      // If neither present, try next model
    } catch (e) {
      console.warn('[images] attempt failed', { model, err: describeError(e) });
      // Try the next model
    }
  }
  logImage('no image data returned after fallbacks', { word });
  return null;
}

// Same as generateIllustration but also returns the exact prompt used
export async function generateIllustrationWithPrompt(
  word: string,
  definition?: string,
  params?: { apiKey?: string; size?: string; model?: string; synonyms?: string[]; examples?: string[]; style?: 'natural' | 'vivid'; quality?: 'standard' | 'hd' }
): Promise<{ url: string | null; prompt: string }>
{
  // Generate a brief to make scenes more literal and kid-friendly
  const brief = await generateVisualBrief(word, {
    definition,
    synonyms: params?.synonyms,
    examples: params?.examples,
    apiKey: params?.apiKey,
  });
  let prompt = buildImagePrompt(word, definition, { synonyms: params?.synonyms, examples: params?.examples });
  if (brief) {
    const details: string[] = [];
    if (brief.metaphor) details.push(`Metaphor: ${brief.metaphor}.`);
    if (brief.scene) details.push(`Scene: ${brief.scene}.`);
    if (brief.main_subject) details.push(`Main subject: ${brief.main_subject}.`);
    if (brief.background) details.push(`Background: ${brief.background}.`);
    if (brief.objects?.length) details.push(`Key objects: ${brief.objects.join(', ')}.`);
    if (brief.colors?.length) details.push(`Color palette: ${brief.colors.join(', ')}.`);
    prompt += `\nFollow this scene plan:\n- ${details.join('\n- ')}\n`;
  }

  const preferred = params?.model || (import.meta.env.VITE_OPENAI_IMAGE_MODEL as string) || 'dall-e-3';
  const size = (params?.size as string) || (import.meta.env.VITE_OPENAI_IMAGE_SIZE as string) || '1024x1024';
  const client = getOpenAIClient(params?.apiKey);
  const models = Array.from(new Set([preferred, 'dall-e-3', 'dall-e-2'])) as string[];
  logImage('generateIllustration start', { word, preferred, candidates: models, size });
  logImage('prompt', prompt.slice(0, 200) + (prompt.length > 200 ? '…' : ''));
  for (const model of models) {
    try {
      // Prepare request tailored per model
      const req: any = { model };
      if (model === 'dall-e-3') {
        const allowed = new Set(['1024x1024','1024x1792','1792x1024']);
        req.size = allowed.has(size) ? size : '1024x1024';
        req.style = params?.style || (import.meta.env.VITE_OPENAI_IMAGE_STYLE as string) || 'natural';
        req.quality = params?.quality || (import.meta.env.VITE_OPENAI_IMAGE_QUALITY as string) || 'hd';
        req.prompt = prompt;
      } else if (model === 'dall-e-2') {
        const max = 980;
        req.size = size;
        req.prompt = prompt.length > max ? (prompt.slice(0, max) + '…') : prompt;
      } else {
        const allowed = new Set(['1024x1024','1024x1536','1536x1024','auto']);
        req.size = allowed.has(size) ? size : '1024x1024';
        req.prompt = prompt;
      }
      logImage('attempt', { model, size: req.size, style: req.style, quality: req.quality });
      const image = await client.images.generate(req);
      const b64 = (image as any)?.data?.[0]?.b64_json;
      const url = (image as any)?.data?.[0]?.url;
      logImage('result', { model, hasB64: !!b64, hasUrl: !!url, b64Len: b64?.length });
      if (b64) return { url: `data:image/png;base64,${b64}`, prompt };
      if (url) return { url, prompt };
    } catch (e) {
      console.warn('[images] attempt failed', { model, err: describeError(e) });
    }
  }
  logImage('no image data returned after fallbacks', { word });
  return { url: null, prompt };
}

/**
 * Test OpenAI connection and API key
 */
export async function verifyOpenAIKey(apiKey?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Fast check: can we retrieve a common model? (less tokens than a chat call)
    const client = getOpenAIClient(apiKey);
    try {
      if (DEBUG) console.log('[verify] retrieving model gpt-4o-mini');
      await client.models.retrieve('gpt-4o-mini');
      if (DEBUG) console.log('[verify] model reachable');
      return { ok: true };
    } catch (e) {
      // If model access is restricted, fall back to a 1‑token chat ping to surface clearer errors
      try {
        if (DEBUG) console.log('[verify] fallback to 1-token chat ping');
        const completion = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'OK' }],
          max_tokens: 1,
        });
        const ok = !!completion.choices[0]?.message?.content;
        if (DEBUG) console.log('[verify] chat ping result ok=', ok);
        return { ok };
      } catch (ee) {
        const err = describeError(ee);
        if (DEBUG) console.warn('[verify] chat ping failed', err);
        return { ok: false, error: err };
      }
    }
  } catch (error) {
    const msg = describeError(error);
    console.error('OpenAI key verification failed:', msg);
    return { ok: false, error: msg };
  }
}

// Backwards compatibility for components calling the old function
export async function testOpenAIConnection(apiKey?: string): Promise<boolean> {
  const res = await verifyOpenAIKey(apiKey);
  return res.ok;
}

/**
 * Generate a short pronunciation audio for the given word.
 * Returns a blob URL (e.g., to use in an <audio> tag).
 */
export async function generatePronunciation(
  word: string,
  params?: { apiKey?: string; voice?: string; format?: 'mp3' | 'wav' | 'ogg' }
): Promise<string | null> {
  try {
    const client = getOpenAIClient(params?.apiKey);
    const voice = params?.voice || (import.meta.env.VITE_OPENAI_VOICE as string) || 'alloy';
    const format = params?.format || 'mp3';
    if (DEBUG) console.log('[audio] request', { word, voice, format });
    const response: any = await (client as any).audio.speech.create({
      model: (import.meta.env.VITE_OPENAI_TTS_MODEL as string) || 'gpt-4o-mini-tts',
      voice,
      input: word,
      format,
    } as any);
    const ab = await response.arrayBuffer();
    const type = format === 'wav' ? 'audio/wav' : format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
    // Convert to base64 data URL for reliable zipping without extra fetch
    const bytes = new Uint8Array(ab);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    const dataUrl = `data:${type};base64,${b64}`;
    if (DEBUG) console.log('[audio] success', { bytes: (ab as ArrayBuffer).byteLength, type });
    return dataUrl;
  } catch (e) {
    console.warn('[audio] failed', describeError(e));
    return null;
  }
}
