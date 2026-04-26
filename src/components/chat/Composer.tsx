import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function Composer({ value, onChange, onSubmit, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Voice input strategy:
  //  1) Primary: MediaRecorder → ElevenLabs Scribe via the `transcribe-audio`
  //     edge function. Reliable everywhere, no Google network proxy.
  //  2) Fallback: Browser Web Speech API — only if MediaRecorder isn't
  //     available (rare). The Web Speech API frequently throws `network`
  //     errors because Chrome routes audio to Google's servers, so we avoid
  //     it as the default path.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>("");
  const cancelledRef = useRef<boolean>(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSubmit();
    }
  };

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // strip the data:...;base64, prefix
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const pickMimeType = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const MR: any = (window as any).MediaRecorder;
    if (MR && typeof MR.isTypeSupported === "function") {
      for (const c of candidates) {
        try {
          if (MR.isTypeSupported(c)) return c;
        } catch {
          /* ignore */
        }
      }
    }
    return "";
  };

  const startWebSpeechFallback = () => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({
        title: "Voice input not supported",
        description: "Your browser doesn't support audio recording.",
        variant: "destructive",
      });
      return;
    }
    try {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";

      baseTextRef.current = value;

      recognition.onresult = (event: any) => {
        let finalText = "";
        let interimText = "";
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += transcript;
          else interimText += transcript;
        }
        const combined = (finalText + interimText).trim();
        if (!combined) return;
        const base = baseTextRef.current;
        onChange(base ? `${base} ${combined}` : combined);
      };

      recognition.onerror = (event: any) => {
        const err = event?.error;
        if (err === "no-speech" || err === "aborted") return;
        const msg =
          err === "not-allowed" || err === "service-not-allowed"
            ? "Microphone permission denied."
            : `Speech recognition error: ${err ?? "unknown"}`;
        toast({ title: "Couldn't transcribe", description: msg, variant: "destructive" });
        setRecording(false);
      };

      recognition.onend = () => {
        setRecording(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't start recording";
      toast({ title: "Couldn't start recording", description: msg, variant: "destructive" });
    }
  };

  const startRecording = async () => {
    // If MediaRecorder/getUserMedia aren't available, fall back to Web Speech.
    const hasMR = typeof (window as any).MediaRecorder !== "undefined";
    const hasMedia = !!navigator.mediaDevices?.getUserMedia;
    if (!hasMR || !hasMedia) {
      startWebSpeechFallback();
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      toast({
        title: "Microphone unavailable",
        description: denied
          ? "Microphone permission denied. Enable it in your browser settings."
          : err?.message || "Couldn't access your microphone.",
        variant: "destructive",
      });
      return;
    }

    try {
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      cancelledRef.current = false;
      baseTextRef.current = value;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Always release the mic.
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        setRecording(false);

        if (cancelledRef.current) return;

        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (chunks.length === 0) return;

        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 800) {
          // Too short to transcribe meaningfully.
          return;
        }

        setTranscribing(true);
        try {
          const audioB64 = await blobToBase64(blob);
          const { data, error } = await supabase.functions.invoke("transcribe-audio", {
            body: { audio: audioB64, mimeType: blob.type },
          });
          if (error) throw error;
          const text = (data as any)?.text?.trim?.() ?? "";
          if (!text) {
            toast({
              title: "Nothing transcribed",
              description: "We couldn't pick up any speech. Try again a bit louder.",
            });
            return;
          }
          const base = baseTextRef.current;
          onChange(base ? `${base} ${text}` : text);
        } catch (err: any) {
          toast({
            title: "Couldn't transcribe",
            description: err?.message || "Transcription failed. Please try again.",
            variant: "destructive",
          });
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch (err: any) {
      stream.getTracks().forEach((t) => t.stop());
      toast({
        title: "Couldn't start recording",
        description: err?.message || "Recording failed to start.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    // Stop Web Speech fallback if it's running.
    const r = recognitionRef.current;
    if (r) {
      try { r.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    // Stop MediaRecorder — its onstop handler will run transcription.
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  useEffect(() => {
    return () => {
      // Cancel any in-flight recording on unmount; don't transcribe.
      cancelledRef.current = true;
      try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  return (
    <div className="bg-gradient-to-t from-chat via-chat to-chat/0 px-4 pb-4 pt-6 md:px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && value.trim()) onSubmit();
        }}
        className="mx-auto max-w-3xl"
      >
        <div
          className={cn(
            "flex items-end gap-2 rounded-3xl border border-border bg-card p-2 pl-3 shadow-card transition-all",
            "focus-within:border-primary/40 focus-within:shadow-glow",
          )}
        >
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about flights, hotels, or trips…"
            rows={1}
            className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={disabled || transcribing}
            aria-label={
              transcribing
                ? "Transcribing"
                : recording
                  ? "Stop recording"
                  : "Record voice"
            }
            title={
              transcribing
                ? "Transcribing…"
                : recording
                  ? "Stop recording"
                  : "Record voice"
            }
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
              recording
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : transcribing
                  ? "bg-muted text-muted-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : recording ? (
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>

          <button
            type="submit"
            disabled={disabled || !value.trim()}
            aria-label="Send"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
              value.trim() && !disabled
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Skyguy searches Skyscanner in real time. Prices and times can change.
        </p>
      </form>
    </div>
  );
}