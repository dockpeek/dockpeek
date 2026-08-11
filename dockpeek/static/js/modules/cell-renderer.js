import { state } from './state.js';
import { getRegistryUrl } from './registry-urls.js';
import { escapeHtml, safeUrl } from './sanitize.js';

export function renderName(container, cell) {
  const nameSpan = cell.querySelector('[data-content="container-name"]');

  const url = container.custom_url ? safeUrl(normalizeUrl(container.custom_url)) : '';

  if (url) {
    const tooltipUrl = url.replace(/^https?:\/\//, '');
    nameSpan.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800" data-tooltip="${escapeHtml(tooltipUrl)}">${escapeHtml(container.name)}</a>`;
  } else {
    nameSpan.textContent = container.name;
  }
}

const lifecycleIcons = {
  start: {
    color: '#28a745',
    markup: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"></path></svg>'
  },
  stop: {
    color: '#dc3545',
    markup: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="1"></rect></svg>'
  },
  restart: {
    color: '#2b7fff',
    markup: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3V8M21 8H16M21 8L18 5.29168C16.4077 3.86656 14.3051 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.2832 21 19.8675 18.008 20.777 14"></path></svg>'
  }
};

export function renderLifecycleActions(container, clone) {
  const actionsContainer = clone.querySelector('[data-content="lifecycle-actions"]');
  if (!actionsContainer || window.containerActionsEnabled !== true) return;

  if (state.swarmServers.includes(container.server)) return;

  const action = typeof container.lifecycle_action === 'string'
    ? container.lifecycle_action
    : container.lifecycle_action?.action;
  if (action) {
    const actionLabels = {
      start: 'Starting...',
      stop: 'Stopping...',
      restart: 'Restarting...'
    };
    const transitionalStatuses = ['starting', 'restarting', 'removing'];

    if (!transitionalStatuses.includes(container.status) &&
        !['running', 'healthy', 'unhealthy', 'exited', 'created'].includes(container.status)) {
      return;
    }

    const pendingButton = document.createElement('button');
    pendingButton.type = 'button';
    pendingButton.className = 'logs-button p-1 rounded opacity-50';
    pendingButton.disabled = true;
    pendingButton.setAttribute('aria-label', actionLabels[action] || 'Updating container...');
    pendingButton.setAttribute('data-tooltip', actionLabels[action] || 'Updating container...');
    pendingButton.setAttribute('aria-live', 'polite');
    pendingButton.innerHTML = `
      <svg class="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    `;
    actionsContainer.appendChild(pendingButton);
    return;
  }

  const actions = {
    running: ['stop', 'restart'],
    healthy: ['stop', 'restart'],
    unhealthy: ['stop', 'restart'],
    exited: ['start'],
    created: ['start']
  }[container.status];

  if (!actions || !container.container_id) return;

  actions.forEach(actionName => {
    const button = document.createElement('button');
    const icon = lifecycleIcons[actionName];
    button.type = 'button';
    button.className = 'logs-button p-1 rounded transition-colors';
    button.style.color = icon.color;
    button.dataset.lifecycleAction = actionName;
    button.dataset.server = container.server;
    button.dataset.containerId = container.container_id;
    button.setAttribute('aria-label', `${actionName} container`);
    button.setAttribute('data-tooltip', `${actionName[0].toUpperCase() + actionName.slice(1)} container`);
    button.innerHTML = icon.markup;
    actionsContainer.appendChild(button);
  });
}

export function renderServer(container, clone) {
  const serverCell = clone.querySelector('[data-content="server-name"]').closest('td');
  const serverSpan = serverCell.querySelector('[data-content="server-name"]');
  serverSpan.textContent = container.server;

  const serverData = state.allContainersData.find(s => s.name === container.server);
  if (serverData?.url) {
    serverSpan.setAttribute('data-tooltip', serverData.url);
  }
}

export function renderStack(container, cell) {
  if (container.stack) {
    cell.innerHTML = `<a href="#" class="stack-link text-blue-600 hover:text-blue-800 cursor-pointer" data-stack="${escapeHtml(container.stack)}" data-server="${escapeHtml(container.server)}">${escapeHtml(container.stack)}</a>`;
  } else {
    cell.textContent = '';
  }
}

export function renderImage(container, cell, clone) {
  cell.textContent = container.image;

  const sourceLink = clone.querySelector('[data-content="source-link"]');
  if (sourceLink) {
    // org.opencontainers.image.source is baked into the image by its author, so
    // it can carry a javascript: URL even though it never passes through innerHTML.
    const sourceUrl = safeUrl(container.source_url);
    if (sourceUrl) {
      sourceLink.href = sourceUrl;
      sourceLink.classList.remove('hidden');
      sourceLink.setAttribute('data-tooltip', sourceUrl);
    } else {
      sourceLink.classList.add('hidden');
    }
  }

  const registryLink = clone.querySelector('[data-content="registry-link"]');
  if (registryLink) {
    const registryUrl = safeUrl(getRegistryUrl(container.image));
    if (registryUrl) {
      registryLink.href = registryUrl;
      registryLink.classList.remove('hidden');
      registryLink.setAttribute('data-tooltip', 'Open in registry');
    } else {
      registryLink.classList.add('hidden');
    }
  }
}

export function renderUpdateIndicator(container, clone) {
  const indicator = clone.querySelector('[data-content="update-indicator"]');

  if (container.update_available) {
    indicator.classList.remove('hidden');
    indicator.classList.add('update-available-indicator');
    indicator.setAttribute('data-server', container.server);
    indicator.setAttribute('data-container', container.name);
    indicator.setAttribute('data-tooltip', `Click to update ${container.name}`);
    indicator.style.cursor = 'pointer';
  } else {
    indicator.classList.add('hidden');
    indicator.classList.remove('update-available-indicator');
    indicator.removeAttribute('data-server');
    indicator.removeAttribute('data-container');
    indicator.removeAttribute('data-tooltip');
    indicator.style.cursor = '';
  }
}

export function renderTags(container, cell) {
  if (container.tags?.length) {
    const sortedTags = [...container.tags].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    cell.innerHTML = `<div class="tags-container">${sortedTags.map(tag =>
      `<span class="tag-badge" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`
    ).join('')}</div>`;
  } else {
    cell.innerHTML = '';
  }
}

export function renderPorts(container, cell) {
  if (!container.ports.length) {
    cell.innerHTML = `<span class="status-none" style="padding-left: 5px;">none</span>`;
    return;
  }

  const arrowSvg = `<svg width="12" height="12" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" class="align-middle"><path d="M19 12L31 24L19 36" stroke="currentColor" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const globalGroupingEnabled = window.portRangeGroupingEnabled !== false;
  const containerGroupingEnabled = container.port_range_grouping !== false;
  const shouldGroupPorts = globalGroupingEnabled && containerGroupingEnabled;

  if (shouldGroupPorts) {
    const portGroups = groupPortsIntoRanges(container.ports, window.portRangeThreshold || 5);

    cell.innerHTML = portGroups.map(group => {
      if (group.isRange) {
        const rangeBadge = renderPortBadge(group.startPort, `${group.startPort.host_port}-${group.endPort.host_port}`);

        if (group.startPort.is_custom || !group.startPort.container_port) {
          return `<div class="custom-port flex items-center mb-1">${rangeBadge}</div>`;
        }

        const startContainerPort = group.startPort.container_port.split('/')[0];
        const endContainerPort = group.endPort.container_port.split('/')[0];
        const protocol = group.startPort.container_port.split('/')[1] || 'tcp';
        return `<div class="flex items-center mb-1">${rangeBadge}${arrowSvg}<small class="text-secondary">${escapeHtml(`${startContainerPort}-${endContainerPort}/${protocol}`)}</small></div>`;
      } else {
        const badge = renderPortBadge(group.port, group.port.host_port);

        if (group.port.is_custom || !group.port.container_port) {
          return `<div class="custom-port flex items-center mb-1">${badge}</div>`;
        }

        return `<div class="flex items-center mb-1">${badge}${arrowSvg}<small class="text-secondary">${escapeHtml(group.port.container_port)}</small></div>`;
      }
    }).join('');
  } else {
    cell.innerHTML = container.ports.map(p => {
      const badge = renderPortBadge(p, p.host_port);

      if (p.is_custom || !p.container_port) {
        return `<div class="custom-port flex items-center mb-1">${badge}</div>`;
      }

      return `<div class="flex items-center mb-1">${badge}${arrowSvg}<small class="text-secondary">${escapeHtml(p.container_port)}</small></div>`;
    }).join('');
  }
}

function renderPortBadge(port, label) {
  const link = safeUrl(port.link);

  if (!link) {
    return `<span class="badge text-bg-dark rounded">${escapeHtml(label)}</span>`;
  }

  return `<a href="${escapeHtml(link)}" data-tooltip="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="badge text-bg-dark rounded">${escapeHtml(label)}</a>`;
}

function groupPortsIntoRanges(ports, threshold = 5) {
  if (!ports.length) return [];

  const sortedPorts = [...ports].sort((a, b) => {
    const portA = parseInt(a.host_port, 10);
    const portB = parseInt(b.host_port, 10);
    if (portA !== portB) return portA - portB;
    
    const protocolA = a.container_port?.split('/')[1] || 'tcp';
    const protocolB = b.container_port?.split('/')[1] || 'tcp';
    if (protocolA === 'tcp' && protocolB === 'udp') return -1;
    if (protocolA === 'udp' && protocolB === 'tcp') return 1;
    return protocolA.localeCompare(protocolB);
  });

  const portsByProtocol = {};
  sortedPorts.forEach(port => {
    const protocol = port.container_port?.split('/')[1] || 'tcp';
    if (!portsByProtocol[protocol]) {
      portsByProtocol[protocol] = [];
    }
    portsByProtocol[protocol].push(port);
  });

  const groupsByProtocol = {};

  Object.keys(portsByProtocol).forEach(protocol => {
    const protocolPorts = portsByProtocol[protocol];
    const groups = [];

    let currentRange = null;

    for (let i = 0; i < protocolPorts.length; i++) {
      const port = protocolPorts[i];
      const portNum = parseInt(port.host_port, 10);
      
      if (currentRange && 
          portNum === currentRange.endPortNum + 1 &&
          port.is_custom === currentRange.startPort.is_custom) {
        currentRange.endPort = port;
        currentRange.endPortNum = portNum;
      } else {
        if (currentRange && (currentRange.endPortNum - currentRange.startPortNum + 1) >= threshold) {
          groups.push({
            isRange: true,
            startPort: currentRange.startPort,
            endPort: currentRange.endPort,
            startPortNum: currentRange.startPortNum,
            endPortNum: currentRange.endPortNum
          });
        } else if (currentRange) {
          for (let j = currentRange.startPortNum; j <= currentRange.endPortNum; j++) {
            const portToAdd = protocolPorts.find(p => parseInt(p.host_port, 10) === j);
            if (portToAdd) {
              groups.push({
                isRange: false,
                port: portToAdd
              });
            }
          }
        }
        
        currentRange = {
          startPort: port,
          endPort: port,
          startPortNum: portNum,
          endPortNum: portNum
        };
      }
    }

    if (currentRange) {
      if ((currentRange.endPortNum - currentRange.startPortNum + 1) >= threshold) {
        groups.push({
          isRange: true,
          startPort: currentRange.startPort,
          endPort: currentRange.endPort,
          startPortNum: currentRange.startPortNum,
          endPortNum: currentRange.endPortNum
        });
      } else {
        for (let j = currentRange.startPortNum; j <= currentRange.endPortNum; j++) {
          const portToAdd = protocolPorts.find(p => parseInt(p.host_port, 10) === j);
          if (portToAdd) {
            groups.push({
              isRange: false,
              port: portToAdd
            });
          }
        }
      }
    }

    groupsByProtocol[protocol] = groups;
  });

  const allGroups = [];
  sortedPorts.forEach(port => {
    const protocol = port.container_port?.split('/')[1] || 'tcp';
    const protocolGroups = groupsByProtocol[protocol];
    
    const group = protocolGroups.find(g => {
      if (g.isRange) {
        const portNum = parseInt(port.host_port, 10);
        return portNum >= g.startPortNum && portNum <= g.endPortNum;
      } else {
        return g.port === port;
      }
    });
    
    if (group && !allGroups.includes(group)) {
      allGroups.push(group);
    }
  });

  return allGroups;
}

export function renderTraefik(container, cell, hasAnyRoutes) {
  if (!hasAnyRoutes) {
    cell.classList.add('hidden');
    return;
  }

  cell.classList.remove('hidden');

  if (container.traefik_routes?.length) {
    cell.innerHTML = container.traefik_routes.map(route => {
      const url = safeUrl(route.url);
      const displayUrl = escapeHtml((url || route.url || '').replace(/^https?:\/\//, ''));

      if (!url) {
        return `<div class="traefik-route mb-1"><div class="inline-block"><span class="traefik-text">${displayUrl}</span></div></div>`;
      }

      return `<div class="traefik-route mb-1"><div class="inline-block"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 text-sm"><span class="traefik-text">${displayUrl}</span></a></div></div>`;
    }).join('');
  } else {
    cell.innerHTML = `<span class="status-none text-sm">none</span>`;
  }
}

function normalizeUrl(url) {
  return url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//) ? url : `https://${url}`;
}

export function renderLogs(container, cell) {
  const logsButton = document.createElement('button');
  logsButton.className = 'logs-button text-gray-500 hover:text-blue-600 p-1 rounded transition-colors';
  logsButton.setAttribute('data-server', container.server);
  logsButton.setAttribute('data-container', container.name);
  
  const tooltipText = container.name.length > 50 
    ? container.name.substring(0, 47) + '...' 
    : container.name;
  logsButton.setAttribute('data-tooltip', tooltipText);
  
  logsButton.setAttribute('aria-label', 'View container logs');
  logsButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  `;
  cell.appendChild(logsButton);
}
