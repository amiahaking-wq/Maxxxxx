'use client';
import { Message } from '@/app/lib/types';

/**
 * Export conversation as JSON.
 * Includes all messages with metadata (role, content, timestamp, provider, model).
 */
export function exportAsJson(messages: Message[], title: string = 'Conversation') {
  const data = {
    title,
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      reasoning: m.reasoning,
      provider: m.provider,
      model: m.model,
      timestamp: m.timestamp,
      toolCalls: m.toolCalls,
      artifacts: m.artifacts,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `${sanitizeFilename(title)}.json`);
}

/**
 * Export conversation as plain text (Markdown-like).
 * Readable in any text editor; also serves as a PDF fallback.
 */
export function exportAsText(messages: Message[], title: string = 'Conversation') {
  const lines: string[] = [
    `# ${title}`,
    '',
    `_Exported: ${new Date().toLocaleString()}_`,
    `_Messages: ${messages.length}_`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push(`## You`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    } else if (msg.role === 'assistant') {
      const modelInfo = msg.provider && msg.model ? ` _(${msg.provider} · ${msg.model})_` : '';
      lines.push(`## MAX${modelInfo}`);
      lines.push('');
      if (msg.reasoning) {
        lines.push('<details><summary>Thought process</summary>');
        lines.push('');
        lines.push(msg.reasoning);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
      lines.push(msg.content);
      lines.push('');
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        lines.push('**Tool calls:**');
        for (const tc of msg.toolCalls) {
          lines.push(`- \`${tc.name}\` — ${tc.status}`);
        }
        lines.push('');
      }
    } else if (msg.role === 'system') {
      lines.push(`> _System: ${msg.content}_`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  triggerDownload(blob, `${sanitizeFilename(title)}.md`);
}

/**
 * Export conversation as PDF using the browser's print dialog.
 * Opens a new window with formatted HTML and triggers print.
 */
export function exportAsPdf(messages: Message[], title: string = 'Conversation') {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) {
    alert('Please allow popups to export as PDF.');
    return;
  }

  const html = generatePrintableHtml(messages, title);
  win.document.write(html);
  win.document.close();

  // Wait for content to render, then trigger print
  win.onload = () => {
    setTimeout(() => {
      win.print();
    }, 250);
  };
}

function generatePrintableHtml(messages: Message[], title: string): string {
  const messageHtml = messages.map(msg => {
    if (msg.role === 'user') {
      return `
        <div class="msg user">
          <div class="role">You</div>
          <div class="content">${escapeHtml(msg.content)}</div>
        </div>`;
    }
    if (msg.role === 'assistant') {
      const modelBadge = msg.provider && msg.model
        ? `<div class="model">${escapeHtml(msg.provider)} · ${escapeHtml(msg.model)}</div>`
        : '';
      const reasoning = msg.reasoning
        ? `<details class="reasoning"><summary>Thought process</summary><pre>${escapeHtml(msg.reasoning)}</pre></details>`
        : '';
      return `
        <div class="msg assistant">
          <div class="role">MAX</div>
          ${modelBadge}
          ${reasoning}
          <div class="content">${escapeHtml(msg.content)}</div>
        </div>`;
    }
    if (msg.role === 'system') {
      return `<div class="msg system"><em>System: ${escapeHtml(msg.content)}</em></div>`;
    }
    return '';
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #0d0d0d;
      line-height: 1.6;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #6e6e6e; font-size: 13px; margin-bottom: 32px; }
    .msg { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #ececec; }
    .msg:last-child { border-bottom: none; }
    .role { font-weight: 600; margin-bottom: 4px; }
    .msg.user .role { color: #2563eb; }
    .msg.assistant .role { color: #10a37f; }
    .model { font-size: 12px; color: #6e6e6e; margin-bottom: 8px; }
    .content { white-space: pre-wrap; word-wrap: break-word; }
    .reasoning { margin: 8px 0; }
    .reasoning summary { cursor: pointer; color: #6e6e6e; font-size: 13px; }
    .reasoning pre { background: #f4f4f4; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; }
    .msg.system { color: #6e6e6e; font-style: italic; }
    @media print {
      body { padding: 0; }
      .msg { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    Exported: ${new Date().toLocaleString()} · ${messages.length} messages
  </div>
  ${messageHtml}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 50) || 'conversation';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
