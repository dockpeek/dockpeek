document.addEventListener("DOMContentLoaded", () => {
  let allContainersData = [];
  let allServersData = [];
  let filteredAndSortedContainers = [];
  let currentSortColumn = "name";
  let currentSortDirection = "asc";
  let currentServerFilter = "all";
  let isDataLoaded = false;
  let columnOrder = ['name', 'stack', 'server', 'ports', 'traefik', 'image', 'tags', 'status'];
  let columnVisibility = {
    name: true,
    server: true,
    stack: true,
    image: true,
    tags: true,
    status: true,
    ports: true,
    traefik: true
  };

  const searchInput = document.getElementById("search-input");
  const clearSearchButton = document.getElementById("clear-search-button");
  const containerRowsBody = document.getElementById("container-rows");
  const body = document.body;
  const rowTemplate = document.getElementById("container-row-template");
  const serverFilterContainer = document.getElementById("server-filter-container");
  const mainTable = document.getElementById("main-table");
  const refreshButton = document.getElementById('refresh-button');
  const checkUpdatesButton = document.getElementById('check-updates-button');
  checkUpdatesButton.disabled = true;
  const updatesModal = document.getElementById("updates-modal");
  const updatesModalOkBtn = document.getElementById("updates-modal-ok-button");
  const modal = document.getElementById("confirmation-modal");
  const modalConfirmBtn = document.getElementById("modal-confirm-button");
  const modalCancelBtn = document.getElementById("modal-cancel-button");
  const filterUpdatesCheckbox = document.getElementById("filter-updates-checkbox");
  const filterRunningCheckbox = document.getElementById("filter-running-checkbox");

  function showLoadingIndicator() {
    refreshButton.classList.add('loading');
    containerRowsBody.innerHTML = `<tr><td colspan="8"><div class="loader"></div></td></tr>`;
  }

  function hideLoadingIndicator() {
    refreshButton.classList.remove('loading');
  }

  function displayError(message) {
    hideLoadingIndicator();
    containerRowsBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">${message}</td></tr>`;
  }

  function initCustomTooltips() {
    let tooltipContainer = document.getElementById('tooltip-container');
    if (!tooltipContainer) {
      tooltipContainer = document.createElement('div');
      tooltipContainer.id = 'tooltip-container';
      document.body.appendChild(tooltipContainer);
    }

    let currentTooltip = null;
    let hideTooltipTimer = null;

    function showTooltip(text, element, type) {
      clearTimeout(hideTooltipTimer);
      if (currentTooltip && currentTooltip.dataset.owner === element) {
        return;
      }

      if (currentTooltip) {
        hideTooltip(true);
      }

      const tooltipElement = document.createElement('div');
      tooltipElement.className = 'custom-tooltip';
      tooltipElement.dataset.owner = element;

      const tooltipBox = document.createElement('div');
      tooltipBox.className = 'custom-tooltip-box';
      tooltipBox.textContent = text;

      const tooltipArrow = document.createElement('div');
      tooltipArrow.className = 'custom-tooltip-arrow';

      tooltipElement.appendChild(tooltipBox);
      tooltipElement.appendChild(tooltipArrow);
      tooltipContainer.appendChild(tooltipElement);

      currentTooltip = tooltipElement;
      tooltipElement.addEventListener('mouseover', () => clearTimeout(hideTooltipTimer));
      tooltipElement.addEventListener('mouseout', () => hideTooltip());


      const rect = element.getBoundingClientRect();
      const tooltipRect = tooltipElement.getBoundingClientRect();
      let top, left;
      const margin = 10;

      switch (type) {
        case 'data-tooltip-left':
          tooltipArrow.classList.add('arrow-right');
          top = rect.top + window.scrollY + (rect.height / 2) - (tooltipRect.height / 2);
          left = rect.left + window.scrollX - tooltipRect.width - margin;
          break;
        case 'data-tooltip-right':
          tooltipArrow.classList.add('arrow-left');
          top = rect.top + window.scrollY + (rect.height / 2) - (tooltipRect.height / 2);
          left = rect.right + window.scrollX + margin;
          break;
        case 'data-tooltip-top-right':
          tooltipArrow.classList.add('arrow-top');
          tooltipArrow.style.left = `${rect.width / 2}px`;
          tooltipArrow.style.transform = 'translateX(-50%)';
          top = rect.top + window.scrollY - tooltipRect.height - margin;
          left = rect.right + window.scrollX - tooltipRect.width;
          break;
        case 'data-tooltip-top-left':
          tooltipArrow.classList.add('arrow-top');
          tooltipArrow.style.left = `${rect.width / 2}px`;
          tooltipArrow.style.transform = 'translateX(-50%)';
          top = rect.top + window.scrollY - tooltipRect.height - margin;
          left = rect.left + window.scrollX;
          break;
        default:
          tooltipArrow.classList.add('arrow-top');
          top = rect.top + window.scrollY - tooltipRect.height - margin;
          left = rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2);
          break;
      }

      tooltipElement.style.top = `${top}px`;
      tooltipElement.style.left = `${left}px`;

      requestAnimationFrame(() => {
        tooltipElement.classList.add('is-visible');
      });
    }

    // NOWOŚĆ: Funkcja przyjmuje opcjonalny argument `immediate`
    function hideTooltip(immediate = false) {
      clearTimeout(hideTooltipTimer); // Zawsze czyść poprzedni timer
      if (!currentTooltip) return;

      if (immediate) {
        if (currentTooltip.parentElement) {
          currentTooltip.remove();
        }
        currentTooltip = null;
      } else {
        hideTooltipTimer = setTimeout(() => {
          if (!currentTooltip) return;
          const tooltipToRemove = currentTooltip;
          currentTooltip = null;
          tooltipToRemove.classList.remove('is-visible');
          tooltipToRemove.addEventListener('transitionend', () => {
            if (tooltipToRemove.parentElement) {
              tooltipToRemove.remove();
            }
          }, { once: true });
        }, 100); // Opóźnienie 100ms przed ukryciem
      }
    }

    const tooltipAttributes = [
      'data-tooltip',
      'data-tooltip-left',
      'data-tooltip-right',
      'data-tooltip-top-left',
      'data-tooltip-top-right'
    ];

    document.addEventListener('mouseover', (e) => {
      for (const attr of tooltipAttributes) {
        const target = e.target.closest(`[${attr}]`);
        if (target) {
          const tooltipText = target.getAttribute(attr);
          if (tooltipText) {
            showTooltip(tooltipText, target, attr);
            return;
          }
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      const isTooltipTarget = tooltipAttributes.some(attr => e.target.closest(`[${attr}]`));
      if (isTooltipTarget) {
        hideTooltip();
      }
    });

    document.addEventListener('scroll', () => hideTooltip(true), true);
  }


  function renderTable() {
    containerRowsBody.innerHTML = "";
    const pageItems = filteredAndSortedContainers;

    if (pageItems.length === 0) {
      containerRowsBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-500">No containers found matching your criteria.</td></tr>`;
      return;
    }


    const fragment = document.createDocumentFragment();
    for (const c of pageItems) {
      const clone = rowTemplate.content.cloneNode(true);


      const nameCell = clone.querySelector('[data-content="name"]');
      nameCell.classList.add('table-cell-name');

      const nameSpan = nameCell.querySelector('[data-content="container-name"]');
      const tagsContainer = nameCell.querySelector('[data-content="tags"]');

      if (c.custom_url) {
        function normalizeUrl(url) {
          if (url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
            return url;
          }
          return `https://${url}`;
        }

        const url = normalizeUrl(c.custom_url);
        const tooltipUrl = url.replace(/^https:\/\//, '');
        nameSpan.innerHTML = `<a href="${url}" target="_blank" class="text-blue-600 hover:text-blue-800" data-tooltip="${tooltipUrl}">${c.name}</a>`;
      } else {
        nameSpan.textContent = c.name;
      }

      // Add tags display (Name column)
      // if (c.tags && c.tags.length > 0) {
      //   tagsContainer.innerHTML = c.tags.map(tag =>
      //     `<span class="tag-badge" data-tag="${tag}">${tag}</span>`
      //   ).join('');
      // } else {
      //   tagsContainer.innerHTML = '';
      // }
      const serverNameSpan = clone.querySelector('[data-content="server-name"]');
      serverNameSpan.closest('td').classList.add('table-cell-server');
      serverNameSpan.textContent = c.server;
      const serverData = allServersData.find(s => s.name === c.server);
      if (serverData && serverData.url) {
        serverNameSpan.setAttribute('data-tooltip', serverData.url);
      }

      // Stack column - make clickable if stack exists
      const stackCell = clone.querySelector('[data-content="stack"]');
      stackCell.classList.add('table-cell-stack');
      if (c.stack) {
        stackCell.innerHTML = `<a href="#" class="stack-link text-blue-600 hover:text-blue-800 cursor-pointer" data-stack="${c.stack}" data-server="${c.server}">${c.stack}</a>`;
      } else {
        stackCell.textContent = '';
      }



      clone.querySelector('[data-content="image"]').textContent = c.image;
      clone.querySelector('[data-content="image"]').closest('td').classList.add('table-cell-image');

      // Source link handling
      const sourceLink = clone.querySelector('[data-content="source-link"]');
      if (c.source_url) {
        sourceLink.href = c.source_url;
        sourceLink.classList.remove('hidden');
        sourceLink.setAttribute('data-tooltip', c.source_url);
      } else {
        sourceLink.classList.add('hidden');
      }

      const updateIndicator = clone.querySelector('[data-content="update-indicator"]');
      if (c.update_available) {
        updateIndicator.classList.remove('hidden');
        updateIndicator.setAttribute('data-tooltip', 'Update available');
      } else {
        updateIndicator.classList.add('hidden');
      }

      const tagsCell = clone.querySelector('[data-content="tags"]');
      tagsCell.classList.add('table-cell-tags');
      if (c.tags && c.tags.length > 0) {
        const sortedTags = [...c.tags].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        tagsCell.innerHTML = `<div class="tags-container">${sortedTags.map(tag =>
          `<span class="tag-badge" data-tag="${tag}">${tag}</span>`
        ).join('')}</div>`;
      } else {
        tagsCell.innerHTML = '';
      }

      const statusCell = clone.querySelector('[data-content="status"]');
      const statusSpan = document.createElement('span');
      statusSpan.textContent = c.status;

      if (c.exit_code !== null && c.exit_code !== undefined) {
        let exitCodeText;
        if (c.exit_code === 0) {
          exitCodeText = 'Exit code: 0 (normal)';
        } else {
          exitCodeText = `Exit code: ${c.exit_code}`;
          if (c.exit_code === 137) exitCodeText += ' (SIGKILL - killed)';
          else if (c.exit_code === 143) exitCodeText += ' (SIGTERM - terminated)';
          else if (c.exit_code === 125) exitCodeText += ' (Docker daemon error)';
          else if (c.exit_code === 126) exitCodeText += ' (Container command not executable)';
          else if (c.exit_code === 127) exitCodeText += ' (Container command not found)';
          else if (c.exit_code === 1) exitCodeText += ' (General application error)';
          else if (c.exit_code === 2) exitCodeText += ' (Misuse of shell command)';
          else if (c.exit_code === 128) exitCodeText += ' (Invalid exit argument)';
          else if (c.exit_code === 130) exitCodeText += ' (SIGINT - interrupted)';
          else if (c.exit_code === 134) exitCodeText += ' (SIGABRT - aborted)';
          else if (c.exit_code === 139) exitCodeText += ' (SIGSEGV - segmentation fault)';
        }
        statusSpan.setAttribute('data-tooltip', exitCodeText);
      } else {
        let tooltipText;
        switch (c.status) {
          case 'running':
            tooltipText = 'Container is running';
            break;
          case 'healthy':
            tooltipText = 'Health check passed';
            break;
          case 'unhealthy':
            tooltipText = 'Health check failed';
            break;
          case 'starting':
            tooltipText = 'Container is starting up';
            break;
          case 'paused':
            tooltipText = 'Container is paused';
            break;
          case 'restarting':
            tooltipText = 'Container is restarting';
            break;
          case 'removing':
            tooltipText = 'Container is being removed';
            break;
          case 'dead':
            tooltipText = 'Container is dead (cannot be restarted)';
            break;
          case 'created':
            tooltipText = 'Container created but not started';
            break;
          default:
            if (c.status.includes('health unknown')) {
              tooltipText = 'Container running, health status unknown';
            } else {
              tooltipText = `Container status: ${c.status}`;
            }
        }
        statusSpan.setAttribute('data-tooltip', tooltipText);
      }

      let statusClass = 'status-unknown';

      // Swarm: running (x/y) should be green if x==y, else default
      const swarmRunningMatch = typeof c.status === 'string' && c.status.match(/^running \((\d+)\/(\d+)\)$/);
      if (swarmRunningMatch) {
        const running = parseInt(swarmRunningMatch[1], 10);
        const desired = parseInt(swarmRunningMatch[2], 10);
        if (running === desired) {
          statusClass = 'status-running';
        } else {
          statusClass = 'status-unhealthy'; // or keep as-is for problem color
        }
      } else {
        switch (c.status) {
          case 'running':
            statusClass = 'status-running';
            break;
          case 'healthy':
            statusClass = 'status-healthy';
            break;
          case 'unhealthy':
            statusClass = 'status-unhealthy';
            break;
          case 'starting':
            statusClass = 'status-starting';
            break;
          case 'exited':
            statusClass = 'status-exited';
            break;
          case 'paused':
            statusClass = 'status-paused';
            break;
          case 'restarting':
            statusClass = 'status-restarting';
            break;
          case 'removing':
            statusClass = 'status-removing';
            break;
          case 'dead':
            statusClass = 'status-dead';
            break;
          case 'created':
            statusClass = 'status-created';
            break;
          default:
            if (c.status.includes('exited')) {
              statusClass = 'status-exited';
            } else if (c.status.includes('health unknown')) {
              statusClass = 'status-running';
            } else {
              statusClass = 'status-unknown';
            }
        }
      }

      statusCell.className = `py-3 px-4 border-b border-gray-200 table-cell-status ${statusClass}`;
      statusCell.innerHTML = '';
      statusCell.appendChild(statusSpan);

      const portsCell = clone.querySelector('[data-content="ports"]');
      portsCell.classList.add('table-cell-ports');
      if (c.ports.length > 0) {
        const arrowSvg =
          `<svg width="12" height="12" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" class="align-middle">
           <path d="M19 12L31 24L19 36" stroke="currentColor" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`;

        portsCell.innerHTML = c.ports.map(p => {
          // Custom ports (from dockpeek.ports label)
          if (p.is_custom || (!p.container_port || p.container_port === '')) {
            return `<div class="custom-port flex items-center mb-1">
              <a href="${p.link}" data-tooltip="${p.link}" target="_blank" class="badge text-bg-dark rounded">${p.host_port}</a>
            </div>`;
          } else {
            // Standard ports with mapping
            return `<div class="flex items-center mb-1">
              <a href="${p.link}" data-tooltip="${p.link}" target="_blank" class="badge text-bg-dark rounded">${p.host_port}</a>
              ${arrowSvg}
              <small class="text-secondary">${p.container_port}</small>
            </div>`;
          }
        }).join('');
      } else {
        portsCell.innerHTML = `<span class="status-none" style="padding-left: 5px;">none</span>`;
      }

      // Check if Traefik is enabled globally and if any container has routes
      const isTraefikGloballyEnabled = window.traefikEnabled !== false;
      const hasTraefikRoutes = isTraefikGloballyEnabled && pageItems.some(c => c.traefik_routes && c.traefik_routes.length > 0);

      // Traefik routes handling
      const traefikCell = clone.querySelector('[data-content="traefik-routes"]');
      traefikCell.classList.add('table-cell-traefik');
      if (hasTraefikRoutes) {
        traefikCell.classList.remove('hidden');

        if (c.traefik_routes && c.traefik_routes.length > 0) {
          traefikCell.innerHTML = c.traefik_routes.map(route => {
            const displayUrl = route.url.replace(/^https?:\/\//, '');
            return `<div class="traefik-route mb-1">
          <div class="inline-block">
            <a href="${route.url}" target="_blank" class="text-blue-600 hover:text-blue-800 text-sm">
              <span class="traefik-text">${displayUrl}</span>             
            </a>
          </div>
        </div>`;

          }).join('');
        } else {
          traefikCell.innerHTML = `<span class="status-none text-sm">none</span>`;
        }
      } else {
        traefikCell.classList.add('hidden');
      }
      fragment.appendChild(clone);

    }
    containerRowsBody.appendChild(fragment);
    updateTableColumnOrder();
    updateColumnVisibility();

  }

  // Column visibility functionality (CORRECTED VERSION)
  const columnMenuButton = document.getElementById('column-menu-button');
  const columnMenu = document.getElementById('column-menu');

  // Reset columns button functionality
  const resetColumnsButton = document.getElementById('reset-columns-button');
  if (resetColumnsButton) {
    resetColumnsButton.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent menu from closing

      console.log('Resetting all columns to visible');

      // Reset column visibility
      Object.keys(columnVisibility).forEach(column => {
        columnVisibility[column] = true;
        const toggle = document.getElementById(`toggle-${column}`);
        if (toggle) {
          toggle.checked = true;
        }
      });

      // Reset column order
      columnOrder = ['name', 'stack', 'server', 'ports', 'traefik', 'image', 'tags', 'status'];
      reorderColumnMenuItems();
      saveColumnOrder();
      updateTableColumnOrder();

      // Save to localStorage
      localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));

      // Apply changes
      updateColumnVisibility();

      console.log('Columns reset complete:', columnVisibility);
    });
  }
  // Load column visibility from localStorage
  const savedVisibility = localStorage.getItem('columnVisibility');
  if (savedVisibility) {
    columnVisibility = JSON.parse(savedVisibility);
  }

  // Apply saved visibility and update toggles
  Object.keys(columnVisibility).forEach(column => {
    const toggle = document.getElementById(`toggle-${column}`);
    if (toggle) {
      toggle.checked = columnVisibility[column];
    }
  });

  // Toggle menu visibility
  columnMenuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    columnMenu.classList.toggle('hidden');
  });

  // Close menu when clicking outside
  document.addEventListener('click', () => {
    columnMenu.classList.add('hidden');
  });

  columnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Handle column toggle changes - FIXED VERSION
  Object.keys(columnVisibility).forEach(column => {
    const toggle = document.getElementById(`toggle-${column}`);
    if (toggle) {
      toggle.addEventListener('change', () => {
        columnVisibility[column] = toggle.checked;
        localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
        updateColumnVisibility();
      });
    }
  });

  function updateColumnVisibility() {
    // Update table headers
    document.querySelectorAll(`[data-sort-column="name"]`).forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.name);
    });

    // Fix server column selector - use class instead of data attribute
    document.querySelectorAll('.server-column').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.server);
    });

    document.querySelectorAll(`[data-sort-column="stack"]`).forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.stack);
    });

    document.querySelectorAll(`[data-sort-column="image"]`).forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.image);
    });

    document.querySelectorAll(`[data-sort-column="tags"]`).forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.tags);
    });

    document.querySelectorAll(`[data-sort-column="status"]`).forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.status);
    });

    document.querySelectorAll(`[data-sort-column="ports"]`).forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.ports);
    });

    document.querySelectorAll('.traefik-column').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.traefik);
    });

    document.querySelectorAll('.table-cell-name').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.name);
    });

    document.querySelectorAll('.table-cell-server').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.server);
    });

    document.querySelectorAll('.table-cell-stack').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.stack);
    });

    document.querySelectorAll('.table-cell-image').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.image);
    });

    document.querySelectorAll('.table-cell-tags').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.tags);
    });
    document.querySelectorAll('.table-cell-status').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.status);
    });

    document.querySelectorAll('.table-cell-ports').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.ports);
    });

    document.querySelectorAll('.table-cell-traefik').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.traefik);
    });

    const hasTags = filteredAndSortedContainers.some(c => c.tags && c.tags.length > 0);
    document.querySelectorAll('.tags-column').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.tags || !hasTags);
    });
    document.querySelectorAll('.table-cell-tags').forEach(el => {
      el.classList.toggle('column-hidden', !columnVisibility.tags || !hasTags);
    });
  }

  function initColumnDragAndDrop() {
    const columnList = document.getElementById('column-list');
    let draggedElement = null;
    let touchStartY = 0;
    let touchCurrentY = 0;
    let isDragging = false;

    // Load saved column order
    const savedOrder = localStorage.getItem('columnOrder');
    if (savedOrder) {
      columnOrder = JSON.parse(savedOrder);
      reorderColumnMenuItems();
    }

    // Desktop drag events
    columnList.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('draggable')) {
        draggedElement = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.outerHTML);
      }
    });

    columnList.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('draggable')) {
        e.target.classList.remove('dragging');
        draggedElement = null;
      }
    });

    columnList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const afterElement = getDragAfterElement(columnList, e.clientY);
      const dragging = columnList.querySelector('.dragging');

      columnList.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });

      if (afterElement == null) {
        columnList.appendChild(dragging);
      } else {
        afterElement.classList.add('drag-over');
        columnList.insertBefore(dragging, afterElement);
      }
    });

    columnList.addEventListener('drop', (e) => {
      e.preventDefault();
      columnList.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });

      updateColumnOrderFromDOM();
      saveColumnOrder();
      updateTableColumnOrder();
    });

    // Touch events for mobile
    columnList.addEventListener('touchstart', (e) => {
      const target = e.target.closest('.draggable');
      if (target) {
        draggedElement = target;
        touchStartY = e.touches[0].clientY;
        isDragging = false;

        // Add a small delay to distinguish between tap and drag
        setTimeout(() => {
          if (draggedElement) {
            isDragging = true;
            draggedElement.classList.add('dragging');
          }
        }, 150);
      }
    }, { passive: false });

    columnList.addEventListener('touchmove', (e) => {
      if (!draggedElement || !isDragging) return;

      e.preventDefault();
      touchCurrentY = e.touches[0].clientY;

      const afterElement = getDragAfterElement(columnList, touchCurrentY);

      columnList.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });

      if (afterElement == null) {
        columnList.appendChild(draggedElement);
      } else {
        afterElement.classList.add('drag-over');
        columnList.insertBefore(draggedElement, afterElement);
      }
    }, { passive: false });

    columnList.addEventListener('touchend', (e) => {
      if (draggedElement) {
        columnList.querySelectorAll('.drag-over').forEach(el => {
          el.classList.remove('drag-over');
        });

        if (isDragging) {
          draggedElement.classList.remove('dragging');
          updateColumnOrderFromDOM();
          saveColumnOrder();
          updateTableColumnOrder();
        }

        draggedElement = null;
        isDragging = false;
      }
    });

    // Make items draggable for desktop
    columnList.querySelectorAll('.draggable').forEach(item => {
      item.draggable = true;
    });
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.draggable:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function updateColumnOrderFromDOM() {
    const items = document.querySelectorAll('#column-list .draggable');
    columnOrder = Array.from(items).map(item => item.dataset.column);
  }

  function reorderColumnMenuItems() {
    const columnList = document.getElementById('column-list');
    const items = Array.from(columnList.children);

    // Sort items based on columnOrder
    items.sort((a, b) => {
      const aIndex = columnOrder.indexOf(a.dataset.column);
      const bIndex = columnOrder.indexOf(b.dataset.column);
      return aIndex - bIndex;
    });

    // Reappend in new order
    items.forEach(item => columnList.appendChild(item));
  }

  function saveColumnOrder() {
    localStorage.setItem('columnOrder', JSON.stringify(columnOrder));
  }

  function updateTableColumnOrder() {
    const thead = document.querySelector('#main-table thead tr');
    const headers = Array.from(thead.children);

    // Reorder headers
    columnOrder.forEach(columnName => {
      const header = headers.find(h =>
        h.dataset.sortColumn === columnName ||
        h.classList.contains(`${columnName}-column`) ||
        h.classList.contains(`table-cell-${columnName}`)
      );
      if (header) {
        thead.appendChild(header);
      }
    });

    // Reorder table body cells
    document.querySelectorAll('#container-rows tr').forEach(row => {
      const cells = Array.from(row.children);
      columnOrder.forEach(columnName => {
        const cell = cells.find(c =>
          c.classList.contains(`table-cell-${columnName}`) ||
          c.dataset.content === columnName ||
          (columnName === 'server' && c.classList.contains('server-column')) ||
          (columnName === 'traefik' && c.classList.contains('traefik-column'))
        );
        if (cell) {
          row.appendChild(cell);
        }
      });
    });
  }
  // Apply initial visibility
  updateColumnVisibility();

  function setupServerUI() {
    serverFilterContainer.innerHTML = '';
    const servers = [...allServersData];

    if (servers.length > 1) {
      mainTable.classList.remove('table-single-server');

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
          currentServerFilter = button.dataset.server;
          updateDisplay();
        });
      });
    } else {
      mainTable.classList.add('table-single-server');
    }

    updateActiveButton();
  }

  function updateActiveButton() {
    serverFilterContainer.querySelectorAll('.filter-button').forEach(button => {
      button.classList.toggle('active', button.dataset.server === currentServerFilter);
    });
  }
  function parseAdvancedSearch(searchTerm) {
    const filters = {
      tags: [],
      ports: [],
      stacks: [],
      general: []
    };

    // Split by spaces but keep quoted strings together
    const terms = searchTerm.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

    terms.forEach(term => {
      term = term.trim();
      if (!term) return;

      if (term.startsWith('#')) {
        // Tag search
        filters.tags.push(term.substring(1).toLowerCase());
      } else if (term.startsWith(':')) {
        // Port search
        filters.ports.push(term.substring(1));
      } else if (term.startsWith('stack:')) {
        // Stack search - handle quoted values
        let stackValue = term.substring(6);
        if (stackValue.startsWith('"') && stackValue.endsWith('"')) {
          stackValue = stackValue.slice(1, -1);
        }
        filters.stacks.push(stackValue.toLowerCase());
      } else {
        // General search term (remove quotes if present)
        if (term.startsWith('"') && term.endsWith('"')) {
          term = term.slice(1, -1);
        }
        filters.general.push(term.toLowerCase());
      }
    });

    return filters;
  }

  function isSwarmMode() {
    // Heuristic: if any container has a status like 'running (x/y)' or 'no-tasks', it's a Swarm service
    return allContainersData.some(c => typeof c.status === 'string' && (c.status.match(/^running \(\d+\/\d+\)$/) || c.status === 'no-tasks'));
  }

  function updateDisplay() {
    let workingData = [...allContainersData];

    if (currentServerFilter !== "all") {
      workingData = workingData.filter(c => c.server === currentServerFilter);
    }

    // Swarm mode: repurpose toggle to "Show Problems"
    const swarmMode = isSwarmMode();
    const filterLabel = document.getElementById('filter-running-label');
    if (swarmMode) {
      filterLabel.textContent = 'Show Problems';
      filterLabel.setAttribute('data-tooltip', 'Show only services where not all replicas are running');
      filterRunningCheckbox.parentElement.classList.remove('hidden');
    } else {
      filterLabel.textContent = 'Running only';
      filterLabel.removeAttribute('data-tooltip');
      filterRunningCheckbox.parentElement.classList.remove('hidden');
    }

    if (filterRunningCheckbox.checked) {
      if (swarmMode) {
        // Only show services where running < desired replicas
        workingData = workingData.filter(c => {
          if (typeof c.status === 'string') {
            const m = c.status.match(/^running \((\d+)\/(\d+)\)$/);
            if (m) {
              const running = parseInt(m[1], 10);
              const desired = parseInt(m[2], 10);
              return running < desired;
            }
            // Also show 'no-tasks' as a problem
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

    if (searchTerm) {
      const filters = parseAdvancedSearch(searchTerm);

      workingData = workingData.filter(container => {
        // All filter conditions must be met (AND logic)

        // Check tags
        if (filters.tags.length > 0) {
          const hasAllTags = filters.tags.every(searchTag =>
            container.tags && container.tags.some(containerTag =>
              containerTag.toLowerCase().includes(searchTag)
            )
          );
          if (!hasAllTags) return false;
        }

        // Check ports
        if (filters.ports.length > 0) {
          const hasAllPorts = filters.ports.every(searchPort =>
            container.ports.some(p =>
              p.host_port.includes(searchPort) ||
              p.container_port.includes(searchPort)
            )
          );
          if (!hasAllPorts) return false;
        }

        // Check stacks
        if (filters.stacks.length > 0) {
          const hasAllStacks = filters.stacks.every(searchStack =>
            container.stack && container.stack.toLowerCase().includes(searchStack)
          );
          if (!hasAllStacks) return false;
        }

        // Check general search terms
        if (filters.general.length > 0) {
          const hasAllGeneral = filters.general.every(searchTerm => {
            return (
              container.name.toLowerCase().includes(searchTerm) ||
              container.image.toLowerCase().includes(searchTerm) ||
              (container.stack && container.stack.toLowerCase().includes(searchTerm)) ||
              //(container.tags && container.tags.some(tag => tag.toLowerCase().includes(searchTerm))) ||
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
      let valA = a[currentSortColumn];
      let valB = b[currentSortColumn];

      if (currentSortColumn === "status") {
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
      } else if (currentSortColumn === "ports") {
        const getFirstPort = (container) => {
          if (container.ports.length === 0) {
            return currentSortDirection === "asc" ? Number.MAX_SAFE_INTEGER : -1;
          }
          return parseInt(container.ports[0].host_port, 10);
        };
        valA = getFirstPort(a);
        valB = getFirstPort(b);
      } else if (currentSortColumn === "traefik") {
        const getTraefikRoutes = (container) => {
          if (!container.traefik_routes || container.traefik_routes.length === 0) {
            return currentSortDirection === "asc" ? "zzz_none" : "";
          }
          return container.traefik_routes[0].url.toLowerCase();
        };
        valA = getTraefikRoutes(a);
        valB = getTraefikRoutes(b);
      } else if (typeof valA === "string" && typeof valB === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return currentSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return currentSortDirection === "asc" ? 1 : -1;
      return 0;
    });



    // Check if Traefik is enabled globally and if any container has Traefik routes
    const isTraefikGloballyEnabled = window.traefikEnabled !== false; // Default true if not set
    const hasTraefikRoutes = isTraefikGloballyEnabled && workingData.some(c => c.traefik_routes && c.traefik_routes.length > 0);

    // Show/hide Traefik column
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

    // Also update table cells visibility
    document.querySelectorAll('.table-cell-tags').forEach(cell => {
      if (hasTags) {
        cell.classList.remove('hidden');
      } else {
        cell.classList.add('hidden');
      }
    });


    // Hide server column if only one server is visible after filtering
    const uniqueServers = [...new Set(workingData.map(c => c.server))];
    const serverHeaders = document.querySelectorAll('.server-column');
    serverHeaders.forEach(header => {
      if (uniqueServers.length <= 1) {
        header.classList.add('hidden');
      } else {
        header.classList.remove('hidden');
      }
    });

    // Update table class for single server styling
    if (uniqueServers.length <= 1) {
      mainTable.classList.add('table-single-server');
    } else {
      mainTable.classList.remove('table-single-server');
    }

    filteredAndSortedContainers = workingData;
    hideLoadingIndicator();
    renderTable();
    updateActiveButton();
    updateExportLink();
    updateTableColumnOrder();
  }

  function filterByStackAndServer(stack, server) {
    currentServerFilter = server;
    updateActiveButton();
    let stackTerm = stack.includes(" ") ? `"${stack}"` : stack;
    searchInput.value = `stack:${stackTerm}`;
    toggleClearButton();
    updateDisplay();
    searchInput.focus();
  }

  function toggleClearButton() {
    if (searchInput.value.trim() !== '') {
      clearSearchButton.classList.remove('hidden');
    } else {
      clearSearchButton.classList.add('hidden');
    }
  }

  function clearSearch() {
    searchInput.value = '';
    clearSearchButton.classList.add('hidden');
    searchInput.focus();
    updateDisplay();
  }

  async function fetchContainerData() {

    showLoadingIndicator();
    loadFilterStates();
    try {
      const response = await fetch("/data");
      if (!response.ok) throw createResponseError(response);

      const { servers = [], containers = [], traefik_enabled = true } = await response.json();
      [allServersData, allContainersData] = [servers, containers];
      window.traefikEnabled = traefik_enabled;

      isDataLoaded = true;
      checkUpdatesButton.disabled = false;

      handleServerFilterReset();
      setupServerUI();
      clearSearch();
      toggleClearButton();
      filterUpdatesCheckbox.checked = false;
      updateDisplay();

    } catch (error) {
      handleFetchError(error);
    } finally {
      hideLoadingIndicator();
    }
  }

  function createResponseError(response) {
    const status = response.status;
    const messages = {
      401: `Authorization Error (${status}): Please log in again`,
      500: `Server Error (${status}): Please try again later`,
      default: `HTTP Error: ${status} ${response.statusText}`
    };
    return new Error(messages[status] || messages.default);
  }

  function handleServerFilterReset() {
    const shouldReset = !allServersData.some(s => s.name === currentServerFilter) ||
      (allServersData.find(s => s.name === currentServerFilter)?.status === 'inactive');
    if (shouldReset) {
      currentServerFilter = 'all';
    }
  }

  function handleFetchError(error) {
    isDataLoaded = false;
    checkUpdatesButton.disabled = true;
    console.error("Data fetch error:", error);
    const message = error.message.includes('Failed to fetch')
      ? "Network Error: Could not connect to backend service"
      : error.message;
    displayError(message);
  }

  function applyTheme(theme) {
    const themeIcon = document.getElementById("theme-icon");
    if (theme === "dark") {
      body.classList.add("dark-mode");
      themeIcon.innerHTML = `<svg fill="currentColor" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 11.5373 21.3065 11.4608 21.0672 11.8568C19.9289 13.7406 17.8615 15 15.5 15C11.9101 15 9 12.0899 9 8.5C9 6.13845 10.2594 4.07105 12.1432 2.93276C12.5392 2.69347 12.4627 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/></svg>`;
    } else {
      body.classList.remove("dark-mode");
      themeIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><g clip-path="url(#a)" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4" stroke-linejoin="round"/><path d="M20 12h1M3 12h1m8 8v1m0-18v1m5.657 13.657.707.707M5.636 5.636l.707.707m0 11.314-.707.707M18.364 5.636l-.707.707" stroke-linecap="round"/></g><defs><clipPath id="a"><path fill="currentColor" d="M0 0h24v24H0z"/></clipPath></defs></svg>`;
    }
    localStorage.setItem("theme", theme);
  }

  async function checkForUpdates() {
    if (!isDataLoaded) {
      return;
    }
    const activeServers = allServersData.filter(s => s.status === 'active');
    const serversToCheck = currentServerFilter === 'all'
      ? activeServers
      : activeServers.filter(s => s.name === currentServerFilter);

    if (serversToCheck.length > 1) {
      try {
        await showConfirmationModal(
          'Check Updates on Multiple Servers',
          `You are about to check for updates on ${serversToCheck.length} servers:\n\n${serversToCheck.map(s => `• ${s.name}`).join('\n')}\n\nThis operation may take longer and will pull images from registries. Do you want to continue?`,
          'Check Updates'
        );
      } catch (error) {
        console.log('Multi-server update check cancelled by user');
        return;
      }
    }

    checkUpdatesButton.classList.add('loading');
    checkUpdatesButton.disabled = true;

    try {
      const requestData = {
        server_filter: currentServerFilter
      };

      const response = await fetch("/check-updates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const { updates } = await response.json();
      const updatedContainers = [];

      allContainersData.forEach(container => {
        const key = `${container.server}:${container.name}`;
        if (updates.hasOwnProperty(key)) {
          container.update_available = updates[key];
          if (updates[key]) {
            updatedContainers.push(container);
          }
        }
      });

      updateDisplay();

      if (updatedContainers.length > 0) {
        showUpdatesModal(updatedContainers);
      } else {
        showNoUpdatesModal();
      }

    } catch (error) {
      console.error("Update check failed:", error);
      alert("Failed to check for updates. Please try again.");
    } finally {
      checkUpdatesButton.classList.remove('loading');
      checkUpdatesButton.disabled = false;
    }
  }

  checkUpdatesButton.addEventListener("click", checkForUpdates);


  function showUpdatesModal(updatedContainers) {
    const updatesList = document.getElementById("updates-list");
    updatesList.innerHTML = "";

    updatedContainers.forEach(container => {
      const li = document.createElement("li");
      li.innerHTML = `<strong class="container-name">${container.name}</strong> <span class="stack-name">[${container.stack}]</span> <span class="server-name">(${container.server})</span> <span class="image-name">${container.image}</span>`;
      updatesList.appendChild(li);
    });

    updatesModal.classList.remove('hidden');

    const okHandler = () => {
      updatesModal.classList.add('hidden');
      updateDisplay();
    };

    updatesModalOkBtn.addEventListener('click', okHandler, { once: true });
    updatesModal.addEventListener('click', e => e.target === updatesModal && okHandler(), { once: true });
  }

  function showNoUpdatesModal() {
    const updatesModalTitle = document.getElementById("updates-modal-title");
    const updatesList = document.getElementById("updates-list");

    updatesModalTitle.textContent = "No Updates Available";
    updatesList.innerHTML = "<li class='no-updates-message'>All containers are up to date!</li>";
    updatesModal.classList.remove('hidden');

    const okHandler = () => {
      updatesModal.classList.add('hidden');
      updatesModalTitle.textContent = "Updates Found";
    };

    updatesModalOkBtn.addEventListener('click', okHandler, { once: true });
    updatesModal.addEventListener('click', e => e.target === updatesModal && okHandler(), { once: true });
  }

  function showConfirmationModal(title, message, confirmText = 'Confirm') {
    return new Promise((resolve, reject) => {
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-message').innerHTML = message.replace(/\n/g, '<br>');
      modalConfirmBtn.textContent = confirmText;
      modal.classList.remove('hidden');

      const confirmHandler = () => {
        modal.classList.add('hidden');
        removeListeners();
        resolve();
      };

      const cancelHandler = () => {
        modal.classList.add('hidden');
        removeListeners();
        reject(new Error('User cancelled'));
      };

      const backdropHandler = (e) => {
        if (e.target === modal) {
          cancelHandler();
        }
      };

      const removeListeners = () => {
        modalConfirmBtn.removeEventListener('click', confirmHandler);
        modalCancelBtn.removeEventListener('click', cancelHandler);
        modal.removeEventListener('click', backdropHandler);
      };

      modalConfirmBtn.addEventListener('click', confirmHandler);
      modalCancelBtn.addEventListener('click', cancelHandler);
      modal.addEventListener('click', backdropHandler);
    });
  }

  function updateExportLink() {
    const exportLink = document.getElementById('export-json-link');
    if (exportLink) {
      const serverParam = currentServerFilter === 'all' ? 'all' : encodeURIComponent(currentServerFilter);
      exportLink.href = `/export/json?server=${serverParam}`;
    }
  }

  const exportLink = document.getElementById('export-json-link');
  if (exportLink) {
    updateExportLink();
  }
  fetchContainerData();
  applyTheme(localStorage.getItem("theme") || "dark");

  refreshButton.addEventListener("click", fetchContainerData);

  document.getElementById("theme-switcher").addEventListener("click", () => {
    applyTheme(body.classList.contains("dark-mode") ? "light" : "dark");
  });

  filterUpdatesCheckbox.addEventListener("change", updateDisplay);

  function loadFilterStates() {
    const savedRunningFilter = localStorage.getItem('filterRunningChecked');
    if (savedRunningFilter !== null) {
      filterRunningCheckbox.checked = JSON.parse(savedRunningFilter);
    }
  }

  function saveFilterStates() {
    localStorage.setItem('filterRunningChecked', JSON.stringify(filterRunningCheckbox.checked));
  }

  filterRunningCheckbox.addEventListener("change", () => {
    saveFilterStates();
    updateDisplay();
  });

  searchInput.addEventListener("input", function () {
    toggleClearButton();
    updateDisplay();
  });

  clearSearchButton.addEventListener('click', clearSearch);

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      clearSearch();
    }
  });

  document.querySelectorAll(".sortable-header").forEach((header) => {
    header.addEventListener("click", () => {
      const column = header.dataset.sortColumn;
      if (column === currentSortColumn) {
        currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
      } else {
        currentSortColumn = column;
        currentSortDirection = "asc";
      }
      document.querySelectorAll(".sortable-header").forEach(h => h.classList.remove('asc', 'desc'));
      header.classList.add(currentSortDirection);
      updateDisplay();
    });
  });

  document.querySelector('.logo-title').addEventListener('click', () => {
    // currentServerFilter = 'all';
    // filterRunningCheckbox.checked = false;
    filterUpdatesCheckbox.checked = false;
    clearSearch();
    updateDisplay();

  });
  containerRowsBody.addEventListener('click', function (e) {
    if (e.target.classList.contains('tag-badge')) {
      e.preventDefault();
      const tag = e.target.dataset.tag;
      const tagSearch = `#${tag}`;

      let currentSearch = searchInput.value.trim();

      // Parse current search to check for duplicates
      const filters = parseAdvancedSearch(currentSearch);

      // Check if tag already exists (case insensitive)
      const tagAlreadyExists = filters.tags.some(existingTag =>
        existingTag.toLowerCase() === tag.toLowerCase()
      );

      if (!tagAlreadyExists) {
        // Add tag to existing search
        if (currentSearch) {
          searchInput.value = `${currentSearch} ${tagSearch}`;
        } else {
          searchInput.value = tagSearch;
        }

        toggleClearButton();
        updateDisplay();
        searchInput.focus();
      }
    }

    if (e.target.classList.contains('stack-link')) {
      e.preventDefault();
      e.stopPropagation();
      const stack = e.target.dataset.stack;
      const server = e.target.dataset.server;
      filterByStackAndServer(stack, server);
    }
  });
  updateColumnVisibility();
  initColumnDragAndDrop();
  initCustomTooltips();
});