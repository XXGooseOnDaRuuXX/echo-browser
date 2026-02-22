import { ToolExecutor } from '@/common/tool-handler';
import type { ToolResult } from '@/common/tool-handler';
import { TIMEOUTS, ERROR_MESSAGES } from '@/common/constants';

// 300ms was too aggressive for Chrome IPC round-trip latency on real-world pages.
// Increased to 2000ms to accommodate slow tabs, heavy JS, and service worker restarts.
const PING_TIMEOUT_MS = 2000;
const PING_MAX_RETRIES = 2;

/**
 * Base class for browser tool executors
 */
export abstract class BaseBrowserToolExecutor implements ToolExecutor {
  abstract name: string;
  abstract execute(args: any): Promise<ToolResult>;

  /**
   * Ping a tab to check if content script is already injected.
   * Returns true if pong received, false if timed out or error.
   * Uses exponential backoff for retries.
   */
  private async pingContentScript(tabId: number, frameId?: number, attempt = 0): Promise<boolean> {
    const timeoutMs = PING_TIMEOUT_MS * Math.pow(1.5, attempt);
    try {
      const response = await Promise.race([
        typeof frameId === 'number'
          ? chrome.tabs.sendMessage(tabId, { action: `${this.name}_ping` }, { frameId })
          : chrome.tabs.sendMessage(tabId, { action: `${this.name}_ping` }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${this.name} Ping action to tab ${tabId} timed out`)),
            timeoutMs,
          ),
        ),
      ]);

      if (response && response.status === 'pong') {
        console.log(`pong received for action '${this.name}' in tab ${tabId}. Script is active.`);
        return true;
      }
      console.warn(`Unexpected ping response in tab ${tabId}:`, response);
      return false;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < PING_MAX_RETRIES) {
        const backoffMs = 100 * Math.pow(2, attempt);
        console.warn(
          `ping attempt ${attempt + 1}/${PING_MAX_RETRIES + 1} failed (${msg}), retrying in ${backoffMs}ms`,
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        return this.pingContentScript(tabId, frameId, attempt + 1);
      }
      console.error(`ping content script failed after ${PING_MAX_RETRIES + 1} attempts: ${msg}`);
      return false;
    }
  }

  /**
   * Inject content script into tab
   */
  protected async injectContentScript(
    tabId: number,
    files: string[],
    injectImmediately = false,
    world: 'MAIN' | 'ISOLATED' = 'ISOLATED',
    allFrames: boolean = false,
    frameIds?: number[],
  ): Promise<void> {
    console.log(`Injecting ${files.join(', ')} into tab ${tabId}`);

    // Check if script is already injected — bail early if pong received
    const pingFrameId = frameIds?.[0];
    const alreadyInjected = await this.pingContentScript(tabId, pingFrameId);
    if (alreadyInjected) return;

    try {
      const target: { tabId: number; allFrames?: boolean; frameIds?: number[] } = { tabId };
      if (frameIds && frameIds.length > 0) {
        target.frameIds = frameIds;
      } else if (allFrames) {
        target.allFrames = true;
      }
      await chrome.scripting.executeScript({
        target,
        files,
        injectImmediately,
        world,
      } as any);
      console.log(`'${files.join(', ')}' injection successful for tab ${tabId}`);
    } catch (injectionError) {
      const errorMessage =
        injectionError instanceof Error ? injectionError.message : String(injectionError);
      console.error(
        `Content script '${files.join(', ')}' injection failed for tab ${tabId}: ${errorMessage}`,
      );
      throw new Error(
        `${ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: Failed to inject content script in tab ${tabId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Send message to tab
   */
  protected async sendMessageToTab(tabId: number, message: any, frameId?: number): Promise<any> {
    try {
      const response =
        typeof frameId === 'number'
          ? await chrome.tabs.sendMessage(tabId, message, { frameId })
          : await chrome.tabs.sendMessage(tabId, message);

      if (response && response.error) {
        throw new Error(String(response.error));
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Error sending message to tab ${tabId} for action ${message?.action || 'unknown'}: ${errorMessage}`,
      );

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * Try to get an existing tab by id. Returns null when not found.
   */
  protected async tryGetTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
    if (typeof tabId !== 'number') return null;
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  }

  /**
   * Get the active tab in the current window. Throws when not found.
   */
  protected async getActiveTabOrThrow(): Promise<chrome.tabs.Tab> {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!active || !active.id) throw new Error('Active tab not found');
    return active;
  }

  /**
   * Optionally focus window and/or activate tab. Defaults preserve current behavior
   * when caller sets activate/focus flags explicitly.
   */
  protected async ensureFocus(
    tab: chrome.tabs.Tab,
    options: { activate?: boolean; focusWindow?: boolean } = {},
  ): Promise<void> {
    const activate = options.activate === true;
    const focusWindow = options.focusWindow === true;
    if (focusWindow && typeof tab.windowId === 'number') {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    if (activate && typeof tab.id === 'number') {
      await chrome.tabs.update(tab.id, { active: true });
    }
  }

  /**
   * Get the active tab. When windowId provided, search within that window; otherwise currentWindow.
   */
  protected async getActiveTabInWindow(windowId?: number): Promise<chrome.tabs.Tab | null> {
    if (typeof windowId === 'number') {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      return tabs && tabs[0] ? tabs[0] : null;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  /**
   * Same as getActiveTabInWindow, but throws if not found.
   */
  protected async getActiveTabOrThrowInWindow(windowId?: number): Promise<chrome.tabs.Tab> {
    const tab = await this.getActiveTabInWindow(windowId);
    if (!tab || !tab.id) throw new Error('Active tab not found');
    return tab;
  }
}
