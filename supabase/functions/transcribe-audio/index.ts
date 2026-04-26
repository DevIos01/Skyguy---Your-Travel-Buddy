import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// ElevenLabs Speech-to-Text (Scribe v2) — batch transcription of a recorded
// audio blob from the chat composer. Client base64-encodes the recording so
// it fits a JSON body; we decode and forward as multipart/form-data.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

    const { audio, mimeType } = await req.json();
    if (!audio || typeof audio !== "string") {
      return new Response(JSON.stringify({ error: "audio (base64) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode base64 → bytes in chunks (avoids stack overflow on large blobs).
    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const type = typeof mimeType === "string" && mimeType ? mimeType : "audio/webm";
    const ext = type.includes("mp3") ? "mp3" : type.includes("wav") ? "wav" : type.includes("mp4") ? "mp4" : "webm";

    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), `recording.${ext}`);
    form.append("model_id", "scribe_v2");
    // Don't pin a language — let Scribe auto-detect so users can speak any
    // supported language.
    form.append("tag_audio_events", "false");
    form.append("diarize", "false");

    const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error("transcribe-audio error", resp.status, text.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "ElevenLabs error", status: resp.status, body: text }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = JSON.parse(text);
    return new Response(JSON.stringify({ text: data?.text ?? "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-audio exception", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});