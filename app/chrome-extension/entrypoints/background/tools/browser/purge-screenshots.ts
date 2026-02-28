import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';

interface PurgeScreenshotsParams {
  nameContains?: string;
  dryRun?: boolean;
  maxAgeDays?: number;
}

interface PurgeResult {
  found: number;
  deleted: number;
  skipped: number;
  dryRun: boolean;
  files: string[];
}

class PurgeScreenshotsTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.PURGE_SCREENSHOTS;

  async execute(args: PurgeScreenshotsParams): Promise<ToolResult> {
    const nameContains = args?.nameContains?.trim() ?? '';
    const dryRun = args?.dryRun === true;
    const maxAgeDays = typeof args?.maxAgeDays === 'number' ? args.maxAgeDays : undefined;

    try {
      // Search downloads for screenshot PNG files
      const query: chrome.downloads.DownloadQuery = {
        filenameRegex: nameContains
          ? `.*${nameContains.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\.png`
          : '.*\\.png',
        orderBy: ['-startTime'],
        limit: 500,
      };

      const items = await chrome.downloads.search(query);

      // Filter to only screenshot files (contain timestamp pattern like _2026-02-28T...)
      const SCREENSHOT_PATTERN = /_\d{4}-\d{2}-\d{2}T/;
      const cutoffMs = maxAgeDays !== undefined ? Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 : 0;

      const candidates = items.filter((item) => {
        const filename = item.filename || '';
        const basename = filename.split('/').pop() ?? filename;
        if (!SCREENSHOT_PATTERN.test(basename)) return false;
        if (maxAgeDays !== undefined) {
          const startTime = new Date(item.startTime ?? 0).getTime();
          if (startTime > cutoffMs) return false;
        }
        return true;
      });

      const result: PurgeResult = {
        found: candidates.length,
        deleted: 0,
        skipped: 0,
        dryRun,
        files: candidates.map((i) => i.filename || i.url),
      };

      if (!dryRun) {
        for (const item of candidates) {
          try {
            // Remove file from disk (only works if download is complete)
            if (item.state === 'complete') {
              await chrome.downloads.removeFile(item.id);
            }
            // Erase record from download history
            await chrome.downloads.erase({ id: item.id });
            result.deleted++;
          } catch (e) {
            console.warn('[PurgeScreenshots] Failed to delete', item.filename, e);
            result.skipped++;
          }
        }
      }

      const summary = dryRun
        ? `Found ${result.found} screenshot(s) — dry run, nothing deleted.`
        : `Deleted ${result.deleted} screenshot(s)${result.skipped > 0 ? `, skipped ${result.skipped}` : ''}.`;

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, summary, ...result }) }],
        isError: false,
      };
    } catch (e: any) {
      return createErrorResponse(`purge_screenshots failed: ${e?.message ?? String(e)}`);
    }
  }
}

export const purgeScreenshotsTool = new PurgeScreenshotsTool();
