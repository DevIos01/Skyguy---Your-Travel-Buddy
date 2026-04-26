import { supabase } from "@/integrations/supabase/client";

/**
 * Session persistence (a.k.a. "Remember me").
 *
 * Supabase JS persists the auth session to localStorage by default, which means
 * the session survives closing the browser. When the user UNCHECKS "Remember
 * me" we want the opposite: the session should disappear as soon as the tab
 * (or browser) is closed.
 *
 * We achieve that by:
 *   1. Recording the user's preference in localStorage under PREF_KEY.
 *   2. After every sign-in, applying the preference: if "remember" is off,
 *      we copy the just-written Supabase session from localStorage into
 *      sessionStorage and delete the localStorage copy.
 *   3. On every page load, re-applying the preference BEFORE Supabase reads
 *      its session — if the user picked "don't remember", we move any
 *      lingering session token from localStorage into sessionStorage so
 *      Supabase still picks it up for this tab but it's gone after close.
 *
 * Supabase's storage key follows the pattern `sb-<project-ref>-auth-token`.
 */

const PREF_KEY = "skyguy:rememberMe";

/** Match Supabase's auth-token keys (handles `sb-<ref>-auth-token` + chunks). */
function isSupabaseAuthKey(key: string): boolean {
  return key.startsWith("sb-") && key.includes("-auth-token");
}

function moveBetweenStorages(from: Storage, to: Storage) {
  const keysToMove: string[] = [];
  for (let i = 0; i < from.length; i++) {
    const k = from.key(i);
    if (k && isSupabaseAuthKey(k)) keysToMove.push(k);
  }
  for (const k of keysToMove) {
    const v = from.getItem(k);
    if (v != null) {
      to.setItem(k, v);
      from.removeItem(k);
    }
  }
}

export function getRememberMe(): boolean {
  // Default to true — matches the historical behaviour of this app and what
  // most users expect from a sign-in form.
  const v = localStorage.getItem(PREF_KEY);
  return v === null ? true : v === "1";
}

export function setRememberMe(remember: boolean) {
  localStorage.setItem(PREF_KEY, remember ? "1" : "0");
}

/**
 * Apply the current preference to whatever session is on disk. Safe to call
 * at app startup AND right after a successful sign-in.
 *
 * - remember=true → make sure the session lives in localStorage (persists)
 * - remember=false → make sure the session lives in sessionStorage only
 *   (cleared when the tab/browser closes)
 */
export function applySessionPersistence() {
  if (typeof window === "undefined") return;
  const remember = getRememberMe();
  if (remember) {
    moveBetweenStorages(sessionStorage, localStorage);
  } else {
    moveBetweenStorages(localStorage, sessionStorage);
  }
}

/**
 * Convenience wrapper used right after `signInWithPassword` resolves: writes
 * the new preference, then immediately migrates the freshly-written session
 * to the right storage. We also force Supabase to re-emit the session so any
 * `onAuthStateChange` listeners pick it up regardless of which storage it
 * ended up in.
 */
export async function persistSessionAfterSignIn(remember: boolean) {
  setRememberMe(remember);
  applySessionPersistence();
  // Nudge Supabase to re-read storage so listeners stay in sync.
  await supabase.auth.getSession();
}