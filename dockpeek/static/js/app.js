import { apiUrl } from './modules/config.js';
import { state } from './modules/state.js';
import { showLoadingIndicator, hideLoadingIndicator, displayError, initCustomTooltips, initTheme } from './modules/ui-utils.js';
import { TableRenderer } from './modules/table-renderer.js';
import { DragDropHandler } from './modules/drag-drop.js';
import * as ColumnOrder from './modules/column-order.js';
import { updateColumnVisibility } from './modules/column-visibility.js';
import { fetchContainerData, checkForUpdates, updateExportLink, startStatusRefresh } from './modules/data-fetch.js';
import { updateDisplay, parseAdvancedSearch, filterByStackAndServer, toggleClearButton, clearSearch, setupServerUI, updateActiveButton } from './modules/filters.js';
import { showUpdatesModal, showNoUpdatesModal, showConfirmationModal } from './modules/modals.js';
import { initEventListeners, initLogsButtons } from './modules/events.js';
import { updateSwarmIndicator, initSwarmIndicator, isSwarmMode } from './modules/swarm-indicator.js';
import { updateContainerStats } from './modules/container-stats.js';
import { loadRegistryTemplates } from './modules/registry-urls.js';
import { loadIgnoredIps } from './modules/ignored-ips.js';

const tableRenderer = new TableRenderer('container-row-template', 'container-rows');
let dragDropHandler = null;

export function renderTable() {
  tableRenderer.render(state.filteredAndSortedContainers);
  updateContainerStats(state.filteredAndSortedContainers);
}


document.addEventListener("DOMContentLoaded", () => {
  initCustomTooltips();
  initTheme();
  
  ColumnOrder.load();
  ColumnOrder.reorderMenuItems();
  dragDropHandler = new DragDropHandler('column-list');
  
  initSwarmIndicator();
  loadRegistryTemplates();
  loadIgnoredIps();
  fetchContainerData();
  initEventListeners();
  initLogsButtons();
});