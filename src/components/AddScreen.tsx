import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Film,
  ImagePlus,
  Link2,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { ExtractedPlaceCandidate } from '../types/wayreel';

interface AddScreenProps {
  onExtracted: (
    places: ExtractedPlaceCandidate[],
    meta: { geocodingMode: string; mediaDeleted: boolean }
  ) => void;
}

const MAX_SCREENSHOTS = 6;
const MAX_VIDEO_MB = 45;
const MAX_IMAGE_MB = 15;

export function AddScreen({ onExtracted }: AddScreenProps) {
  const [sourceLink, setSourceLink] = useState('');
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emptyNotice, setEmptyNotice] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [statusStep, setStatusStep] = useState('Reading your post...');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaMode = useMemo<'none' | 'video' | 'images'>(() => {
    if (files.length === 0) return 'none';
    return files[0].type.startsWith('video/') ? 'video' : 'images';
  }, [files]);

  const previews = useMemo(() => {
    return files.map((file) => ({
      name: file.name,
      sizeMb: (file.size / (1024 * 1024)).toFixed(1),
      isVideo: file.type.startsWith('video/'),
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
  }, [files]);

  React.useEffect(() => {
    return () => {
      for (const item of previews) {
        if (item.url) URL.revokeObjectURL(item.url);
      }
    };
  }, [previews]);

  function handleFilesSelected(incomingList: FileList | null) {
    if (!incomingList || incomingList.length === 0) return;
    setErrorMsg(null);
    setEmptyNotice(null);

    const incoming = Array.from(incomingList);
    const hasVideo = incoming.some((f) => f.type.startsWith('video/'));
    const hasImage = incoming.some((f) => f.type.startsWith('image/'));

    if (hasVideo && hasImage) {
      setErrorMsg('Upload either 1 screen recording video or up to 6 screenshots, not both.');
      return;
    }

    if (hasVideo) {
      if (incoming.length > 1) {
        setErrorMsg('Upload only 1 screen recording video at a time.');
        return;
      }
      const video = incoming[0];
      if (video.size > MAX_VIDEO_MB * 1024 * 1024) {
        setErrorMsg(`Video is too large (${(video.size / (1024 * 1024)).toFixed(1)} MB). Max is ${MAX_VIDEO_MB} MB.`);
        return;
      }
      setFiles([video]);
      return;
    }

    // Images flow
    const validImages = incoming.filter((f) => f.type.startsWith('image/'));
    if (validImages.length !== incoming.length) {
      setErrorMsg('Some selected files were not images or videos.');
      return;
    }

    for (const img of validImages) {
      if (img.size > MAX_IMAGE_MB * 1024 * 1024) {
        setErrorMsg(`"${img.name}" is too large. Keep each screenshot under ${MAX_IMAGE_MB} MB.`);
        return;
      }
    }

    const base = mediaMode === 'images' ? files : [];
    const combined = [...base, ...validImages];
    if (combined.length > MAX_SCREENSHOTS) {
      setErrorMsg(`You can upload up to ${MAX_SCREENSHOTS} screenshots at once.`);
      setFiles(combined.slice(0, MAX_SCREENSHOTS));
      return;
    }

    setFiles(combined);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setErrorMsg(null);
  }

  function validateInputs(): boolean {
    setErrorMsg(null);
    setEmptyNotice(null);

    const trimmedLink = sourceLink.trim();
    const trimmedCaption = caption.trim();

    if (trimmedLink) {
      try {
        const parsed = new URL(trimmedLink);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setErrorMsg('Link must start with http:// or https://.');
          return false;
        }
      } catch {
        setErrorMsg('That link does not look like a valid URL. Check it or leave it blank.');
        return false;
      }
    }

    if (!trimmedCaption && files.length === 0) {
      if (trimmedLink) {
        setErrorMsg(
          'WayReel does not pull videos from Instagram links. Paste the caption or upload a screen recording or screenshots.'
        );
      } else {
        setErrorMsg('Paste a caption or upload a screen recording or screenshots first.');
      }
      return false;
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateInputs()) return;

    setIsExtracting(true);
    setErrorMsg(null);
    setEmptyNotice(null);
    setStatusStep('Reading your post...');

    const progressTimer = window.setTimeout(() => {
      setStatusStep('Finding places and checking pins...');
    }, 5000);

    try {
      const formData = new FormData();
      formData.append('sourceLink', sourceLink.trim());
      formData.append('caption', caption.trim());
      for (const f of files) {
        formData.append('media', f);
      }

      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      const rawText = await response.text();
      let payload: {
        places?: ExtractedPlaceCandidate[];
        error?: string;
        geocodingMode?: string;
        mediaDeleted?: boolean;
      } = {};

      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        if (response.status === 503 || response.status === 429) {
          setErrorMsg(
            payload.error || 'The AI service is busy. Please try again in a minute.'
          );
          return;
        }
        if (response.status === 413) {
          setErrorMsg(
            payload.error || 'Upload too large. Keep videos and screenshots under 45 MB.'
          );
          return;
        }
        setErrorMsg(
          payload.error ||
            `Lookup failed (HTTP ${response.status})${
              rawText && !rawText.trim().startsWith('<') ? `: ${rawText.slice(0, 160)}` : '.'
            }`
        );
        return;
      }

      if (!Array.isArray(payload.places)) {
        setErrorMsg(payload.error || 'AI request returned an unexpected response. Please try again.');
        return;
      }

      const found = payload.places;
      if (found.length === 0) {
        setEmptyNotice(
          'No places found. Try adding the caption text or clearer screenshots.'
        );
        return;
      }

      // Clear uploaded media selection locally as well once processed
      setFiles([]);
      setCaption('');
      setSourceLink('');

      onExtracted(found, {
        geocodingMode: payload.geocodingMode ?? 'gemini_approximate',
        mediaDeleted: Boolean(payload.mediaDeleted),
      });
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : 'Connection failed';
      setErrorMsg(`Request failed: ${detail}`);
    } finally {
      window.clearTimeout(progressTimer);
      setIsExtracting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="font-display-italic text-3xl sm:text-4xl text-white tracking-tight text-balance">
          Turn a Reel into places
        </h2>
        <p className="text-sm sm:text-base text-slate-300 max-w-2xl">
          Paste the link for your records, add the caption or upload a screen recording or screenshots.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 space-y-4">
          {/* Field (a): Reel/post link */}
          <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-2">
            <label htmlFor="reel-link" className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <Link2 className="w-4 h-4 text-[#FFC15A]" aria-hidden="true" />
              <span>Reel or post link</span>
              <span className="text-xs font-normal text-slate-400">Optional</span>
            </label>
            <input
              id="reel-link"
              type="url"
              inputMode="url"
              value={sourceLink}
              onChange={(e) => {
                setSourceLink(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="https://www.instagram.com/reel/..."
              className="w-full min-h-[46px] rounded-xl bg-black/30 border border-white/15 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC15A] transition-colors"
            />
            <p className="text-xs text-slate-400">
              Saved so you can jump back to the original post later.
            </p>
          </div>

          {/* Field (b): Caption or pasted text */}
          <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-2">
            <label htmlFor="reel-caption" className="flex items-center justify-between text-sm font-medium text-slate-200">
              <span>Caption or pasted text</span>
              <span className="text-xs font-normal text-slate-400 tabular-nums">
                {caption.length} chars
              </span>
            </label>
            <textarea
              id="reel-caption"
              rows={5}
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                if (errorMsg) setErrorMsg(null);
                if (emptyNotice) setEmptyNotice(null);
              }}
              placeholder="Paste the Reel caption, hashtags, or your own notes about spots shown..."
              className="w-full rounded-xl bg-black/30 border border-white/15 p-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC15A] transition-colors resize-y min-h-[128px]"
            />
          </div>
        </div>

        {/* Field (c): Upload screen recording or up to 6 screenshots */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-200">
                Screen recording or screenshots
              </span>
              <span className="text-xs text-slate-400 tabular-nums">
                {mediaMode === 'video'
                  ? '1 video'
                  : mediaMode === 'images'
                  ? `${files.length}/${MAX_SCREENSHOTS} images`
                  : '1 video or up to 6 images'}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              multiple
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
              className="sr-only"
              id="wayreel-media-upload"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelected(e.dataTransfer.files);
              }}
              className="w-full min-h-[124px] rounded-2xl border border-dashed border-white/25 bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.99] transition-all flex flex-col items-center justify-center gap-2 p-4 text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC15A]"
            >
              <div className="w-11 h-11 rounded-full bg-[#FFC15A]/15 text-[#FFC15A] flex items-center justify-center">
                {mediaMode === 'video' ? (
                  <Film className="w-5 h-5" />
                ) : mediaMode === 'images' ? (
                  <ImagePlus className="w-5 h-5" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-white">
                  Tap to upload video or screenshots
                </p>
                <p className="text-xs text-slate-400">
                  1 screen recording (max {MAX_VIDEO_MB} MB) or up to {MAX_SCREENSHOTS} photos
                </p>
              </div>
            </button>

            {previews.length > 0 && (
              <div className="space-y-2 pt-1">
                {previews.map((item, idx) => (
                  <div
                    key={`${item.name}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-black/30 border border-white/10 p-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.url ? (
                        <img
                          src={item.url}
                          alt={item.name}
                          className="w-11 h-11 rounded-lg object-cover shrink-0 border border-white/10"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-[#F07A1F]/20 text-[#FFC15A] flex items-center justify-center shrink-0">
                          <Film className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{item.name}</p>
                        <p className="text-xs text-slate-400 tabular-nums">
                          {item.isVideo ? 'Video' : 'Screenshot'} · {item.sizeMb} MB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      aria-label={`Remove ${item.name}`}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-300 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 leading-relaxed">
              Uploaded videos and screenshots are deleted automatically as soon as extraction finishes.
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-500/15 border border-rose-400/35 p-3.5 flex items-start gap-2.5 text-sm text-rose-100"
            >
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {emptyNotice && (
            <div
              role="status"
              className="rounded-2xl bg-amber-500/15 border border-amber-400/35 p-3.5 flex items-start gap-2.5 text-sm text-amber-100"
            >
              <AlertCircle className="w-4 h-4 text-[#FFC15A] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{emptyNotice}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isExtracting}
            className="w-full min-h-[52px] rounded-2xl amber-gradient text-[#111322] font-semibold text-base flex items-center justify-center gap-2 shadow-lg shadow-[#F07A1F]/25 hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-65 disabled:cursor-not-allowed cursor-pointer"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                <span>{statusStep}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" aria-hidden="true" />
                <span>Find places</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
