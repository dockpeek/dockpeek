
import { apiUrl } from './config.js';
import { ansiParser } from './ansi-parser.js';
import { filterByContainerName } from './filters.js';
import { escapeHtml } from './sanitize.js';

export class LogsViewer {
  constructor() {
    this.modal = null;
    this.logsContent = null;
    this.streamReader = null;
    this.isStreaming = false;
    this.currentServer = null;
    this.currentContainer = null;
    this.isSwarm = false;
    this.autoScroll = true;
    this.searchMatches = [];
    this.currentMatchIndex = -1;
    this.containerList = [];
    this.currentContainerIndex = -1;
    this.fetchController = null;
    this.streamController = null;
    this.initModal();
  }

  initModal() {
    const modalHTML = `
      <div id="logs-modal" class="modal-overlay hidden">
        <div class="logs-modal-content">
          <div class="logs-header">
            <div class="logs-title-section">            
              <div class="logs-container-info">
                <h3 class="text-lg font-semibold text-gray-900">
                  <span id="logs-container-name" class="text-blue-600 cursor-pointer hover:underline"></span>
                </h3>
                <div class="logs-meta">
                  <span id="logs-server-name" class="text-sm text-gray-500"></span>
                  <span id="logs-stack-name" class="text-sm text-gray-400"></span>
                </div>
              </div>
              <button id="logs-prev-container" class="logs-nav-arrow" data-tooltip="Previous container (←)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button id="logs-next-container" class="logs-nav-arrow" data-tooltip="Next container (→)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
              <button id="logs-close-button" class="logs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>            
          </div>
          
          <div class="logs-controls">
            <div class="logs-controls-left">
              <button id="logs-refresh-btn" class="logs-control-btn" data-tooltip="Refresh logs">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 3V8M21 8H16M21 8L18 5.29C16.4 3.87 14.3 3 12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.28 21 19.87 18.01 20.78 14"/>
                </svg>
                Refresh
              </button>
              
              <button id="logs-stream-btn" class="logs-control-btn" data-tooltip="Toggle live streaming">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span id="logs-stream-text">Stream Live</span>
              </button>
              
              <button id="logs-clear-btn" class="logs-control-btn" data-tooltip="Clear logs display">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Clear
              </button>
              
              <label class="logs-checkbox-label">
                <input type="checkbox" id="logs-autoscroll-checkbox" checked>
                <span>Auto-scroll</span>
              </label>
              
              <select id="logs-tail-select" class="logs-select">
                <option value="100" selected>Last 100 lines</option>
                <option value="1000">Last 1000 lines</option>
                <option value="5000">Last 5 000 lines</option>
                <option value="10000">Last 10 000 lines</option>
                <option value="all">All logs</option>
              </select>
            </div>
            
            <div class="logs-controls-right">
              <label class="logs-checkbox-label">
                <input type="checkbox" id="logs-wrap-checkbox" checked>
                <span>Wrap lines</span>
              </label>
              
              <select id="logs-fontsize-select" class="logs-select">
                <option value="11">Font: 11px</option>
                <option value="12">Font: 12px</option>
                <option value="13" selected>Font: 13px</option>
                <option value="14">Font: 14px</option>
                <option value="15">Font: 15px</option>
                <option value="16">Font: 16px</option>
              </select>
              
              <button id="logs-download-btn" class="logs-control-btn" data-tooltip="Download logs">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download
              </button>
            </div>
          </div>
          
          <div class="logs-search-bar">
            <input type="text" id="logs-search-input" placeholder="Search in logs..." class="logs-search-input">
            <div class="logs-search-controls">
              <button id="logs-search-clear" class="logs-search-clear hidden">×</button>
              <span id="logs-search-count" class="logs-search-count hidden">0/0</span>
              <button id="logs-search-prev" class="logs-search-nav hidden" title="Previous (Shift+Enter)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button id="logs-search-next" class="logs-search-nav hidden" title="Next (Enter)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
          
          <div id="logs-content" class="logs-content">
            <div class="logs-loading">
              <svg class="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading logs...</span>
            </div>
          </div>
          
          <div class="logs-footer">
            <span id="logs-line-count" class="text-sm text-gray-500"></span>
            <span id="logs-status" class="text-sm text-gray-500"></span>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('logs-modal');
    this.logsContent = document.getElementById('logs-content');
    this.attachEventListeners();
  }

  setContainerList(containers, currentServer, currentContainer) {
    this.containerList = containers.map(c => ({
      server: c.server,
      name: c.name,
      stack: c.stack,
      is_swarm: c.is_swarm || false
    }));

    this.currentContainerIndex = this.containerList.findIndex(
      c => c.server === currentServer && c.name === currentContainer
    );

    if (this.currentContainerIndex === -1) {
      this.currentContainerIndex = 0;
    }
  }


  navigateToContainer(direction) {
    if (this.containerList.length === 0) return;

    const wasStreaming = this.isStreaming;

    this.stopStreaming();

    this.currentContainerIndex += direction;

    if (this.currentContainerIndex < 0) {
      this.currentContainerIndex = this.containerList.length - 1;
    } else if (this.currentContainerIndex >= this.containerList.length) {
      this.currentContainerIndex = 0;
    }

    const container = this.containerList[this.currentContainerIndex];
    const newIsSwarm = container.is_swarm || false;

    this.open(container.server, container.name, false, newIsSwarm);
  }


  attachEventListeners() {
    document.getElementById('logs-close-button').addEventListener('click', () => this.close());
    document.getElementById('logs-refresh-btn').addEventListener('click', () => this.refresh());
    document.getElementById('logs-stream-btn').addEventListener('click', () => this.toggleStreaming());
    document.getElementById('logs-clear-btn').addEventListener('click', () => this.clearLogs());
    document.getElementById('logs-download-btn').addEventListener('click', () => this.downloadLogs());

    const wrapCheckbox = document.getElementById('logs-wrap-checkbox');
    wrapCheckbox.addEventListener('change', (e) => {
      const pre = this.logsContent.querySelector('.logs-pre');
      if (pre) {
        pre.style.whiteSpace = e.target.checked ? 'pre-wrap' : 'pre';
      }
    });

    const fontSizeSelect = document.getElementById('logs-fontsize-select');
    fontSizeSelect.addEventListener('change', (e) => {
      this.logsContent.style.fontSize = e.target.value + 'px';
    });

    const autoScrollCheckbox = document.getElementById('logs-autoscroll-checkbox');
    autoScrollCheckbox.addEventListener('change', (e) => {
      this.autoScroll = e.target.checked;
    });

    const tailSelect = document.getElementById('logs-tail-select');
    tailSelect.addEventListener('change', () => this.refresh());

    const searchInput = document.getElementById('logs-search-input');
    searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.navigateToPrevMatch();
        } else {
          this.navigateToNextMatch();
        }
      }
    });

    document.getElementById('logs-search-clear').addEventListener('click', () => {
      searchInput.value = '';
      this.handleSearch('');
    });

    document.getElementById('logs-search-prev').addEventListener('click', () => {
      this.navigateToPrevMatch();
    });

    document.getElementById('logs-search-next').addEventListener('click', () => {
      this.navigateToNextMatch();
    });

    document.getElementById('logs-prev-container').addEventListener('click', () => {
      this.navigateToContainer(-1);
    });

    document.getElementById('logs-next-container').addEventListener('click', () => {
      this.navigateToContainer(1);
    });

    document.getElementById('logs-stack-name').addEventListener('click', (e) => {
      const target = e.target.closest('.logs-stack-link');
      if (!target) return;

      const stack = target.dataset.stack;
      const server = target.dataset.server;

      if (stack && server) {
        this.close();

        import('./filters.js').then(({ filterByStackAndServer }) => {
          filterByStackAndServer(stack, server);
        });
      }
    });


    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (this.modal.classList.contains('hidden')) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigateToContainer(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigateToContainer(1);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });

    document.getElementById('logs-container-name').addEventListener('click', () => {
      if (!this.currentContainer || !this.currentServer) return;
      const containerName = this.currentContainer;
      const serverName = this.currentServer;
      this.close();
      filterByContainerName(containerName, serverName);
    });


  }

  async open(serverName, containerName, autoStream = false, isSwarm = false) {
    this.stopStreaming();

    if (this.fetchController) {
      this.fetchController.abort();
    }

    this.fetchController = new AbortController();

    this.savedScrollPosition = window.pageYOffset;
    document.body.style.overflow = 'hidden';

    this.currentServer = serverName;
    this.currentContainer = containerName;

    this.isSwarm = isSwarm;

    this.currentContainerIndex = this.containerList.findIndex(
      c => c.server === serverName && c.name === containerName
    );

    if (this.currentContainerIndex === -1) {
      this.currentContainerIndex = 0;
    }

    const currentContainer = this.containerList[this.currentContainerIndex];
    const stackName = currentContainer?.stack || '';

    document.getElementById('logs-container-name').textContent = containerName;
    document.getElementById('logs-server-name').textContent = `${serverName}`;

    const stackElement = document.getElementById('logs-stack-name');
    if (stackName) {
      stackElement.innerHTML = `• <span class="logs-stack-link">${escapeHtml(stackName)}</span>`;
      const stackLink = stackElement.querySelector('.logs-stack-link');
      stackLink.style.cursor = 'pointer';
      stackLink.dataset.stack = stackName;
      stackLink.dataset.server = serverName;
    } else {
      stackElement.textContent = '';
    }

    this.modal.classList.remove('hidden');

    const wrapCheckbox = document.getElementById('logs-wrap-checkbox');
    const pre = this.logsContent.querySelector('.logs-pre');
    if (pre) {
      pre.style.whiteSpace = wrapCheckbox.checked ? 'pre-wrap' : 'pre';
    }

    this.showLoading();
    this.showLoading();

    if (autoStream) {
      await this.startStreaming();
    } else {
      await this.fetchLogs();
    }
  }


  close() {
    this.stopStreaming();

    if (this.fetchController) {
      this.fetchController.abort();
      this.fetchController = null;
    }

    if (this.streamController) {
      this.streamController.abort();
      this.streamController = null;
    }

    document.body.style.overflow = '';

    this.modal.classList.add('hidden');
    this.logsContent.innerHTML = '';
    const searchInput = document.getElementById('logs-search-input');
    searchInput.value = '';
    document.getElementById('logs-search-clear').classList.add('hidden');
    document.getElementById('logs-search-count').classList.add('hidden');
    document.getElementById('logs-search-prev').classList.add('hidden');
    document.getElementById('logs-search-next').classList.add('hidden');
    this.updateLineCount(0);
    this.updateStatus('');

    this.currentServer = null;
    this.currentContainer = null;
    this.searchMatches = [];
    this.currentMatchIndex = -1;
  }

  showLoading() {
    this.logsContent.innerHTML = `
      <div class="logs-loading">
        <svg class="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Loading logs...</span>
      </div>
    `;
  }

  async fetchLogs() {
    const tailSelect = document.getElementById('logs-tail-select');
    const tail = tailSelect.value === 'all' ? 10000 : parseInt(tailSelect.value);

    try {
      const response = await fetch(apiUrl('/get-container-logs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_name: this.currentServer,
          container_name: this.currentContainer,
          tail: tail,
          is_swarm: this.isSwarm || false
        }),
        signal: this.fetchController.signal
      });

      const data = await response.json();

      if (data.success) {
        this.displayLogs(data.logs);
        this.updateLineCount(data.lines);
        this.updateStatus('Logs loaded');
      } else {
        this.displayError(data.error);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted');
        return;
      }
      this.displayError(`Failed to fetch logs: ${error.message}`);
    }
  }

  displayLogs(logsText) {
    const lines = logsText.split('\n');
    const logsHTML = lines.map(line => this.formatLogLine(line)).join('');

    const wrapCheckbox = document.getElementById('logs-wrap-checkbox');
    const whiteSpace = wrapCheckbox.checked ? 'pre-wrap' : 'pre';

    this.logsContent.innerHTML = `<pre class="logs-pre" style="white-space: ${whiteSpace};">${logsHTML}</pre>`;

    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  formatLogLine(line) {
    if (!line.trim()) return '';

    let taskPrefix = '';
    let timestampPart = '';
    let contentPart = line;


    const timestampRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/;
    const timestampMatch = line.match(timestampRegex);

    if (timestampMatch) {
      timestampPart = this.formatTimestamp(timestampMatch[1]);
      contentPart = timestampMatch[2];
    }


    const swarmDetailsRegex = /^com\.docker\.swarm\.[^\s]+ (.*)$/;
    const swarmMatch = contentPart.match(swarmDetailsRegex);

    if (swarmMatch) {
      const taskIdMatch = contentPart.match(/com\.docker\.swarm\.task\.id=([a-z0-9]+)/);
      if (taskIdMatch) {
        const shortTaskId = taskIdMatch[1].substring(0, 12);
        taskPrefix = `<span class="log-task-id">[${shortTaskId}]</span> `;
      }
      contentPart = swarmMatch[1];
    }

    const colorizedContent = this.colorizeLogLine(contentPart);

    if (timestampPart) {
      return `<div class="log-line"><span class="log-timestamp">${timestampPart}</span> ${taskPrefix}${colorizedContent}</div>`;
    } else {
      return `<div class="log-line">${taskPrefix}${colorizedContent}</div>`;
    }
  }

  formatTimestamp(isoString) {
    try {
      const date = new Date(isoString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      return `<span class="log-date">${year}-${month}-${day}</span> <span class="log-time">${hours}:${minutes}:${seconds}</span>`;
    } catch (e) {
      return isoString;
    }
  }

  colorizeLogLine(line) {
    if (!line.trim()) return '';

    return ansiParser.parseWithColorizer(line, (escapedHtml, originalText) => {
      const urls = [];
      const urlPlaceholder = '___URL___';

      escapedHtml = escapedHtml.replace(
        /https?:\/\/[^\s"'<>|\\{}[\]`]+/g,
        (match) => {
          const cleaned = match.replace(/[.,;:!?)}"':]+$/, '');
          urls.push(cleaned);
          return `${urlPlaceholder}${urls.length - 1}${urlPlaceholder}`;
        }
      );

      escapedHtml = escapedHtml.replace(/(\d+)/g, (match, num, offset) => {
        const before = escapedHtml.substring(Math.max(0, offset - urlPlaceholder.length), offset);
        const after = escapedHtml.substring(offset + match.length, offset + match.length + urlPlaceholder.length);

        if (before === urlPlaceholder && after === urlPlaceholder) {
          return match;
        }
        return `<span class="log-number">${match}</span>`;
      });

      escapedHtml = escapedHtml.replace(
        new RegExp(`${urlPlaceholder}(\\d+)${urlPlaceholder}`, 'g'),
        (match, index) => {
          const url = urls[parseInt(index)];
          return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="log-link">${url}</a>`;
        }
      );

      if (/\b(ERROR|ERR|ERRO)\b|\[(ERROR|ERR|ERRO)\]/i.test(originalText)) {
        return `<span class="log-error">${escapedHtml}</span>`;
      }
      if (/\b(WARN|WARNING)\b|\[(WARN|WARNING)\]/i.test(originalText)) {
        return `<span class="log-warning">${escapedHtml}</span>`;
      }
      if (/\b(INFO)\b|\[(INFO)\]/i.test(originalText)) {
        return `<span class="log-info">${escapedHtml}</span>`;
      }
      if (/\b(DEBUG|TRACE)\b|\[(DEBUG|TRACE)\]/i.test(originalText)) {
        return `<span class="log-debug">${escapedHtml}</span>`;
      }
      if (/\b(SUCCESS|OK|DONE|READY)\b|\[(SUCCESS|OK|DONE|READY)\]/i.test(originalText)) {
        return `<span class="log-success">${escapedHtml}</span>`;
      }

      return escapedHtml;
    });
  }

  async toggleStreaming() {
    if (this.isStreaming) {
      this.stopStreaming();
    } else {
      await this.startStreaming();
    }
  }

  async startStreaming() {
    this.stopStreaming();
    this.clearLogs();

    const tailSelect = document.getElementById('logs-tail-select');
    const tail = Math.min(parseInt(tailSelect.value) || 100, 100);

    this.isStreaming = true;
    this.streamController = new AbortController();
    this.updateStreamButton();

    let isFirstConnect = true;
    let connectionStartTime = null;
    let currentReader = null;

    const connect = async () => {
      try {
        connectionStartTime = Date.now();

        const currentLineCount = this.logsContent.querySelectorAll('.log-line').length;
        const reconnectTail = Math.max(1, currentLineCount);

        const response = await fetch(apiUrl('/stream-container-logs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            server_name: this.currentServer,
            container_name: this.currentContainer,
            tail: isFirstConnect ? tail : reconnectTail,
            is_swarm: this.isSwarm || false
          }),
          signal: this.streamController.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        this.updateStatus('Streaming live...');

        if (!isFirstConnect) {
          this.logsContent.innerHTML = '<pre class="logs-pre"></pre>';
        }

        isFirstConnect = false;

        const reader = response.body.getReader();
        currentReader = reader;
        const decoder = new TextDecoder();
        let buffer = '';

        while (this.isStreaming) {
          if (Date.now() - connectionStartTime > 480000) {
            console.log('Reconnecting after 8 minutes');
            break;
          }

          const { done, value } = await reader.read();

          if (done) {
            console.log('Stream ended by server');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);

                if (data.heartbeat) {
                  continue;
                }

                if (data.error) {
                  console.error('Stream error:', data.error);
                  this.stopStreaming();
                  return;
                }

                if (data.line) {
                  this.appendLogLine(data.line);
                }
              } catch (e) {
                console.error('Failed to parse line:', line, e);
              }
            }
          }
        }

        try {
          await reader.cancel();
        } catch (e) {
          console.log('Reader cleanup:', e.message);
        }

        if (this.isStreaming) {
          throw new Error('Reconnecting...');
        }

      } catch (error) {
        if (error.name === 'AbortError' || !this.isStreaming) {
          console.log('Stream stopped');

          if (currentReader) {
            try {
              await currentReader.cancel();
            } catch (e) { }
          }

          return;
        }

        console.log('Reconnecting...', error.message);

        if (currentReader) {
          try {
            await currentReader.cancel();
          } catch (e) { }
        }

        await new Promise(r => setTimeout(r, 1000));

        if (this.isStreaming) {
          await connect();
        }
      }
    };

    await connect();

    this.isStreaming = false;
    this.updateStreamButton();
  }

  stopStreaming() {
    this.isStreaming = false;

    if (this.streamController) {
      this.streamController.abort();
      this.streamController = null;
    }

    this.updateStreamButton();
    this.updateStatus('Stream stopped');
  }

  appendLogLine(line) {
    let pre = this.logsContent.querySelector('.logs-pre');


    if (!pre) {
      const wrapCheckbox = document.getElementById('logs-wrap-checkbox');
      const whiteSpace = wrapCheckbox.checked ? 'pre-wrap' : 'pre';
      this.logsContent.innerHTML = `<pre class="logs-pre" style="white-space: ${whiteSpace};"></pre>`;
      pre = this.logsContent.querySelector('.logs-pre');
    }

    if (pre) {

      const cleanLine = line.replace(/\n$/, '');
      const formattedLine = this.formatLogLine(cleanLine);
      pre.insertAdjacentHTML('beforeend', formattedLine);


      const lines = pre.querySelectorAll('.log-line');
      if (lines.length > 5000) {
        lines[0].remove();
      }

      if (this.autoScroll) {
        this.scrollToBottom();
      }

      this.updateLineCount(lines.length);
    }
  }

  updateStreamButton() {
    const btn = document.getElementById('logs-stream-btn');
    const text = document.getElementById('logs-stream-text');

    if (this.isStreaming) {
      btn.classList.add('active');
      text.textContent = 'Stop Stream';
    } else {
      btn.classList.remove('active');
      text.textContent = 'Stream Live';
    }
  }

  clearLogs() {
    this.logsContent.innerHTML = '<pre class="logs-pre"></pre>';
    this.updateLineCount(0);
    this.searchMatches = [];
    this.currentMatchIndex = -1;
  }

  async refresh() {
    this.stopStreaming();
    this.showLoading();
    await this.fetchLogs();
  }

  downloadLogs() {
    const pre = this.logsContent.querySelector('.logs-pre');
    if (!pre) return;

    const lines = pre.querySelectorAll('.log-line');
    const text = Array.from(lines).map(line => line.textContent).join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentContainer}-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  handleSearch(query) {
    const clearBtn = document.getElementById('logs-search-clear');
    const countSpan = document.getElementById('logs-search-count');
    const prevBtn = document.getElementById('logs-search-prev');
    const nextBtn = document.getElementById('logs-search-next');


    this.searchMatches = [];
    this.currentMatchIndex = -1;

    if (!query) {
      clearBtn.classList.add('hidden');
      countSpan.classList.add('hidden');
      prevBtn.classList.add('hidden');
      nextBtn.classList.add('hidden');
      this.clearSearchHighlights();
      return;
    }

    clearBtn.classList.remove('hidden');


    const lines = this.logsContent.querySelectorAll('.log-line');
    const lowerQuery = query.toLowerCase();

    lines.forEach((line, lineIndex) => {
      const textContent = line.textContent;
      const lowerText = textContent.toLowerCase();

      let startIndex = 0;
      while (true) {
        const matchIndex = lowerText.indexOf(lowerQuery, startIndex);
        if (matchIndex === -1) break;

        this.searchMatches.push({
          lineElement: line,
          lineIndex: lineIndex,
          startIndex: matchIndex,
          endIndex: matchIndex + query.length
        });

        startIndex = matchIndex + 1;
      }
    });


    if (this.searchMatches.length > 0) {
      countSpan.classList.remove('hidden');
      prevBtn.classList.remove('hidden');
      nextBtn.classList.remove('hidden');
      this.currentMatchIndex = 0;
      this.highlightAllMatches(query);
      this.updateSearchCount();
      this.scrollToCurrentMatch();
    } else {
      countSpan.classList.add('hidden');
      prevBtn.classList.add('hidden');
      nextBtn.classList.add('hidden');
      countSpan.textContent = '0/0';
      this.clearSearchHighlights();
    }
  }

  highlightAllMatches(query) {
    this.clearSearchHighlights();

    const escapedQuery = this.escapeRegex(query);
    let globalMatchIndex = 0;

    const linesWithMatches = new Set();
    this.searchMatches.forEach(match => linesWithMatches.add(match.lineElement));

    linesWithMatches.forEach(line => {
      if (!line.dataset.originalHtml) {
        line.dataset.originalHtml = line.innerHTML;
      }

      const walker = document.createTreeWalker(
        line,
        NodeFilter.SHOW_TEXT,
        null
      );

      const replacements = [];
      let node;

      while (node = walker.nextNode()) {
        const text = node.textContent;
        const regex = new RegExp(escapedQuery, 'gi');
        let match;
        const nodeMatches = [];

        while ((match = regex.exec(text)) !== null) {
          nodeMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0]
          });
        }

        if (nodeMatches.length > 0) {
          replacements.push({ node, matches: nodeMatches });
        }
      }

      replacements.forEach(({ node, matches }) => {
        const text = node.textContent;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        matches.forEach(m => {
          if (m.start > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.start)));
          }

          const mark = document.createElement('mark');
          mark.className = globalMatchIndex === this.currentMatchIndex
            ? 'search-highlight-active'
            : 'search-highlight';
          mark.dataset.matchIndex = globalMatchIndex;
          mark.textContent = m.text;
          fragment.appendChild(mark);

          globalMatchIndex++;
          lastIndex = m.end;
        });

        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }

        node.parentNode.replaceChild(fragment, node);
      });
    });
  }

  clearSearchHighlights() {
    const lines = this.logsContent.querySelectorAll('.log-line');
    lines.forEach((line) => {
      if (line.dataset.originalHtml) {
        line.innerHTML = line.dataset.originalHtml;
        delete line.dataset.originalHtml;
      }
    });
  }

  navigateToNextMatch() {
    if (this.searchMatches.length === 0) return;

    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
    this.updateSearchCount();
    this.updateActiveHighlight();
    this.scrollToCurrentMatch();
  }

  navigateToPrevMatch() {
    if (this.searchMatches.length === 0) return;

    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
    this.updateSearchCount();
    this.updateActiveHighlight();
    this.scrollToCurrentMatch();
  }

  updateActiveHighlight() {

    this.logsContent.querySelectorAll('mark.search-highlight-active').forEach(el => {
      el.classList.remove('search-highlight-active');
      el.classList.add('search-highlight');
    });


    const marks = this.logsContent.querySelectorAll('mark[data-match-index]');
    marks.forEach(mark => {
      const idx = parseInt(mark.dataset.matchIndex);
      if (idx === this.currentMatchIndex) {
        mark.classList.remove('search-highlight');
        mark.classList.add('search-highlight-active');
      }
    });
  }

  updateSearchCount() {
    const countSpan = document.getElementById('logs-search-count');
    if (this.searchMatches.length > 0) {
      countSpan.textContent = `${this.currentMatchIndex + 1}/${this.searchMatches.length}`;
    } else {
      countSpan.textContent = '0/0';
    }
  }

  scrollToCurrentMatch() {
    if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.searchMatches.length) {
      const match = this.searchMatches[this.currentMatchIndex];
      const line = match.lineElement;

      line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  scrollToBottom() {
    this.logsContent.scrollTop = this.logsContent.scrollHeight;
  }

  updateLineCount(count) {
    document.getElementById('logs-line-count').textContent = `${count} lines`;
  }

  updateStatus(text) {
    document.getElementById('logs-status').textContent = text;
  }

  displayError(message) {
    this.logsContent.innerHTML = `
      <div class="logs-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }
}


export const logsViewer = new LogsViewer();