import { fetchContainerData, checkForUpdates, updateExportLink, installUpdate } from './data-fetch.js';
import { updateDisplay, clearSearch, filterByStackAndServer, parseAdvancedSearch, toggleClearButton } from './filters.js';
import { toggleThemeMenu, setTheme } from './ui-utils.js';
import { updateColumnVisibility } from './column-visibility.js';
import * as ColumnOrder from './column-order.js';
import { handlePruneImages, initPruneInfo } from './prune.js';
import { state } from './state.js';
import { logsViewer } from './logs-viewer.js';


export function initEventListeners() {
  const refreshButton = document.getElementById('refresh-button');
  const checkUpdatesButton = document.getElementById('check-updates-button');
  const filterUpdatesCheckbox = document.getElementById("filter-updates-checkbox");
  const filterRunningCheckbox = document.getElementById("filter-running-checkbox");
  const searchInput = document.getElementById("search-input");
  const clearSearchButton = document.getElementById("clear-search-button");
  const columnMenuButton = document.getElementById('column-menu-button');
  const columnMenu = document.getElementById('column-menu');
  const resetColumnsButton = document.getElementById('reset-columns-button');
  const containerRowsBody = document.getElementById("container-rows");

  refreshButton.addEventListener("click", () => {
    state.pruneInfoCache = null;
    fetchContainerData();
  });

  checkUpdatesButton.addEventListener("click", checkForUpdates);

  document.getElementById('prune-images-button').addEventListener('click', () => {
    handlePruneImages();
  });

  document.getElementById("theme-switcher").addEventListener("click", (e) => {
    e.preventDefault();
    toggleThemeMenu();
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.theme-switcher-wrapper');
    if (!wrapper) {
      document.getElementById('theme-menu').classList.remove('show');
    }
  });

  // Theme menu items
  document.querySelectorAll('.theme-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      setTheme(item.dataset.theme);
    });
  });


  filterUpdatesCheckbox.addEventListener("change", updateDisplay);

  filterRunningCheckbox.addEventListener("change", () => {
    localStorage.setItem('filterRunningChecked', JSON.stringify(filterRunningCheckbox.checked));
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
      if (column === state.currentSortColumn) {
        state.currentSortDirection = state.currentSortDirection === "asc" ? "desc" : "asc";
      } else {
        state.currentSortColumn = column;
        state.currentSortDirection = "asc";
      }
      document.querySelectorAll(".sortable-header").forEach(h => h.classList.remove('asc', 'desc'));
      header.classList.add(state.currentSortDirection);
      updateDisplay();
    });
  });

  document.querySelector('.logo-title').addEventListener('click', () => {
    filterUpdatesCheckbox.checked = false;
    clearSearch();
    updateDisplay();
  });

  containerRowsBody.addEventListener('click', function (e) {
    if (e.target.classList.contains('update-available-indicator') || e.target.closest('.update-available-indicator')) {
      e.preventDefault();
      e.stopPropagation();

      const indicator = e.target.classList.contains('update-available-indicator') ? e.target : e.target.closest('.update-available-indicator');
      const serverName = indicator.dataset.server;
      const containerName = indicator.dataset.container;

      if (serverName && containerName) {
        console.log(`Initiating update for ${containerName} on ${serverName}`);
        installUpdate(serverName, containerName);
      } else {
        console.error('Missing server or container name in update indicator');
      }
      return;
    }

    if (e.target.classList.contains('tag-badge')) {
      e.preventDefault();
      const tag = e.target.dataset.tag;
      const tagSearch = `#${tag}`;

      let currentSearch = searchInput.value.trim();
      const filters = parseAdvancedSearch(currentSearch);

      const tagAlreadyExists = filters.tags.some(existingTag =>
        existingTag.toLowerCase() === tag.toLowerCase()
      );

      if (!tagAlreadyExists) {
        const existingTags = filters.tags.map(t => `#${t}`).join(' ');
        searchInput.value = existingTags ? `${existingTags} ${tagSearch}` : tagSearch;

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

  if (resetColumnsButton) {
    resetColumnsButton.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Resetting all columns to visible');
      Object.keys(state.columnVisibility).forEach(column => {
        state.columnVisibility[column] = true;
        const toggle = document.getElementById(`toggle-${column}`);
        if (toggle) {
          toggle.checked = true;
        }
      });

      state.columnOrder.splice(0, state.columnOrder.length, 'name', 'stack', 'server', 'ports', 'traefik', 'image', 'tags', 'logs', 'status');
      ColumnOrder.reorderMenuItems()
      ColumnOrder.save()
      ColumnOrder.updateTableOrder()
      localStorage.setItem('columnVisibility', JSON.stringify(state.columnVisibility));
      updateColumnVisibility();
      console.log('Columns reset complete:', state.columnVisibility);
    });
  }

  const savedVisibility = localStorage.getItem('columnVisibility');
  if (savedVisibility) {
    Object.assign(state.columnVisibility, JSON.parse(savedVisibility));
  }

  Object.keys(state.columnVisibility).forEach(column => {
    const toggle = document.getElementById(`toggle-${column}`);
    if (toggle) {
      toggle.checked = state.columnVisibility[column];
      toggle.addEventListener('change', () => {
        state.columnVisibility[column] = toggle.checked;
        localStorage.setItem('columnVisibility', JSON.stringify(state.columnVisibility));
        updateColumnVisibility();
      });
    }
  });

  columnMenuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    columnMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    columnMenu.classList.add('hidden');
  });

  columnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  updateExportLink();
}
export function initLogsButtons() {
  document.addEventListener('click', (e) => {
    const logsButton = e.target.closest('.logs-button');
    const viewLogsBtn = e.target.closest('.view-logs-btn');

    if (logsButton) {
      e.preventDefault();
      const serverName = logsButton.dataset.server;
      const containerName = logsButton.dataset.container;
      const selectedContainer = state.filteredAndSortedContainers.find(
        c => c.server === serverName && c.name === containerName
      );
      const isSwarm = Boolean(selectedContainer?.is_swarm_service);

      if (serverName && containerName) {
        const containersWithSwarm = state.filteredAndSortedContainers.map(c => ({
          ...c,
          is_swarm: Boolean(c.is_swarm_service)
        }));

        logsViewer.setContainerList(containersWithSwarm, serverName, containerName);
        logsViewer.open(serverName, containerName, false, isSwarm);
      }
    }

    if (viewLogsBtn) {
      e.preventDefault();
      const serverName = viewLogsBtn.dataset.server;
      const containerName = viewLogsBtn.dataset.container;
      const selectedContainer = state.filteredAndSortedContainers.find(
        c => c.server === serverName && c.name === containerName
      );
      const isSwarm = Boolean(selectedContainer?.is_swarm_service);

      if (serverName && containerName) {
        const successModal = document.getElementById('update-success-modal');
        const errorModal = document.getElementById('update-error-modal');

        if (successModal && !successModal.classList.contains('hidden')) {
          successModal.classList.add('hidden');
        }
        if (errorModal && !errorModal.classList.contains('hidden')) {
          errorModal.classList.add('hidden');
        }
        const containersWithSwarm = state.filteredAndSortedContainers.map(c => ({
          ...c,
          is_swarm: Boolean(c.is_swarm_service)
        }));

        logsViewer.setContainerList(containersWithSwarm, serverName, containerName);
        logsViewer.open(serverName, containerName, true, isSwarm);
      }
    }
  });
}