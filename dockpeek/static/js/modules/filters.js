import { state } from './state.js';
import { updateSwarmIndicator, isSwarmMode } from './swarm-indicator.js';
import { renderTable } from '../app.js';
import { handlePruneImages, initPruneInfo } from './prune.js';
import { updateContainerStats } from './container-stats.js';

export function getCachedServerStatus() {
  const cache = state.serverStatusCache;
  const now = Date.now();

  if (cache.data && (now - cache.timestamp) < cache.ttl) {
    return cache.data;
  }
  return null;
}

export function setCachedServerStatus(servers) {
  state.serverStatusCache.data = servers;
  state.serverStatusCache.timestamp = Date.now();
}

export function setupServerUI() {
  const serverFilterContainer = document.getElementById("server-filter-container");
  const mainTable = document.getElementById("main-table");
  serverFilterContainer.innerHTML = '';
  let servers = getCachedServerStatus();
  if (!servers) {
    servers = [...state.allServersData];
    setCachedServerStatus(servers);
  } else {
    servers = [...servers];
  }
  if (servers.length > 1) {
    mainTable.classList.remove('table-single-server');
    serverFilterContainer.classList.remove('hidden');

    servers.sort((a, b) => {
      if (a.status !== 'inactive' && b.status === 'inactive') return -1;
      if (a.status === 'inactive' && b.status !== 'inactive') return 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });

    const allButton = document.createElement('button');
    allButton.textContent = 'All';
    allButton.dataset.server = 'all';
    allButton.className = 'filter-button';
    serverFilterContainer.appendChild(allButton);

    servers.forEach(server => {
      const button = document.createElement('button');
      button.textContent = server.name;
      button.dataset.server = server.name;
      button.className = 'filter-button';

      if (server.status === 'inactive') {
        button.classList.add('inactive');
        button.disabled = true;
        button.setAttribute('data-tooltip', `${server.url || 'URL unknown'} is offline`);
      } else {
        button.setAttribute('data-tooltip', server.url || 'URL unknown');
      }
      serverFilterContainer.appendChild(button);
    });

    serverFilterContainer.querySelectorAll('.filter-button:not(:disabled)').forEach(button => {
      button.addEventListener('click', () => {
        state.currentServerFilter = button.dataset.server;
        updateDisplay();
        initPruneInfo();

      });
    });

  } else {
    mainTable.classList.add('table-single-server');
    serverFilterContainer.classList.add('hidden');
  }

  updateActiveButton();
  initPruneInfo();
}

export function updateActiveButton() {
  const serverFilterContainer = document.getElementById("server-filter-container");
  serverFilterContainer.querySelectorAll('.filter-button').forEach(button => {
    button.classList.toggle('active', button.dataset.server === state.currentServerFilter);
  });


  const isCurrentServerSwarm = state.currentServerFilter !== 'all' &&
    state.swarmServers.includes(state.currentServerFilter);
  const checkUpdatesButton = document.getElementById('check-updates-button');
  if (checkUpdatesButton) {
    if (isCurrentServerSwarm) {
      checkUpdatesButton.disabled = true;
      checkUpdatesButton.classList.add('disabled');
      checkUpdatesButton.style.opacity = '0.5';
      checkUpdatesButton.setAttribute('data-tooltip', 'Not supported for Swarm services');
    } else if (state.isDataLoaded) {
      checkUpdatesButton.disabled = false;
      checkUpdatesButton.classList.remove('disabled');
      checkUpdatesButton.style.opacity = '1';
      checkUpdatesButton.removeAttribute('data-tooltip');
    }
  }
}

export function parseAdvancedSearch(searchTerm) {
  const filters = {
    tags: [],
    ports: [],
    stacks: [],
    ids: [],
    general: []
  };

  const terms = searchTerm.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

  terms.forEach(term => {
    term = term.trim();
    if (!term) return;

    if (term.startsWith('#')) {
      filters.tags.push(term.substring(1).toLowerCase());
    } else if (term.startsWith(':') && !term.startsWith(':free')) {
      filters.ports.push(term.substring(1));
    } else if (term.startsWith('stack:')) {
      let stackValue = term.substring(6);
      if (stackValue.startsWith('"') && stackValue.endsWith('"')) {
        stackValue = stackValue.slice(1, -1);
      }
      filters.stacks.push(stackValue.toLowerCase());
    } else if (term.startsWith('id:')) {
      let idValue = term.substring(3);
      if (idValue.startsWith('"') && idValue.endsWith('"')) {
        idValue = idValue.slice(1, -1);
      }
      filters.ids.push(idValue.toLowerCase());
    } else {
      if (term.startsWith('"') && term.endsWith('"')) {
        term = term.slice(1, -1);
      }
      filters.general.push(term.toLowerCase());
    }
  });

  return filters;
}


export function updateDisplay() {
  const searchInput = document.getElementById("search-input");
  const filterRunningCheckbox = document.getElementById("filter-running-checkbox");
  const filterUpdatesCheckbox = document.getElementById("filter-updates-checkbox");
  const mainTable = document.getElementById("main-table");

  let workingData = [...state.allContainersData];
  let statsData = [...state.allContainersData];

  if (state.currentServerFilter !== "all") {
    workingData = workingData.filter(c => c.server === state.currentServerFilter);
    statsData = statsData.filter(c => c.server === state.currentServerFilter);
  }

  // Swarm mode: repurpose toggle to "Show Problems"
  const swarmMode = isSwarmMode();
  const filterLabel = document.getElementById('filter-running-label');
  const filterContainer = filterRunningCheckbox.parentElement;

  if (swarmMode) {
    filterLabel.textContent = 'Show Problems';
    filterLabel.setAttribute('data-tooltip', 'Show only services where not all replicas are running');
    filterContainer.classList.add('swarm-mode');
  } else {
    filterLabel.textContent = 'Running only';
    filterLabel.setAttribute('data-tooltip', 'Show only running and healthy containers');
    filterContainer.classList.remove('swarm-mode');
  }

  filterContainer.classList.remove('hidden');

  if (filterRunningCheckbox.checked) {
    if (swarmMode) {
      workingData = workingData.filter(c => {
        if (typeof c.status === 'string') {
          const m = c.status.match(/^running \((\d+)\/(\d+)\)$/);
          if (m) {
            const running = parseInt(m[1], 10);
            const desired = parseInt(m[2], 10);
            return running < desired;
          }
          if (c.status === 'no-tasks') return true;
        }
        return false;
      });
    } else {
      workingData = workingData.filter(c => c.status === 'running' || c.status === 'healthy');
    }
  }

  if (filterUpdatesCheckbox.checked) {
    workingData = workingData.filter(c => c.update_available);
  }

  const searchTerm = searchInput.value.trim();

  const freeMatch = searchTerm.match(/:free\s*(\d+)?/);
  if (freeMatch) {
    const occupiedPorts = new Set();

    const containersToCheck = state.currentServerFilter === "all"
      ? state.allContainersData
      : state.allContainersData.filter(c => c.server === state.currentServerFilter);

    containersToCheck.forEach(container => {
      container.ports.forEach(p => {
        const port = parseInt(p.host_port, 10);
        if (!isNaN(port)) occupiedPorts.add(port);
      });
    });

    const sortedPorts = Array.from(occupiedPorts).sort((a, b) => a - b);
    const startPortValue = freeMatch[1] ? parseInt(freeMatch[1], 10) : (sortedPorts.length > 0 ? sortedPorts[0] : 1000);

    let freePort = startPortValue;
    for (const port of sortedPorts) {
      if (port >= startPortValue) {
        if (port === freePort) {
          freePort++;
        } else {
          break;
        }
      }
    }

    showFreePortResult(freePort);
  } else {
    hideFreePortResult();
  }

  // Remove :free from search term before normal filtering
  const cleanSearchTerm = searchTerm.replace(/:free\s*\d*/g, '').trim();

  if (cleanSearchTerm) {
    const filters = parseAdvancedSearch(cleanSearchTerm);

    workingData = workingData.filter(container => {
      if (filters.tags.length > 0) {
        const hasAllTags = filters.tags.every(searchTag =>
          container.tags && container.tags.some(containerTag =>
            containerTag.toLowerCase().includes(searchTag)
          )
        );
        if (!hasAllTags) return false;
      }

      if (filters.ids.length > 0) {
        const hasAllIds = filters.ids.every(searchId =>
          container.container_id && container.container_id.toLowerCase().includes(searchId)
        );
        if (!hasAllIds) return false;
      }

      if (filters.ports.length > 0) {
        const hasAllPorts = filters.ports.every(searchPort =>
          container.ports.some(p =>
            p.host_port.includes(searchPort)
          )
        );
        if (!hasAllPorts) return false;
      }


      if (filters.stacks.length > 0) {
        const hasAllStacks = filters.stacks.every(searchStack =>
          container.stack && container.stack.toLowerCase().includes(searchStack)
        );
        if (!hasAllStacks) return false;
      }

      if (filters.general.length > 0) {
        const hasAllGeneral = filters.general.every(searchTerm => {
          return (
            container.name.toLowerCase().includes(searchTerm) ||
            container.image.toLowerCase().includes(searchTerm) ||
            (container.stack && container.stack.toLowerCase().includes(searchTerm)) ||
            (container.container_id && container.container_id.toLowerCase().includes(searchTerm)) ||
            container.ports.some(p =>
              p.host_port.includes(searchTerm) ||
              p.container_port.includes(searchTerm)
            )
          );
        });
        if (!hasAllGeneral) return false;
      }

      return true;
    });
  }

  workingData.sort((a, b) => {
    let valA = a[state.currentSortColumn];
    let valB = b[state.currentSortColumn];

    if (state.currentSortColumn === "status") {
      const statusOrder = {
        'starting': 1,
        'restarting': 2,
        'unhealthy': 3,
        'removing': 4,
        'created': 5,
        'paused': 6,
        'exited': 7,
        'dead': 8,
        'running': 9,
        'healthy': 10
      };

      valA = statusOrder[valA] || 99;
      valB = statusOrder[valB] || 99;
    } else if (state.currentSortColumn === "ports") {
      const getFirstPort = (container) => {
        if (container.ports.length === 0) {
          return state.currentSortDirection === "asc" ? Number.MAX_SAFE_INTEGER : -1;
        }
        return parseInt(container.ports[0].host_port, 10);
      };
      valA = getFirstPort(a);
      valB = getFirstPort(b);
    } else if (state.currentSortColumn === "traefik") {
      const getTraefikRoutes = (container) => {
        if (!container.traefik_routes || container.traefik_routes.length === 0) {
          return state.currentSortDirection === "asc" ? "zzz_none" : "";
        }
        return container.traefik_routes[0].url.toLowerCase();
      };
      valA = getTraefikRoutes(a);
      valB = getTraefikRoutes(b);
    } else if (state.currentSortColumn === "ipaddress") {
      const getLastOctet = (ip) => ip ? parseInt(ip.split('.').pop(), 10) : (state.currentSortDirection === "asc" ? Infinity : -1);
      valA = getLastOctet(a.ip_address);
      valB = getLastOctet(b.ip_address);
    } else if (typeof valA === "string" && typeof valB === "string") {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return state.currentSortDirection === "asc" ? -1 : 1;
    if (valA > valB) return state.currentSortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const isTraefikGloballyEnabled = window.traefikEnabled !== false;
  const hasTraefikRoutes = isTraefikGloballyEnabled && workingData.some(c => c.traefik_routes && c.traefik_routes.length > 0);

  const traefikHeaders = document.querySelectorAll('.traefik-column');
  traefikHeaders.forEach(header => {
    if (hasTraefikRoutes) {
      header.classList.remove('hidden');
    } else {
      header.classList.add('hidden');
    }
  });

  const hasTags = workingData.some(c => c.tags && c.tags.length > 0);
  const tagsHeaders = document.querySelectorAll('.tags-column');
  tagsHeaders.forEach(header => {
    if (hasTags) {
      header.classList.remove('hidden');
    } else {
      header.classList.add('hidden');
    }
  });

  document.querySelectorAll('.table-cell-tags').forEach(cell => {
    if (hasTags) {
      cell.classList.remove('hidden');
    } else {
      cell.classList.add('hidden');
    }
  });

  const isMultiServerConfig = state.allServersData.length > 1;
  const isServerFilterActive = state.currentServerFilter !== "all";

  const shouldHideServerColumn = !isMultiServerConfig || isServerFilterActive;

  const serverHeaders = document.querySelectorAll('.server-column');
  serverHeaders.forEach(header => {
    if (shouldHideServerColumn) {
      header.classList.add('hidden');
    } else {
      header.classList.remove('hidden');
    }
  });

  if (shouldHideServerColumn) {
    mainTable.classList.add('table-single-server');
  } else {
    mainTable.classList.remove('table-single-server');
  }

  state.filteredAndSortedContainers.splice(0, state.filteredAndSortedContainers.length, ...workingData);
  renderTable();
  updateActiveButton();
  updateSwarmIndicator(state.swarmServers, state.currentServerFilter);
  updateContainerStats(statsData);
  updateActiveTagsDisplay();
  updateUpdatesLabel();
}

export function filterByStackAndServer(stack, server) {
  const searchInput = document.getElementById("search-input");
  state.currentServerFilter = server;
  updateActiveButton();
  let stackTerm = stack.includes(" ") ? `"${stack}"` : stack;
  searchInput.value = `stack:${stackTerm}`;
  toggleClearButton();
  updateDisplay();
  searchInput.focus();
}

export function filterByContainerName(containerName, server) {
  const searchInput = document.getElementById("search-input");
  const filterRunningCheckbox = document.getElementById("filter-running-checkbox");
  const filterUpdatesCheckbox = document.getElementById("filter-updates-checkbox");

  const container = state.allContainersData.find(
    c => c.name === containerName && c.server === server
  );

  state.currentServerFilter = server;
  updateActiveButton();
  //sliders
  filterRunningCheckbox.checked = false;
  filterUpdatesCheckbox.checked = false;
  //id
  if (container?.container_id) {
    searchInput.value = `id:${container.container_id}`;
  } else {
    searchInput.value = containerName;
  }
  toggleClearButton();
  updateDisplay();
  searchInput.focus();
}


export function toggleClearButton() {
  const searchInput = document.getElementById("search-input");
  const clearSearchButton = document.getElementById("clear-search-button");
  if (searchInput.value.trim() !== '') {
    clearSearchButton.classList.remove('hidden');
  } else {
    clearSearchButton.classList.add('hidden');
  }
}

export function clearSearch() {
  const searchInput = document.getElementById("search-input");
  const clearSearchButton = document.getElementById("clear-search-button");
  searchInput.value = '';
  clearSearchButton.classList.add('hidden');
  searchInput.focus();
  updateDisplay();
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard API failed, trying fallback:', err);
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);

    if (navigator.userAgent.match(/ipad|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.select();
    }

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('All copy methods failed:', err);
    return false;
  }
}

function handleCopyPortClick(event) {
  const button = event.currentTarget;
  const port = button.getAttribute('data-port');

  if (!port) {
    console.error('No port data found');
    return;
  }

  copyToClipboard(port).then(success => {
    if (!success) {
      alert(`Port: ${port}\n\nCould not copy to clipboard. Please copy manually.`);
      return;
    }

    const originalHTML = button.innerHTML;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    button.classList.add('copied');

    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.classList.remove('copied');
    }, 2000);
  });
}

export function showFreePortResult(port) {
  let resultDiv = document.getElementById('free-port-result');

  if (!resultDiv) {
    resultDiv = document.createElement('div');
    resultDiv.id = 'free-port-result';
    resultDiv.className = 'free-port-result';
    const searchInput = document.getElementById('search-input');
    searchInput.parentElement.appendChild(resultDiv);
  }

  resultDiv.innerHTML = `
    <div class="free-port-content">
      <span class="free-port-label">Next free port:</span>
      <code class="free-port-number">${port}</code>
      <button class="copy-port-button" data-tooltip="Copy to clipboard" data-port="${port}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    </div>
  `;

  resultDiv.classList.remove('hidden');
  const copyButton = resultDiv.querySelector('.copy-port-button');
  if (copyButton) {
    copyButton.removeEventListener('click', handleCopyPortClick);
    copyButton.addEventListener('click', handleCopyPortClick);
  }
}

export function hideFreePortResult() {
  const resultDiv = document.getElementById('free-port-result');
  if (resultDiv) {
    resultDiv.classList.add('hidden');
  }
}

export function updateActiveTagsDisplay() {
  const searchInput = document.getElementById("search-input");
  const container = document.getElementById("active-tags-container");

  if (!container) return;

  const filters = parseAdvancedSearch(searchInput.value.trim());

  if (filters.tags.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = filters.tags.map(tag => `
    <div class="active-tag-badge" data-tag="${tag}">
      <span>#${tag}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </div>
  `).join('');

  // Event listener dla usuwania tagów
  container.querySelectorAll('.active-tag-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      const tagToRemove = badge.dataset.tag;
      const currentFilters = parseAdvancedSearch(searchInput.value.trim());

      const remainingTags = currentFilters.tags
        .filter(t => t.toLowerCase() !== tagToRemove.toLowerCase())
        .map(t => `#${t}`)
        .join(' ');

      searchInput.value = remainingTags;
      toggleClearButton();
      updateDisplay();
      searchInput.focus();
    });
  });
}

export function updateUpdatesLabel() {
  const updatesLabel = document.querySelector('label[for="filter-updates-checkbox"]');
  if (!updatesLabel) return;

  let workingData = [...state.allContainersData];
  if (state.currentServerFilter !== "all") {
    workingData = workingData.filter(c => c.server === state.currentServerFilter);
  }

  const updatesCount = workingData.filter(c => c.update_available).length;
  
  if (updatesCount > 0) {
    updatesLabel.innerHTML = `Updates <span style="color: #f59e0b; font-weight: 600;">( ${updatesCount} )</span>`;
  } else {
    updatesLabel.textContent = '';
  }
}