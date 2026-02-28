/* eslint-disable */
(function () {
  if (window.__MCP_CURSOR_OVERLAY_INSTALLED__) return;
  window.__MCP_CURSOR_OVERLAY_INSTALLED__ = true;

  const CURSOR_ID = '__mcp_cursor_dot__';
  const STYLE_ID = '__mcp_cursor_styles__';

  // Action-to-color mapping (warm palette matching Echo's design)
  const ACTION_COLORS = {
    left_click: '#d97757', // terra cotta
    right_click: '#e8a87c', // lighter terra
    double_click: '#e74c3c', // red
    triple_click: '#e74c3c',
    hover: '#5dade2', // blue for hover (stays persistent)
    left_click_drag: '#9b59b6', // purple for drag
    scroll: '#27ae60', // green for scroll
    default: '#d97757',
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${CURSOR_ID} {
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.9);
        z-index: 2147483647;
        pointer-events: none;
        box-sizing: border-box;
        display: none;
        will-change: transform, opacity;
      }
      #${CURSOR_ID}.mcp-action-click {
        animation: mcp_ripple 0.55s ease-out forwards;
      }
      #${CURSOR_ID}.mcp-action-hover {
        animation: mcp_pulse 1.6s ease-in-out infinite;
      }
      @keyframes mcp_ripple {
        0%   { transform: translate(-50%,-50%) scale(0.5); opacity: 1;   box-shadow: 0 0 0 0   var(--mcp-cursor-color, #d97757); }
        50%  { transform: translate(-50%,-50%) scale(1.1); opacity: 0.9; box-shadow: 0 0 0 10px transparent; }
        100% { transform: translate(-50%,-50%) scale(0.9); opacity: 0;   box-shadow: 0 0 0 18px transparent; }
      }
      @keyframes mcp_pulse {
        0%, 100% { transform: translate(-50%,-50%) scale(1);    opacity: 0.9; }
        50%       { transform: translate(-50%,-50%) scale(1.2);  opacity: 0.6; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureDot() {
    let el = document.getElementById(CURSOR_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = CURSOR_ID;
      document.documentElement.appendChild(el);
    }
    return el;
  }

  let hideTimer = null;

  function showCursor(x, y, action) {
    injectStyles();
    const el = ensureDot();
    const color = ACTION_COLORS[action] || ACTION_COLORS.default;

    clearTimeout(hideTimer);

    // Reset animation by removing class, forcing reflow, then re-adding
    el.className = '';
    el.style.cssText = [
      'position:fixed',
      `left:${x}px`,
      `top:${y}px`,
      'width:20px',
      'height:20px',
      'border-radius:50%',
      'border:2px solid rgba(255,255,255,0.9)',
      `background:${color}`,
      `--mcp-cursor-color:${color}`,
      'z-index:2147483647',
      'pointer-events:none',
      'box-sizing:border-box',
      'display:block',
      'will-change:transform,opacity',
    ].join(';');

    // Force reflow so animation restarts cleanly
    void el.offsetWidth;

    if (action === 'hover') {
      el.classList.add('mcp-action-hover');
      // Hover stays until next action — no auto-hide
    } else {
      el.classList.add('mcp-action-click');
      // Auto-hide after animation completes
      hideTimer = setTimeout(function () {
        el.style.display = 'none';
        el.className = '';
      }, 600);
    }
  }

  function hideCursor() {
    clearTimeout(hideTimer);
    var el = document.getElementById(CURSOR_ID);
    if (el) {
      el.style.display = 'none';
      el.className = '';
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.action === 'mcp_show_cursor') {
      showCursor(msg.x, msg.y, msg.type || 'left_click');
      sendResponse({ ok: true });
    } else if (msg.action === 'mcp_hide_cursor') {
      hideCursor();
      sendResponse({ ok: true });
    }
  });
})();
