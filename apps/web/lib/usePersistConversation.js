import { useRef, useCallback } from 'react';
import { apiClient } from '@genemap/shared';

/**
 * Persist an AI chat conversation so it's counted in admin analytics
 * (aIConversation rows drive "AI Chats" + the "AI Assistant Usage" chart) and
 * can be resumed later. Previously the chat UIs kept messages in browser memory
 * only and never called the conversations API, so analytics always read 0.
 *
 * Returns a `persist(messages)` callback that creates ONE conversation row on
 * the first call and updates that same row afterwards (tracked via a ref), so a
 * long chat is a single row rather than one per message. Persistence failures
 * are swallowed — saving analytics data must never break the chat.
 *
 * @param {string} assistantType e.g. 'anastasia' | 'robert'
 */
export function usePersistConversation(assistantType) {
  const idRef = useRef(null);
  const inFlight = useRef(false);
  const lastType = useRef(assistantType);

  // When the active assistant changes (the unified AI Assistants page switches
  // between Robert and Anastasia), start a fresh conversation row rather than
  // re-tagging the previous one.
  if (lastType.current !== assistantType) {
    lastType.current = assistantType;
    idRef.current = null;
  }

  return useCallback(async (messages) => {
    if (inFlight.current) return; // avoid overlapping writes from rapid effects
    const cleaned = (messages || [])
      .filter((m) => m && m.role && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content }));
    if (cleaned.length < 2) return; // nothing meaningful yet (just the greeting)

    inFlight.current = true;
    try {
      const payload = {
        assistantType,
        title: cleaned.find((m) => m.role === 'user')?.content?.slice(0, 80) || 'Chat',
        messages: cleaned,
      };
      if (idRef.current) {
        await apiClient.updateConversation(idRef.current, payload);
      } else {
        const conv = await apiClient.saveConversation(payload);
        if (conv?.id) idRef.current = conv.id;
      }
    } catch (err) {
      // Analytics persistence is best-effort; never surface to the user.
      console.error('Failed to persist conversation:', err);
    } finally {
      inFlight.current = false;
    }
  }, [assistantType]);
}
