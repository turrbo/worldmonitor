import type { CustomWidgetSpec } from '@/services/widget-store';
import { getWidgetAgentKey } from '@/services/widget-store';
import { sanitizeWidgetHtml } from '@/utils/widget-sanitizer';
import { widgetAgentUrl } from '@/utils/proxy';

interface WidgetChatOptions {
  mode: 'create' | 'modify';
  existingSpec?: CustomWidgetSpec;
  onComplete: (spec: CustomWidgetSpec) => void;
}

let overlay: HTMLElement | null = null;
let abortController: AbortController | null = null;
let clientTimeout: ReturnType<typeof setTimeout> | null = null;

export function openWidgetChatModal(options: WidgetChatOptions): void {
  closeWidgetChatModal();

  overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';

  const modal = document.createElement('div');
  modal.className = 'modal widget-chat-modal';

  const isModify = options.mode === 'modify';
  const titleText = isModify ? 'Modify Widget' : 'Create Widget with AI';

  modal.innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${titleText}</span>
      <button class="modal-close" aria-label="Close">\u2715</button>
    </div>
    <div class="widget-chat-messages"></div>
    <div class="widget-chat-preview"></div>
    <div class="widget-chat-input-row">
      <textarea class="widget-chat-input" placeholder="Describe your widget..." rows="2"></textarea>
      <button class="widget-chat-send">Send</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const messagesEl = modal.querySelector('.widget-chat-messages') as HTMLElement;
  const previewEl = modal.querySelector('.widget-chat-preview') as HTMLElement;
  const inputEl = modal.querySelector('.widget-chat-input') as HTMLTextAreaElement;
  const sendBtn = modal.querySelector('.widget-chat-send') as HTMLButtonElement;
  const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;

  if (isModify && options.existingSpec) {
    for (const msg of options.existingSpec.conversationHistory) {
      appendMessage(messagesEl, msg.role, msg.content);
    }
    if (options.existingSpec.html) {
      previewEl.innerHTML = sanitizeWidgetHtml(options.existingSpec.html);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  closeBtn.addEventListener('click', closeWidgetChatModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWidgetChatModal(); });

  const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeWidgetChatModal(); };
  document.addEventListener('keydown', escHandler);

  let currentSessionHtml: string | null = options.existingSpec?.html ?? null;

  const submit = async () => {
    const prompt = inputEl.value.trim();
    if (!prompt || sendBtn.disabled) return;

    inputEl.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    appendMessage(messagesEl, 'user', prompt);

    const existing = options.existingSpec;
    const body = JSON.stringify({
      prompt: prompt.slice(0, 2000),
      mode: options.mode,
      currentHtml: currentSessionHtml,
      conversationHistory: (existing?.conversationHistory ?? [])
        .map(m => ({ role: m.role, content: m.content.slice(0, 500) })),
    });

    abortController = new AbortController();
    clientTimeout = setTimeout(() => {
      abortController?.abort();
      appendMessage(messagesEl, 'assistant', 'Request timed out. Please try again.');
      resetSendBtn();
    }, 60_000);

    try {
      const res = await fetch(widgetAgentUrl(), {
        method: 'POST',
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': getWidgetAgentKey(),
        },
        body,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`);
      }

      let resultHtml = '';
      let resultTitle = '';
      let toolBadgeEl: HTMLElement | null = null;
      const statusEl = appendMessage(messagesEl, 'assistant', '');
      const radarEl = document.createElement('span');
      radarEl.className = 'widget-chat-radar';
      radarEl.innerHTML = '<span class="panel-loading-radar"><span class="panel-radar-sweep"></span><span class="panel-radar-dot"></span></span>';
      statusEl.appendChild(radarEl);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: { type: string; [k: string]: unknown };
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'tool_call') {
            if (!toolBadgeEl) {
              toolBadgeEl = document.createElement('span');
              toolBadgeEl.className = 'widget-chat-tool-badge';
              statusEl.appendChild(toolBadgeEl);
            }
            toolBadgeEl.textContent = `Fetching ${String(event.endpoint ?? 'data')}...`;
          } else if (event.type === 'html_complete') {
            resultHtml = String(event.html ?? '');
            currentSessionHtml = resultHtml;
            previewEl.innerHTML = sanitizeWidgetHtml(resultHtml);
          } else if (event.type === 'done') {
            resultTitle = String(event.title ?? 'Custom Widget');
            radarEl.remove();
            statusEl.textContent = `Widget ready: ${resultTitle}`;
            if (toolBadgeEl) toolBadgeEl.remove();

            previewEl.querySelector('.widget-chat-action-btn')?.remove();
            const actionBtn = document.createElement('button');
            actionBtn.className = 'widget-chat-action-btn';
            actionBtn.textContent = isModify ? 'Apply Changes' : 'Add to Dashboard';
            actionBtn.addEventListener('click', () => {
              if (clientTimeout) { clearTimeout(clientTimeout); clientTimeout = null; }
              const now = Date.now();
              const newSpec: CustomWidgetSpec = {
                id: existing?.id ?? `cw-${crypto.randomUUID()}`,
                title: resultTitle,
                html: resultHtml,
                prompt: existing?.prompt ?? prompt,
                accentColor: existing?.accentColor ?? null,
                conversationHistory: [
                  ...(existing?.conversationHistory ?? []),
                  { role: 'user' as const, content: prompt },
                  { role: 'assistant' as const, content: `Generated widget: ${resultTitle}` },
                ].slice(-10),
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
              };
              options.onComplete(newSpec);
              closeWidgetChatModal();
            });
            previewEl.appendChild(actionBtn);
          } else if (event.type === 'error') {
            radarEl.remove();
            statusEl.textContent = `Error: ${String(event.message ?? 'Unknown error')}`;
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      appendMessage(messagesEl, 'assistant', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      if (clientTimeout) { clearTimeout(clientTimeout); clientTimeout = null; }
      resetSendBtn();
    }
  };

  const resetSendBtn = () => {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  };

  sendBtn.addEventListener('click', () => void submit());
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); }
  });

  (overlay as HTMLElement & { _escHandler: (e: KeyboardEvent) => void })._escHandler = escHandler;
  inputEl.focus();
}

export function closeWidgetChatModal(): void {
  if (abortController) { abortController.abort(); abortController = null; }
  if (clientTimeout) { clearTimeout(clientTimeout); clientTimeout = null; }
  if (overlay) {
    const o = overlay as HTMLElement & { _escHandler?: (e: KeyboardEvent) => void };
    if (o._escHandler) document.removeEventListener('keydown', o._escHandler);
    overlay.remove();
    overlay = null;
  }
}

function appendMessage(container: HTMLElement, role: 'user' | 'assistant', text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `widget-chat-msg ${role}`;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}
