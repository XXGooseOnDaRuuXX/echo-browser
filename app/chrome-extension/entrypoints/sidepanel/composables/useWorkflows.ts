import { ref, computed } from 'vue';

export interface WorkflowParam {
  key: string;
  label: string;
  placeholder?: string;
}

export interface Workflow {
  id: string;
  name: string;
  icon: string;
  description: string;
  prompt: string;
  params?: WorkflowParam[];
}

const STORAGE_KEY = 'echo-workflows-v1';

const DEFAULT_WORKFLOWS: Workflow[] = [
  {
    id: 'summarize-page',
    name: 'Summarize Page',
    icon: '📄',
    description: 'Screenshot and summarize the current tab',
    prompt:
      'Take a screenshot of the current tab and give me a clear, concise summary of what is on the page.',
  },
  {
    id: 'linear-board-sweep',
    name: 'Linear Board Sweep',
    icon: '📋',
    description: 'Scan the active Linear board, summarize status, flag blockers',
    prompt:
      'Sweep my active Linear board: list all in-progress issues, summarize their status, and highlight anything blocked or overdue.',
  },
  {
    id: 'github-pr-review',
    name: 'GitHub PR Review',
    icon: '🔍',
    description: 'Check open pull requests and give a status brief',
    prompt:
      'Check my open GitHub pull requests. For each one: title, author, review status, and any blocking comments or failing checks.',
  },
  {
    id: 'morning-scan',
    name: 'Morning Scan',
    icon: '🌅',
    description: 'Linear + GitHub overview to start the day',
    prompt:
      'Morning standup brief: (1) open Linear issues by priority, (2) GitHub PRs waiting on review, (3) anything needing immediate attention.',
  },
  {
    id: 'client-triage',
    name: 'Client Triage',
    icon: '🎯',
    description: 'Check Linear and GitHub for a specific client',
    prompt:
      'Triage everything related to client "{client}": find all open Linear issues, relevant GitHub PRs, and summarize current state in bullet points.',
    params: [{ key: 'client', label: 'Client name', placeholder: 'e.g. Acme Corp' }],
  },
  {
    id: 'find-and-click',
    name: 'Find & Click',
    icon: '🖱️',
    description: 'Read the page and click a specific element',
    prompt:
      'On the current page, find the element matching this description: "{element}". Then click it.',
    params: [
      { key: 'element', label: 'Element to click', placeholder: 'e.g. the blue Submit button' },
    ],
  },
];

export function useWorkflows() {
  const customWorkflows = ref<Workflow[]>([]);

  const allWorkflows = computed<Workflow[]>(() => {
    const customMap = new Map(customWorkflows.value.map((w) => [w.id, w]));
    const base = DEFAULT_WORKFLOWS.map((w) => customMap.get(w.id) ?? w);
    const extras = customWorkflows.value.filter(
      (w) => !DEFAULT_WORKFLOWS.some((d) => d.id === w.id),
    );
    return [...base, ...extras];
  });

  async function load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (Array.isArray(result[STORAGE_KEY])) {
        customWorkflows.value = result[STORAGE_KEY] as Workflow[];
      }
    } catch {
      // storage unavailable — use defaults only
    }
  }

  function formatPrompt(prompt: string, values: Record<string, string>): string {
    return prompt.replace(/\{(\w+)\}/g, (match, key) => values[key]?.trim() || match);
  }

  return { allWorkflows, load, formatPrompt };
}
