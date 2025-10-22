import { state } from './state.js';
import { getRegistryUrl } from './registry-urls.js';

export function renderName(container, cell) {
  const nameSpan = cell.querySelector('[data-content="container-name"]');

  if (container.custom_url) {
    const url = normalizeUrl(container.custom_url);
    const tooltipUrl = url.replace(/^https?:\/\//, '');
    nameSpan.innerHTML = `<a href="${url}" target="_blank" class="text-blue-600 hover:text-blue-800" data-tooltip="${tooltipUrl}">${container.name}</a>`;
  } else {
    nameSpan.textContent = container.name;
  }
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
    cell.innerHTML = `<a href="#" class="stack-link text-blue-600 hover:text-blue-800 cursor-pointer" data-stack="${container.stack}" data-server="${container.server}">${container.stack}</a>`;
  } else {
    cell.textContent = '';
  }
}

export function renderImage(container, cell, clone) {
  cell.textContent = container.image;

  const sourceLink = clone.querySelector('[data-content="source-link"]');
  if (sourceLink) {
    if (container.source_url) {
      sourceLink.href = container.source_url;
      sourceLink.classList.remove('hidden');
      sourceLink.setAttribute('data-tooltip', container.source_url);
    } else {
      sourceLink.classList.add('hidden');
    }
  }

  const registryLink = clone.querySelector('[data-content="registry-link"]');
  if (registryLink) {
    const registryUrl = getRegistryUrl(container.image);
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
      `<span class="tag-badge" data-tag="${tag}">${tag}</span>`
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

  // Check if port range grouping is enabled (global setting and per-container setting)
  const globalGroupingEnabled = window.portRangeGroupingEnabled !== false;
  const containerGroupingEnabled = container.port_range_grouping !== false;
  const shouldGroupPorts = globalGroupingEnabled && containerGroupingEnabled;

  if (shouldGroupPorts) {
    // Group ports into ranges and individual ports
    const portGroups = groupPortsIntoRanges(container.ports, window.portRangeThreshold || 5);

    cell.innerHTML = portGroups.map(group => {
      if (group.isRange) {
        // Render as a range
        const rangeBadge = `<a href="${group.startPort.link}" data-tooltip="${group.startPort.link}" target="_blank" class="badge text-bg-dark rounded">${group.startPort.host_port}-${group.endPort.host_port}</a>`;
        
        if (group.startPort.is_custom || !group.startPort.container_port) {
          return `<div class="custom-port flex items-center mb-1">${rangeBadge}</div>`;
        }

        // Extract port numbers and protocol from container_port
        const startContainerPort = group.startPort.container_port.split('/')[0];
        const endContainerPort = group.endPort.container_port.split('/')[0];
        const protocol = group.startPort.container_port.split('/')[1] || 'tcp';
        return `<div class="flex items-center mb-1">${rangeBadge}${arrowSvg}<small class="text-secondary">${startContainerPort}-${endContainerPort}/${protocol}</small></div>`;
      } else {
        // Render as individual port
        const badge = `<a href="${group.port.link}" data-tooltip="${group.port.link}" target="_blank" class="badge text-bg-dark rounded">${group.port.host_port}</a>`;

        if (group.port.is_custom || !group.port.container_port) {
          return `<div class="custom-port flex items-center mb-1">${badge}</div>`;
        }

        return `<div class="flex items-center mb-1">${badge}${arrowSvg}<small class="text-secondary">${group.port.container_port}</small></div>`;
      }
    }).join('');
  } else {
    // Render ports individually (original behavior)
    cell.innerHTML = container.ports.map(p => {
      const badge = `<a href="${p.link}" data-tooltip="${p.link}" target="_blank" class="badge text-bg-dark rounded">${p.host_port}</a>`;

      if (p.is_custom || !p.container_port) {
        return `<div class="custom-port flex items-center mb-1">${badge}</div>`;
      }

      return `<div class="flex items-center mb-1">${badge}${arrowSvg}<small class="text-secondary">${p.container_port}</small></div>`;
    }).join('');
  }
}

function groupPortsIntoRanges(ports, threshold = 5) {
  if (!ports.length) return [];

  // Sort ports by host_port numerically
  const sortedPorts = [...ports].sort((a, b) => {
    const portA = parseInt(a.host_port, 10);
    const portB = parseInt(b.host_port, 10);
    return portA - portB;
  });

  const groups = [];
  let currentRange = null;

  for (let i = 0; i < sortedPorts.length; i++) {
    const port = sortedPorts[i];
    const portNum = parseInt(port.host_port, 10);
    
    // Check if this port can be part of the current range
    if (currentRange && 
        portNum === currentRange.endPortNum + 1 &&
        port.is_custom === currentRange.startPort.is_custom) {
      // Extend the current range
      currentRange.endPort = port;
      currentRange.endPortNum = portNum;
    } else {
      // Close the current range if it exists and meets the threshold
      if (currentRange && (currentRange.endPortNum - currentRange.startPortNum + 1) >= threshold) {
        groups.push({
          isRange: true,
          startPort: currentRange.startPort,
          endPort: currentRange.endPort,
          startPortNum: currentRange.startPortNum,
          endPortNum: currentRange.endPortNum
        });
      } else if (currentRange) {
        // Range doesn't meet threshold, add ports as individuals
        for (let j = currentRange.startPortNum; j <= currentRange.endPortNum; j++) {
          const portToAdd = sortedPorts.find(p => parseInt(p.host_port, 10) === j);
          if (portToAdd) {
            groups.push({
              isRange: false,
              port: portToAdd
            });
          }
        }
      }
      
      // Start a new range
      currentRange = {
        startPort: port,
        endPort: port,
        startPortNum: portNum,
        endPortNum: portNum
      };
    }
  }

  // Close the last range
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
      // Range doesn't meet threshold, add ports as individuals
      for (let j = currentRange.startPortNum; j <= currentRange.endPortNum; j++) {
        const portToAdd = sortedPorts.find(p => parseInt(p.host_port, 10) === j);
        if (portToAdd) {
          groups.push({
            isRange: false,
            port: portToAdd
          });
        }
      }
    }
  }

  return groups;
}

export function renderTraefik(container, cell, hasAnyRoutes) {
  if (!hasAnyRoutes) {
    cell.classList.add('hidden');
    return;
  }

  cell.classList.remove('hidden');

  if (container.traefik_routes?.length) {
    cell.innerHTML = container.traefik_routes.map(route => {
      const displayUrl = route.url.replace(/^https?:\/\//, '');
      return `<div class="traefik-route mb-1"><div class="inline-block"><a href="${route.url}" target="_blank" class="text-blue-600 hover:text-blue-800 text-sm"><span class="traefik-text">${displayUrl}</span></a></div></div>`;
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
  logsButton.setAttribute('data-tooltip', 'View logs');
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
