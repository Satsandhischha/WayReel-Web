import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_DIR = path.join(os.tmpdir(), 'wayreel-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_SIZE_BYTES = 45 * 1024 * 1024; // 45 MB max per upload
const MAX_SCREENSHOTS = 6;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    cb(null, `wayreel-${unique}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: MAX_SCREENSHOTS,
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    if (mime.startsWith('image/') || mime.startsWith('video/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image screenshots or screen-recording videos are supported.'));
  },
});

interface RawExtractedPlace {
  name?: string;
  city?: string;
  country?: string;
  category?: string;
  note?: string;
  tags?: string[];
  confidence?: number;
  source?: string;
}

interface GeocodedCoordinates {
  lat: number;
  lng: number;
  approximate: boolean;
}

const VALID_SOURCES = new Set(['caption', 'hashtags', 'audio', 'on-screen text']);

function normalizeSource(src: string | undefined): 'caption' | 'hashtags' | 'audio' | 'on-screen text' {
  const lower = (src ?? '').toLowerCase().trim();
  if (VALID_SOURCES.has(lower)) {
    return lower as 'caption' | 'hashtags' | 'audio' | 'on-screen text';
  }
  if (lower.includes('hashtag')) return 'hashtags';
  if (lower.includes('audio') || lower.includes('speech') || lower.includes('voice')) return 'audio';
  if (lower.includes('screen') || lower.includes('video') || lower.includes('image') || lower.includes('text')) {
    return 'on-screen text';
  }
  return 'caption';
}

function validateOptionalUrl(raw: string): { valid: boolean; cleaned: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, cleaned: '' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, cleaned: '' };
    }
    return { valid: true, cleaned: parsed.toString().slice(0, 500) };
  } catch {
    return { valid: false, cleaned: '' };
  }
}

async function waitForGeminiFileActive(fileName: string): Promise<void> {
  const maxAttempts = 40;
  for (let i = 0; i < maxAttempts; i += 1) {
    const current = await ai.files.get({ name: fileName });
    if (current.state === 'ACTIVE') {
      return;
    }
    if (current.state === 'FAILED') {
      throw new Error('Uploaded video could not be processed by Gemini.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('Timed out waiting for uploaded video to finish processing.');
}

async function geocodeWithOpenStreetMap(
  name: string,
  city: string,
  country: string
): Promise<GeocodedCoordinates | null> {
  const queryParts = [name, city, country].map((p) => p.trim()).filter(Boolean);
  if (queryParts.length === 0) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', queryParts.join(', '));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'WayReel/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = data[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        approximate: false,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function parseGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  let status = 500;
  let detail = raw;

  try {
    const outer = JSON.parse(raw) as { error?: { code?: number; message?: string; status?: string } };
    if (outer?.error) {
      if (typeof outer.error.code === 'number') status = outer.error.code;
      if (typeof outer.error.message === 'string') detail = outer.error.message;
    }
  } catch {
    const codeMatch = raw.match(/\b(400|401|403|404|413|429|500|502|503|504)\b/);
    if (codeMatch) status = Number(codeMatch[1]);
  }

  if (status === 503 || status === 429 || isRetryableGeminiError(err)) {
    return {
      status: status === 429 ? 429 : 503,
      message: 'The AI service is busy. Please try again in a minute.',
    };
  }

  return {
    status: status >= 400 && status <= 599 ? status : 500,
    message: `AI request failed (${status}): ${detail}`,
  };
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('high demand')
  );
}

async function generateContentWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0]
) {
  const delays = [2000, 5000, 10000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err) || attempt === delays.length) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }

  if (isRetryableGeminiError(lastError) && params.model === 'gemini-4-hydrogen') {
    return await ai.models.generateContent({
      ...params,
      model: 'gemini-3.1-flash-lite',
    });
  }

  throw lastError;
}

async function estimateCoordinatesWithGemini(
  places: Array<{ index: number; name: string; city: string; country: string }>
): Promise<Map<number, GeocodedCoordinates>> {
  const result = new Map<number, GeocodedCoordinates>();
  if (places.length === 0) return result;

  try {
    const response = await generateContentWithRetry({
      model: 'gemini-4-hydrogen',
      contents: `Estimate geographic coordinates (latitude and longitude) for each real-world travel place listed below. If you are unsure of the exact venue, provide the best approximate coordinates for the neighborhood or city center. Only return null if the location is completely unidentifiable.\n\nPlaces:\n${JSON.stringify(places)}`,
      config: {
        systemInstruction:
          'Return accurate approximate latitude/longitude coordinates in JSON for each indexed place.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              index: { type: Type.INTEGER },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
              found: { type: Type.BOOLEAN },
            },
            required: ['index', 'lat', 'lng', 'found'],
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '[]').trim()) as Array<{
      index: number;
      lat: number;
      lng: number;
      found: boolean;
    }>;

    for (const item of parsed) {
      if (
        item.found &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng) &&
        item.lat >= -90 &&
        item.lat <= 90 &&
        item.lng >= -180 &&
        item.lng <= 180 &&
        !(item.lat === 0 && item.lng === 0)
      ) {
        result.set(item.index, {
          lat: Number(item.lat.toFixed(6)),
          lng: Number(item.lng.toFixed(6)),
          approximate: true,
        });
      }
    }
  } catch (err) {
    console.error('Gemini coordinate estimation error:', err);
  }

  return result;
}

function normalizeNote(rawNote: string | undefined): string {
  let cleaned = (rawNote ?? '').trim();
  if (!cleaned) return '';
  cleaned = cleaned
    .replace(/^(visited|went to|went|stopped by|ate at|visited for)\s+(for|at|in|during|to)?\s*/i, '')
    .replace(/\bvisited\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function deduplicatePlaces(raw: RawExtractedPlace[]): Array<RawExtractedPlace & { mergedCount: number }> {
  const byKey = new Map<string, RawExtractedPlace & { mergedCount: number }>();

  for (const item of raw) {
    const name = (item.name ?? '').trim();
    if (!name) continue;
    const city = (item.city ?? '').trim();
    const key = `${name.toLowerCase()}::${city.toLowerCase()}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...item,
        name,
        city,
        country: (item.country ?? '').trim(),
        category: (item.category ?? 'Other').trim() || 'Other',
        note: normalizeNote(item.note),
        tags: Array.isArray(item.tags) ? item.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
        confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.7,
        source: normalizeSource(item.source),
        mergedCount: 1,
      });
    } else {
      const incomingTags = Array.isArray(item.tags)
        ? item.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
        : [];
      const mergedTags = Array.from(new Set([...(existing.tags ?? []), ...incomingTags])).slice(0, 15);
      const bestConfidence = Math.max(
        existing.confidence ?? 0,
        typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0
      );
      const incomingNote = normalizeNote(item.note);
      const mergedNote =
        !existing.note || (incomingNote.length > existing.note.length && incomingNote.length <= 400)
          ? incomingNote
          : existing.note;

      byKey.set(key, {
        ...existing,
        country: existing.country || (item.country ?? '').trim(),
        note: mergedNote,
        tags: mergedTags,
        confidence: bestConfidence,
        mergedCount: existing.mergedCount + 1,
      });
    }
  }

  return Array.from(byKey.values());
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post('/api/extract', (req, res) => {
    const uploadHandler = upload.array('media', MAX_SCREENSHOTS);

    uploadHandler(req, res, async (uploadErr) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];

      const cleanupLocalFiles = async () => {
        await Promise.all(
          files.map(async (f) => {
            try {
              await fs.promises.unlink(f.path);
            } catch {
              // ignore cleanup errors if already removed
            }
          })
        );
      };

      if (uploadErr) {
        await cleanupLocalFiles();
        if (uploadErr instanceof multer.MulterError) {
          if (uploadErr.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'Upload is too large. Keep screen recordings under 45 MB and screenshots under 45 MB.',
            });
            return;
          }
          if (uploadErr.code === 'LIMIT_FILE_COUNT' || uploadErr.code === 'LIMIT_UNEXPECTED_FILE') {
            res.status(400).json({
              error: 'You can upload 1 video or up to 6 screenshots at a time.',
            });
            return;
          }
        }
        res.status(400).json({ error: uploadErr.message || 'Invalid file upload.' });
        return;
      }

      const geminiUploadedFileNames: string[] = [];

      try {
        if (!process.env.GEMINI_API_KEY) {
          res.status(500).json({
            error: 'Gemini API key is not configured on the server.',
          });
          return;
        }

        const rawLink = typeof req.body?.sourceLink === 'string' ? req.body.sourceLink : '';
        const rawCaption = typeof req.body?.caption === 'string' ? req.body.caption : '';
        const caption = rawCaption.trim();

        const linkCheck = validateOptionalUrl(rawLink);
        if (!linkCheck.valid) {
          res.status(400).json({
            error: 'That link looks invalid. Enter a full https:// link or leave it blank.',
          });
          return;
        }

        const videoFiles = files.filter((f) => f.mimetype.toLowerCase().startsWith('video/'));
        const imageFiles = files.filter((f) => f.mimetype.toLowerCase().startsWith('image/'));

        if (videoFiles.length > 1 || (videoFiles.length > 0 && imageFiles.length > 0)) {
          res.status(400).json({
            error: 'Upload either 1 screen recording video OR up to 6 screenshots, not both.',
          });
          return;
        }

        if (!caption && files.length === 0) {
          res.status(400).json({
            error: linkCheck.cleaned
              ? 'WayReel does not fetch Instagram links automatically. Paste the caption or upload a screen recording or screenshots.'
              : 'Paste a caption or upload a screen recording or screenshots to find places.',
          });
          return;
        }

        const parts: Array<Record<string, unknown>> = [];

        if (videoFiles.length === 1) {
          const videoFile = videoFiles[0];
          const uploaded = await ai.files.upload({
            file: videoFile.path,
            config: {
              mimeType: videoFile.mimetype,
            },
          });
          if (uploaded.name) {
            geminiUploadedFileNames.push(uploaded.name);
            await waitForGeminiFileActive(uploaded.name);
          }
          if (uploaded.uri) {
            parts.push({
              fileData: {
                fileUri: uploaded.uri,
                mimeType: uploaded.mimeType ?? videoFile.mimetype,
              },
            });
          }
        }

        for (const img of imageFiles) {
          const buffer = await fs.promises.readFile(img.path);
          parts.push({
            inlineData: {
              mimeType: img.mimetype,
              data: buffer.toString('base64'),
            },
          });
        }

        const textInstruction = [
          'Extract every specific travel place (restaurant, cafe, bar, landmark, museum, beach, viewpoint, hotel, shop, park, or neighborhood) that is EXPLICITLY named or clearly shown in the provided text, hashtags, video audio, or on-screen text/visuals.',
          'STRICT RULES:',
          '1. Do NOT invent, assume, or guess places that are not explicitly named or clearly visible.',
          '2. Do NOT infer anything from any URL alone.',
          '3. If no concrete places are named or clearly shown, return an empty array [].',
          '4. Write "note" as a short, neutral plan or activity description (e.g. "Pastel de nata", "Shops and cafes", "Lunch market", "Sunset viewpoint"). NEVER use the word "visited" or past-tense phrasing like "Visited for..." or "Went to...".',
          '5. Set "confidence" from 0.0 to 1.0 based on how clearly and unambiguously the place is identified.',
          '6. Set "source" strictly to one of: "caption", "hashtags", "audio", "on-screen text".',
          caption ? `\nPasted caption / text:\n${caption}` : '\nNo caption text was provided; inspect only the uploaded media.',
        ].join('\n');

        parts.push({ text: textInstruction });

        const extractResponse = await generateContentWithRetry({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            systemInstruction:
              'You are a precise travel-place extractor. Only extract places actually named or clearly shown in the provided inputs. Never fabricate places. Write short, neutral plan-style notes (e.g. "Sunset viewpoint", "Shops and cafes") and never use the word "visited" or past-tense visit phrasing.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: 'Exact place name' },
                  city: { type: Type.STRING, description: 'City or town name, empty if unknown' },
                  country: { type: Type.STRING, description: 'Country name, empty if unknown' },
                  category: {
                    type: Type.STRING,
                    description:
                      'One of: Restaurant, Cafe, Bar, Landmark, Museum, Beach, Park, Hotel, Shop, Neighborhood, Viewpoint, Other',
                  },
                  note: {
                    type: Type.STRING,
                    description:
                      'Short neutral plan note (e.g. "Shops and cafes", "Sunset viewpoint"). Never use the word "visited" or past-tense phrasing.',
                  },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Up to 4 short lowercase tags',
                  },
                  confidence: { type: Type.NUMBER, description: 'Confidence 0 to 1' },
                  source: {
                    type: Type.STRING,
                    description: 'One of: caption, hashtags, audio, on-screen text',
                  },
                },
                required: ['name', 'city', 'country', 'category', 'note', 'confidence', 'source'],
              },
            },
          },
        });

        const rawJsonText = (extractResponse.text ?? '').trim();
        if (!rawJsonText) {
          throw new Error('AI request returned an empty response.');
        }

        let rawPlaces: RawExtractedPlace[] = [];
        try {
          const parsed = JSON.parse(rawJsonText);
          if (!Array.isArray(parsed)) {
            throw new Error('AI response was not a place list.');
          }
          rawPlaces = parsed;
        } catch (parseErr) {
          throw new Error(
            parseErr instanceof Error ? parseErr.message : 'Could not parse AI response.'
          );
        }

        const deduped = deduplicatePlaces(rawPlaces);

        if (deduped.length === 0) {
          res.json({
            places: [],
            mediaDeleted: true,
            geocodingMode: 'none',
          });
          return;
        }

        const coordsByIndex = new Map<number, GeocodedCoordinates>();
        const needGeminiIndices: Array<{ index: number; name: string; city: string; country: string }> = [];

        for (let idx = 0; idx < deduped.length; idx += 1) {
          const p = deduped[idx];
          const found = await geocodeWithOpenStreetMap(p.name ?? '', p.city ?? '', p.country ?? '');
          if (found) {
            coordsByIndex.set(idx, found);
          } else {
            needGeminiIndices.push({
              index: idx,
              name: p.name ?? '',
              city: p.city ?? '',
              country: p.country ?? '',
            });
          }
        }

        if (needGeminiIndices.length > 0) {
          const approxMap = await estimateCoordinatesWithGemini(needGeminiIndices);
          for (const [idx, coords] of approxMap.entries()) {
            coordsByIndex.set(idx, coords);
          }
        }

        const candidates = deduped.map((p, idx) => {
          const geo = coordsByIndex.get(idx);
          return {
            id: `cand-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            name: (p.name ?? '').slice(0, 120),
            city: (p.city ?? '').slice(0, 100),
            country: (p.country ?? '').slice(0, 100),
            category: (p.category ?? 'Other').slice(0, 60),
            note: (p.note ?? '').slice(0, 400),
            tags: (p.tags ?? []).slice(0, 15),
            confidence: typeof p.confidence === 'number' ? p.confidence : 0.7,
            source: normalizeSource(p.source),
            coordinates: geo ? { lat: geo.lat, lng: geo.lng } : null,
            coordinatesApproximate: geo ? geo.approximate : true,
            sourceLink: linkCheck.cleaned,
            confirmed: false,
            mergedCount: p.mergedCount ?? 1,
          };
        });

        res.json({
          places: candidates,
          mediaDeleted: true,
          geocodingMode:
            needGeminiIndices.length === 0 ? 'openstreetmap_nominatim' : 'gemini_approximate',
        });
      } catch (err) {
        console.error('Extraction error:', err);
        const parsed = parseGeminiError(err);
        res.status(parsed.status).json({ error: parsed.message });
      } finally {
        await cleanupLocalFiles();
        await Promise.all(
          geminiUploadedFileNames.map(async (name) => {
            try {
              await ai.files.delete({ name });
            } catch {
              // ignore remote delete error
            }
          })
        );
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WayReel server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
