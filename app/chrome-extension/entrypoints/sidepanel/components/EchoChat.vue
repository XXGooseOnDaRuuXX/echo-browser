<template>
  <div class="echo-chat">
    <!-- Header -->
    <div class="echo-header">
      <div class="echo-header-left">
        <span class="echo-logo">⚡</span>
        <span class="echo-title">Echo</span>
      </div>
      <div class="echo-header-right">
        <span class="echo-status-dot" :class="statusDotClass" :title="statusLabel" />
        <button
          v-if="connectionState !== 'connected'"
          class="echo-reconnect-btn"
          title="Reconnect"
          @click="reconnect"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <button
          v-if="connectionState === 'connected'"
          class="echo-clear-btn echo-workflows-btn"
          :class="{ 'echo-workflows-btn-active': showWorkflows }"
          title="Workflows"
          @click="showWorkflows = !showWorkflows"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
            <path
              d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zm6-6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zm0 8a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </svg>
        </button>
        <button
          v-if="messages.length > 0"
          class="echo-clear-btn"
          title="Clear conversation"
          @click="clearMessages"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Disconnected banner -->
    <div v-if="connectionState !== 'connected'" class="echo-disconnected">
      <div class="echo-disconnected-icon">⚡</div>
      <p class="echo-disconnected-title">Echo isn't running</p>
      <p class="echo-disconnected-sub">Start the Echo daemon locally to begin a session.</p>
      <div class="echo-url-row">
        <input
          v-model="urlInput"
          class="echo-url-input"
          placeholder="ws://localhost:3849"
          @keydown.enter="applyUrl"
        />
        <button class="echo-url-save" @click="applyUrl">Connect</button>
      </div>
      <p v-if="errorMessage" class="echo-error-text">{{ errorMessage }}</p>
    </div>

    <!-- Thread indicator banner (ADR-046) -->
    <div v-if="connectionState === 'connected' && threadLabel" class="echo-thread-banner">
      <span class="echo-thread-icon">⤷</span>
      <span class="echo-thread-label">{{ threadLabel }}</span>
      <button class="echo-thread-back" title="Return to main session" @click="sendBack"
        >← back</button
      >
    </div>

    <!-- Message timeline -->
    <div v-if="connectionState === 'connected'" class="echo-timeline-zone">
      <div ref="timelineRef" class="echo-timeline">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="echo-msg"
          :class="msg.role === 'user' ? 'echo-msg-user' : 'echo-msg-assistant'"
        >
          <div class="echo-msg-bubble">
            <template v-if="msg.role === 'assistant'">
              <!-- markstream-vue handles partial tokens gracefully during streaming -->
              <div class="echo-msg-md">
                <MarkdownRender :content="msg.text ?? ''" :max-live-nodes="0" />
              </div>
            </template>
            <span v-else class="echo-msg-text">{{ msg.text }}</span>
            <span v-if="msg.streaming" class="echo-cursor" />
          </div>
        </div>

        <!-- Thinking / progress indicator -->
        <div v-if="isThinking && !lastMessageStreaming" class="echo-thinking">
          <span class="echo-thinking-dot" />
          <span class="echo-thinking-dot" />
          <span class="echo-thinking-dot" />
          <span v-if="progressText" class="echo-progress-text">{{ progressText }}</span>
        </div>

        <!-- Empty state -->
        <div v-if="messages.length === 0" class="echo-empty">
          <p>Echo is listening. Ask anything — she sees this page.</p>
        </div>
      </div>
      <WorkflowsPanel
        v-if="showWorkflows"
        :send-message="sendMessage"
        @close="showWorkflows = false"
      />
    </div>

    <!-- Error bar -->
    <div v-if="errorMessage && connectionState === 'connected'" class="echo-error-bar">
      <span>{{ errorMessage }}</span>
      <button @click="errorMessage = null">✕</button>
    </div>

    <!-- Composer -->
    <div v-if="connectionState === 'connected'" class="echo-composer">
      <textarea
        ref="inputRef"
        v-model="inputText"
        class="echo-input"
        placeholder="Message Echo..."
        rows="1"
        @keydown.enter.exact.prevent="handleSend"
        @keydown.enter.shift.exact="() => {}"
        @input="autoResize"
      />
      <button v-if="isThinking" class="echo-stop-btn" title="Cancel" @click="cancelCurrent">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
          <rect x="5" y="5" width="10" height="10" rx="1" />
        </svg>
      </button>
      <button
        v-else
        class="echo-send-btn"
        :disabled="!inputText.trim()"
        title="Send"
        @click="handleSend"
      >
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
          <path
            d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useEchoChat } from '../composables/useEchoChat';
import MarkdownRender from 'markstream-vue';
import 'markstream-vue/index.css';
import WorkflowsPanel from './WorkflowsPanel.vue';

const {
  messages,
  connectionState,
  isThinking,
  errorMessage,
  progressText,
  threadLabel,
  daemonUrl,
  connect,
  reconnect,
  sendMessage,
  cancelCurrent,
  clearMessages,
  loadDaemonUrl,
  saveDaemonUrl,
} = useEchoChat();

const inputText = ref('');
const showWorkflows = ref(false);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const timelineRef = ref<HTMLDivElement | null>(null);
const urlInput = ref('');

// ── Status indicator ──────────────────────────────────────────────────────────

const statusDotClass = computed(() => ({
  'echo-status-connected': connectionState.value === 'connected',
  'echo-status-connecting': connectionState.value === 'connecting',
  'echo-status-error':
    connectionState.value === 'error' || connectionState.value === 'disconnected',
}));

const statusLabel = computed(() => {
  switch (connectionState.value) {
    case 'connected':
      return 'Connected to Echo';
    case 'connecting':
      return 'Connecting...';
    case 'error':
      return 'Connection error';
    default:
      return 'Disconnected';
  }
});

const lastMessageStreaming = computed(() => {
  const last = messages.value[messages.value.length - 1];
  return last?.role === 'assistant' && last.streaming;
});

// ── Scroll to bottom on new messages ─────────────────────────────────────────

watch(
  () => messages.value.length,
  () => nextTick(() => scrollToBottom()),
);
watch(
  () => {
    const last = messages.value[messages.value.length - 1];
    return last?.text;
  },
  () => nextTick(() => scrollToBottom()),
);

function scrollToBottom(): void {
  if (timelineRef.value) {
    timelineRef.value.scrollTop = timelineRef.value.scrollHeight;
  }
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function handleSend(): Promise<void> {
  const text = inputText.value.trim();
  if (!text || isThinking.value) return;

  inputText.value = '';
  resetTextareaHeight();
  await sendMessage(text);
  nextTick(() => inputRef.value?.focus());
}

// ── Textarea auto-resize ──────────────────────────────────────────────────────

function autoResize(): void {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

function resetTextareaHeight(): void {
  const el = inputRef.value;
  if (el) el.style.height = 'auto';
}

// ── Thread ────────────────────────────────────────────────────────────────────

function sendBack(): void {
  sendMessage('/back');
}

// ── URL input ─────────────────────────────────────────────────────────────────

async function applyUrl(): Promise<void> {
  const url = urlInput.value.trim() || 'ws://localhost:3849';
  await saveDaemonUrl(url);
  reconnect();
}

// ── Init ──────────────────────────────────────────────────────────────────────

onMounted(async () => {
  await loadDaemonUrl();
  urlInput.value = daemonUrl.value;
  connect();
});
</script>

<style scoped>
/*
  Echo color system — warm dark, terra cotta accent
  Background:   #100e0c  (warm black)
  Surface:      #1c1816  (dark warm brown)
  Border:       #2e2420  (subtle warm border)
  Text:         #f0ebe5  (warm white)
  Muted:        #8a7d75  (warm gray)
  Accent:       #d97757  (terra cotta — matches app design system)
*/

.echo-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #100e0c;
  color: #f0ebe5;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  font-size: 13px;
}

/* ── Header ── */
.echo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #2e2420;
  flex-shrink: 0;
}
.echo-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.echo-logo {
  font-size: 16px;
}
.echo-title {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.01em;
  color: #f0ebe5;
}
.echo-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.echo-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.echo-status-connected {
  background: #c2853a;
  box-shadow: 0 0 0 2px rgba(194, 133, 58, 0.2);
}
.echo-status-connecting {
  background: #d4a843;
  animation: pulse 1.2s infinite;
}
.echo-status-error {
  background: #c45454;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.echo-reconnect-btn,
.echo-clear-btn {
  background: none;
  border: none;
  color: #8a7d75;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.echo-reconnect-btn:hover,
.echo-clear-btn:hover {
  color: #f0ebe5;
  background: #2e2420;
}

/* ── Disconnected ── */
.echo-disconnected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  gap: 8px;
  text-align: center;
}
.echo-disconnected-icon {
  font-size: 32px;
  margin-bottom: 4px;
  opacity: 0.35;
}
.echo-disconnected-title {
  font-weight: 600;
  color: #f0ebe5;
  margin: 0;
}
.echo-disconnected-sub {
  color: #8a7d75;
  font-size: 12px;
  margin: 0 0 8px;
  max-width: 240px;
  line-height: 1.5;
}
.echo-url-row {
  display: flex;
  gap: 6px;
  width: 100%;
  max-width: 280px;
}
.echo-url-input {
  flex: 1;
  background: #1c1816;
  border: 1px solid #3a2e28;
  border-radius: 6px;
  color: #f0ebe5;
  padding: 6px 10px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}
.echo-url-input:focus {
  border-color: #d97757;
}
.echo-url-save {
  background: #d97757;
  border: 1px solid #c4664a;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.echo-url-save:hover {
  background: #c4664a;
}
.echo-error-text {
  color: #c45454;
  font-size: 11px;
  margin: 4px 0 0;
}

/* ── Timeline zone (contains timeline + workflow overlay) ── */
.echo-timeline-zone {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Workflows button ── */
.echo-workflows-btn-active {
  color: #d97757;
  background: #2a1c14;
}

/* ── Timeline ── */
.echo-timeline {
  flex: 1;
  overflow-y: auto;
  padding: 14px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: #3a2e28 transparent;
}
.echo-timeline::-webkit-scrollbar {
  width: 4px;
}
.echo-timeline::-webkit-scrollbar-thumb {
  background: #3a2e28;
  border-radius: 2px;
}

.echo-msg {
  display: flex;
}
.echo-msg-user {
  justify-content: flex-end;
}
.echo-msg-assistant {
  justify-content: flex-start;
}
.echo-msg-bubble {
  max-width: 88%;
  padding: 8px 12px;
  border-radius: 12px;
  line-height: 1.5;
  word-break: break-word;
}
.echo-msg-user .echo-msg-bubble {
  background: #7a3420;
  color: #f5ddd3;
  border-bottom-right-radius: 4px;
}
.echo-msg-assistant .echo-msg-bubble {
  background: #1c1816;
  color: #f0ebe5;
  border: 1px solid #2e2420;
  border-bottom-left-radius: 4px;
}
/* ── Thread banner (ADR-046) ── */
.echo-thread-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  background: #1a1210;
  border-bottom: 1px solid #3a2e28;
  font-size: 11px;
  flex-shrink: 0;
}
.echo-thread-icon {
  color: #d97757;
  font-size: 13px;
  line-height: 1;
}
.echo-thread-label {
  color: #d97757;
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.echo-thread-back {
  background: none;
  border: 1px solid #3a2e28;
  border-radius: 4px;
  color: #8a7d75;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 7px;
  transition:
    color 0.1s,
    border-color 0.1s;
}
.echo-thread-back:hover {
  color: #d97757;
  border-color: #d97757;
}

.echo-msg-text {
  display: block;
  white-space: pre-wrap;
}

/* Streaming: stable plain text — no markdown jitter while tokens arrive */
.echo-msg-stream {
  display: block;
  white-space: pre-wrap;
  color: #c8bdb7;
  font-size: 13px;
  line-height: 1.6;
}

/* ── Markdown styles for assistant messages ── */
.echo-msg-md {
  font-size: 13px;
}
.echo-msg-md :deep(p) {
  margin: 0.45em 0;
}
.echo-msg-md :deep(p:first-child) {
  margin-top: 0;
}
.echo-msg-md :deep(p:last-child) {
  margin-bottom: 0;
}
.echo-msg-md :deep(ul),
.echo-msg-md :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}
.echo-msg-md :deep(li) {
  margin: 0.2em 0;
}
.echo-msg-md :deep(h1),
.echo-msg-md :deep(h2),
.echo-msg-md :deep(h3) {
  margin: 0.7em 0 0.3em;
  font-weight: 600;
  color: #f0ebe5;
}
.echo-msg-md :deep(h1:first-child),
.echo-msg-md :deep(h2:first-child),
.echo-msg-md :deep(h3:first-child) {
  margin-top: 0;
}
.echo-msg-md :deep(code) {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.85em;
  background: #2a1f1a;
  color: #e8a87c;
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
.echo-msg-md :deep(pre) {
  background: #151210;
  border: 1px solid #3a2e28;
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 0.5em 0;
}
.echo-msg-md :deep(pre code) {
  background: none;
  padding: 0;
  color: #d4c8be;
  font-size: 0.82em;
}
.echo-msg-md :deep(strong) {
  font-weight: 600;
  color: #f5e8df;
}
.echo-msg-md :deep(em) {
  font-style: italic;
  color: #c8b8ae;
}
.echo-msg-md :deep(blockquote) {
  border-left: 3px solid #d97757;
  padding-left: 0.85em;
  margin: 0.5em 0;
  color: #8a7d75;
}
.echo-msg-md :deep(a) {
  color: #d97757;
  text-decoration: underline;
}
.echo-msg-md :deep(hr) {
  border: none;
  border-top: 1px solid #2e2420;
  margin: 0.75em 0;
}

.echo-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: #d97757;
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.8s steps(1) infinite;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

/* ── Thinking indicator ── */
.echo-thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
}
.echo-thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d97757;
  animation: thinking 1.2s ease-in-out infinite;
}
.echo-thinking-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.echo-thinking-dot:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes thinking {
  0%,
  80%,
  100% {
    transform: scale(1);
    opacity: 0.4;
  }
  40% {
    transform: scale(1.3);
    opacity: 1;
  }
}
.echo-progress-text {
  color: #8a7d75;
  font-size: 11px;
  font-style: italic;
}

/* ── Empty state ── */
.echo-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5c504a;
  font-size: 12px;
  text-align: center;
  padding: 20px;
  line-height: 1.6;
}

/* ── Error bar ── */
.echo-error-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #2a1414;
  border-top: 1px solid #c45454;
  color: #e07070;
  padding: 6px 12px;
  font-size: 12px;
  flex-shrink: 0;
}
.echo-error-bar button {
  background: none;
  border: none;
  color: #e07070;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

/* ── Composer ── */
.echo-composer {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid #2e2420;
  background: #100e0c;
  flex-shrink: 0;
}
.echo-input {
  flex: 1;
  background: #1c1816;
  border: 1px solid #3a2e28;
  border-radius: 8px;
  color: #f0ebe5;
  font-size: 13px;
  font-family: inherit;
  padding: 8px 10px;
  resize: none;
  outline: none;
  line-height: 1.4;
  min-height: 36px;
  max-height: 120px;
  transition: border-color 0.15s;
}
.echo-input:focus {
  border-color: #d97757;
}
.echo-input::placeholder {
  color: #4a3e38;
}
.echo-send-btn,
.echo-stop-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.1s;
}
.echo-send-btn {
  color: #d97757;
}
.echo-send-btn:hover:not(:disabled) {
  background: #2a1c14;
}
.echo-send-btn:disabled {
  color: #3a2e28;
  cursor: not-allowed;
}
.echo-stop-btn {
  color: #c45454;
}
.echo-stop-btn:hover {
  background: #2a1414;
}
</style>
