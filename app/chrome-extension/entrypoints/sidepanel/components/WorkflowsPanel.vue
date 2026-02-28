<template>
  <div class="wp-overlay" @click.self="$emit('close')">
    <div class="wp-panel">
      <div class="wp-header">
        <span class="wp-title">Workflows</span>
        <button class="wp-close" title="Close" @click="$emit('close')">
          <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
            <path
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            />
          </svg>
        </button>
      </div>

      <div class="wp-list">
        <div v-for="wf in allWorkflows" :key="wf.id" class="wp-card">
          <div class="wp-card-top">
            <span class="wp-icon">{{ wf.icon }}</span>
            <div class="wp-info">
              <span class="wp-name">{{ wf.name }}</span>
              <span class="wp-desc">{{ wf.description }}</span>
            </div>
          </div>

          <div v-if="wf.params?.length" class="wp-params">
            <div v-for="p in wf.params" :key="p.key" class="wp-param">
              <label class="wp-param-label">{{ p.label }}</label>
              <input
                class="wp-param-input"
                :placeholder="p.placeholder ?? ''"
                :value="getVal(wf.id, p.key)"
                @input="setVal(wf.id, p.key, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>

          <button class="wp-run" :disabled="!canRun(wf)" @click="run(wf)">Run ▶</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useWorkflows } from '../composables/useWorkflows';
import type { Workflow } from '../composables/useWorkflows';

const props = defineProps<{
  sendMessage: (text: string) => Promise<void>;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { allWorkflows, load, formatPrompt } = useWorkflows();
onMounted(() => void load());

const vals = ref<Record<string, string>>({});
const key = (wfId: string, pKey: string) => `${wfId}::${pKey}`;
const getVal = (wfId: string, pKey: string) => vals.value[key(wfId, pKey)] ?? '';
const setVal = (wfId: string, pKey: string, v: string) => {
  vals.value = { ...vals.value, [key(wfId, pKey)]: v };
};
const canRun = (wf: Workflow) =>
  !wf.params?.length || wf.params.every((p) => getVal(wf.id, p.key).trim());

async function run(wf: Workflow) {
  const paramValues: Record<string, string> = {};
  for (const p of wf.params ?? []) paramValues[p.key] = getVal(wf.id, p.key);
  await props.sendMessage(formatPrompt(wf.prompt, paramValues));
  emit('close');
}
</script>

<style scoped>
.wp-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
}

.wp-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #100e0c;
}

.wp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 9px;
  border-bottom: 1px solid #2e2420;
  flex-shrink: 0;
}

.wp-title {
  font-size: 13px;
  font-weight: 600;
  color: #f0ebe5;
  letter-spacing: 0.01em;
}

.wp-close {
  background: none;
  border: none;
  color: #8a7d75;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition:
    color 0.12s,
    background 0.12s;
}
.wp-close:hover {
  color: #f0ebe5;
  background: #2e2420;
}

.wp-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
  scrollbar-color: #3a2e28 transparent;
}
.wp-list::-webkit-scrollbar {
  width: 4px;
}
.wp-list::-webkit-scrollbar-thumb {
  background: #3a2e28;
  border-radius: 2px;
}

.wp-card {
  background: #1c1816;
  border: 1px solid #2e2420;
  border-radius: 10px;
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  transition: border-color 0.12s;
}
.wp-card:hover {
  border-color: #3a2e28;
}

.wp-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.wp-icon {
  font-size: 17px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 1px;
}

.wp-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.wp-name {
  font-size: 13px;
  font-weight: 600;
  color: #f0ebe5;
  line-height: 1.3;
}

.wp-desc {
  font-size: 11px;
  color: #8a7d75;
  line-height: 1.4;
}

.wp-params {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.wp-param {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.wp-param-label {
  font-size: 11px;
  color: #6a5e58;
  font-weight: 500;
}

.wp-param-input {
  background: #100e0c;
  border: 1px solid #3a2e28;
  border-radius: 6px;
  color: #f0ebe5;
  font-size: 12px;
  font-family: inherit;
  padding: 5px 9px;
  outline: none;
  transition: border-color 0.12s;
}
.wp-param-input:focus {
  border-color: #d97757;
}
.wp-param-input::placeholder {
  color: #3a2e28;
}

.wp-run {
  align-self: flex-end;
  background: #d97757;
  border: 1px solid #c4664a;
  border-radius: 6px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 13px;
  cursor: pointer;
  letter-spacing: 0.02em;
  transition:
    background 0.12s,
    opacity 0.12s;
}
.wp-run:hover:not(:disabled) {
  background: #c4664a;
}
.wp-run:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
