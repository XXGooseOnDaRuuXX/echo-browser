import { ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { screenshotContextManager } from '@/utils/screenshot-context';

class ResetTransportTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.RESET_TRANSPORT;

  async execute(_args: Record<string, never>): Promise<ToolResult> {
    const errors: string[] = [];

    // Detach any stale CDP sessions across all tabs
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id) continue;
        try {
          await cdpSessionManager.forceDetach(tab.id);
        } catch {
          // Ignore per-tab errors
        }
        // Clear screenshot context for this tab
        screenshotContextManager.clear(tab.id);
      }
    } catch (e) {
      errors.push(`Tab sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message:
              errors.length === 0
                ? 'Transport reset complete. CDP sessions detached, screenshot context cleared. Next tool call will start fresh.'
                : 'Transport reset completed with warnings.',
            warnings: errors.length > 0 ? errors : undefined,
          }),
        },
      ],
      isError: false,
    };
  }
}

export const resetTransportTool = new ResetTransportTool();
