/**
 * Composable for managing a WebSocket connection to the Stateful-Echo daemon.
 *
 * Implements the browser-channel protocol from ADR-043:
 *   { type: "connected" }                     ← on connect
 *   { type: "thinking" }                      ← response starting
 *   { type: "stream", event: StreamEvent }    ← streaming text chunk
 *   { type: "text", text: string }            ← final complete response
 *   { type: "progress", text: string }        ← ephemeral progress note
 *   { type: "done" }                          ← response complete
 *   { type: "cancelling" }                    ← cancel acknowledged
 *   { type: "error", text: string }           ← error
 */
import { ref, onUnmounted } from 'vue';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EchoMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** True while the assistant is still streaming this message. */
  streaming: boolean;
}

export type EchoConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface DaemonStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'turn_boundary';
  text?: string;
  name?: string;
}

interface DaemonMessage {
  type: 'connected' | 'thinking' | 'stream' | 'text' | 'progress' | 'done' | 'cancelling' | 'error';
  text?: string;
  event?: DaemonStreamEvent;
}

const STORAGE_KEY_DAEMON_URL = 'echo-daemon-url';
const DEFAULT_DAEMON_URL = 'ws://localhost:3847';

// ─── Composable ───────────────────────────────────────────────────────────────

export function useEchoChat() {
  const messages = ref<EchoMessage[]>([]);
  const connectionState = ref<EchoConnectionState>('disconnected');
  const isThinking = ref(false);
  const errorMessage = ref<string | null>(null);
  const daemonUrl = ref(DEFAULT_DAEMON_URL);
  const progressText = ref<string | null>(null);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let shouldReconnect = true;

  // ── Storage ──────────────────────────────────────────────────────────────

  async function loadDaemonUrl(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_DAEMON_URL);
      if (result[STORAGE_KEY_DAEMON_URL]) {
        daemonUrl.value = result[STORAGE_KEY_DAEMON_URL];
      }
    } catch {
      // ignore
    }
  }

  async function saveDaemonUrl(url: string): Promise<void> {
    daemonUrl.value = url;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_DAEMON_URL]: url });
    } catch {
      // ignore
    }
  }

  // ── Connection ────────────────────────────────────────────────────────────

  function connect(): void {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    connectionState.value = 'connecting';
    errorMessage.value = null;

    try {
      ws = new WebSocket(daemonUrl.value);
    } catch {
      connectionState.value = 'error';
      errorMessage.value = `Cannot connect to Echo at ${daemonUrl.value}`;
      return;
    }

    ws.onopen = () => {
      // "connected" message from server confirms the session is ready
    };

    ws.onmessage = (event) => {
      try {
        const msg: DaemonMessage = JSON.parse(event.data);
        handleDaemonMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      ws = null;
      if (connectionState.value !== 'disconnected') {
        connectionState.value = 'disconnected';
      }
      // Auto-reconnect after 3s if not intentionally disconnected
      if (shouldReconnect) {
        reconnectTimer = setTimeout(() => connect(), 3000);
      }
    };

    ws.onerror = () => {
      connectionState.value = 'error';
      errorMessage.value = `Echo daemon unreachable at ${daemonUrl.value} — is it running?`;
    };
  }

  function disconnect(): void {
    shouldReconnect = false;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close(1000, 'User disconnected');
      ws = null;
    }
    connectionState.value = 'disconnected';
  }

  function reconnect(): void {
    shouldReconnect = true;
    disconnect();
    shouldReconnect = true;
    connect();
  }

  // ── Message handling ──────────────────────────────────────────────────────

  function handleDaemonMessage(msg: DaemonMessage): void {
    switch (msg.type) {
      case 'connected':
        connectionState.value = 'connected';
        break;

      case 'thinking':
        isThinking.value = true;
        progressText.value = null;
        // Start a new streaming assistant message
        messages.value.push({
          id: `echo-${Date.now()}`,
          role: 'assistant',
          text: '',
          streaming: true,
        });
        break;

      case 'stream': {
        const streamEvent = msg.event;
        if (streamEvent?.type === 'text' && streamEvent.text) {
          // Append to the last streaming assistant message
          const last = messages.value[messages.value.length - 1];
          if (last?.role === 'assistant' && last.streaming) {
            last.text += streamEvent.text;
          }
        }
        break;
      }

      case 'text':
        // Final complete response — replace the streaming message or add if missing
        if (msg.text) {
          const last = messages.value[messages.value.length - 1];
          if (last?.role === 'assistant') {
            last.text = msg.text;
            last.streaming = false;
          } else {
            messages.value.push({
              id: `echo-${Date.now()}`,
              role: 'assistant',
              text: msg.text,
              streaming: false,
            });
          }
        }
        break;

      case 'progress':
        progressText.value = msg.text ?? null;
        break;

      case 'done': {
        isThinking.value = false;
        progressText.value = null;
        // Mark any still-streaming message as complete
        const last = messages.value[messages.value.length - 1];
        if (last?.role === 'assistant' && last.streaming) {
          last.streaming = false;
        }
        break;
      }

      case 'cancelling':
        isThinking.value = false;
        progressText.value = null;
        break;

      case 'error': {
        isThinking.value = false;
        progressText.value = null;
        errorMessage.value = msg.text ?? 'Unknown error from Echo';
        // Mark streaming message as complete if one was open
        const lastMsg = messages.value[messages.value.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.streaming) {
          lastMsg.streaming = false;
          if (!lastMsg.text) {
            messages.value.pop();
          }
        }
        break;
      }
    }
  }

  // ── Sending ───────────────────────────────────────────────────────────────

  async function sendMessage(text: string): Promise<void> {
    if (!ws || ws.readyState !== WebSocket.OPEN || !text.trim()) return;

    errorMessage.value = null;

    // Get current tab page context
    let pageContext: { url: string; title: string; selectedText?: string } | undefined;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && !tab.url.startsWith('chrome://')) {
        pageContext = { url: tab.url, title: tab.title ?? tab.url };
        // Get selected text via content script if possible
        if (tab.id) {
          try {
            const result = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => window.getSelection()?.toString() ?? '',
            });
            const selected = result?.[0]?.result?.trim();
            if (selected) pageContext.selectedText = selected;
          } catch {
            // scripting permission may not be available on all pages
          }
        }
      }
    } catch {
      // tabs query may fail in some contexts
    }

    // Add user message to timeline
    messages.value.push({
      id: `user-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      streaming: false,
    });

    const payload: Record<string, unknown> = { type: 'message', text: text.trim() };
    if (pageContext) payload.pageContext = pageContext;

    ws.send(JSON.stringify(payload));
  }

  function cancelCurrent(): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cancel' }));
    }
    isThinking.value = false;
    progressText.value = null;
  }

  function clearMessages(): void {
    messages.value = [];
    errorMessage.value = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onUnmounted(() => {
    disconnect();
  });

  return {
    // State
    messages,
    connectionState,
    isThinking,
    errorMessage,
    progressText,
    daemonUrl,
    // Methods
    connect,
    disconnect,
    reconnect,
    sendMessage,
    cancelCurrent,
    clearMessages,
    loadDaemonUrl,
    saveDaemonUrl,
  };
}
