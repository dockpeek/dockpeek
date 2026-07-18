import { apiUrl } from './config.js';
import { updateSwarmIndicator } from './swarm-indicator.js';
import { state } from './state.js';
import { showLoadingIndicator, hideLoadingIndicator, displayError } from './ui-utils.js';
import { updateDisplay, setupServerUI, toggleClearButton, clearSearch, updateUpdatesLabel } from './filters.js';
import { showConfirmationModal, showUpdatesModal, showNoUpdatesModal, showProgressModal, updateProgressModal, hideProgressModal, showUpdateInProgressModal, hideUpdateInProgressModal } from './modals.js';
import { setCachedServerStatus } from './filters.js';

let fetchController = null;
let isFetching = false;

let originalButtonHTML = '';
document.addEventListener('DOMContentLoaded', () => {
  const checkUpdatesButton = document.getElementById('check-updates-button');
  if (checkUpdatesButton) {
    originalButtonHTML = checkUpdatesButton.innerHTML;
  }
});

export async function fetchContainerData() {
  if (isFetching) {
    console.log('Fetch already in progress, ignoring');
    return;
  }

  isFetching = true;

  if (fetchController) {
    fetchController.abort();
  }

  fetchController = new AbortController();

  showLoadingIndicator();
  loadFilterStates();
  try {
    const response = await fetch(apiUrl("/data"), {
      signal: fetchController.signal
    });
    if (!response.ok) throw createResponseError(response);

    const { servers = [], containers = [], traefik_enabled = true, port_range_grouping_enabled = true, port_range_threshold = 5, swarm_servers = [] } = await response.json();

    state.allServersData.splice(0, state.allServersData.length, ...servers);
    setCachedServerStatus(servers);
    state.allContainersData.splice(0, state.allContainersData.length, ...containers);

    state.swarmServers = swarm_servers;

    window.traefikEnabled = traefik_enabled;
    window.portRangeGroupingEnabled = port_range_grouping_enabled;
    window.portRangeThreshold = port_range_threshold;

    state.isDataLoaded = true;
    document.getElementById('check-updates-button').disabled = false;

    handleServerFilterReset();
    setupServerUI();
    toggleClearButton();
    updateDisplay();
    updateSwarmIndicator(state.swarmServers, state.currentServerFilter);
    startStatusRefresh();

    // disable swarm update 
    const isCurrentServerSwarm = state.currentServerFilter !== 'all' &&
      state.swarmServers.includes(state.currentServerFilter);

    const isAllOnlySwarm = state.currentServerFilter === 'all' &&
      state.allServersData.length > 0 &&
      state.allServersData.every(server =>
        server.status !== 'inactive' && state.swarmServers.includes(server.name)
      );

    const checkUpdatesButton = document.getElementById('check-updates-button');
    if (checkUpdatesButton) {
      if (isCurrentServerSwarm || isAllOnlySwarm) {
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
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Fetch aborted');
      return;
    }
    handleFetchError(error);
  } finally {
    fetchController = null;
    isFetching = false;
    hideLoadingIndicator();
  }
}


export function createResponseError(response) {
  const status = response.status;
  const messages = {
    401: `Authorization Error (${status}): Please log in again`,
    500: `Server Error (${status}): Please try again later`,
    default: `HTTP Error: ${status} ${response.statusText}`
  };
  return new Error(messages[status] || messages.default);
}

export function handleServerFilterReset() {
  const shouldReset = !state.allServersData.some(s => s.name === state.currentServerFilter) ||
    (state.allServersData.find(s => s.name === state.currentServerFilter)?.status === 'inactive');
  if (shouldReset) {
    state.currentServerFilter = 'all';
  }
}

export function handleFetchError(error) {
  state.isDataLoaded = false;
  document.getElementById('check-updates-button').disabled = true;
  console.error("Data fetch error:", error);
  const message = error.message.includes('Failed to fetch')
    ? "Network Error: Could not connect to backend service"
    : error.message;
  displayError(message);
}

export async function checkForUpdates() {
  const checkUpdatesButton = document.getElementById('check-updates-button');

  if (state.isCheckingForUpdates) {
    console.log('Showing progress modal...');

    const progressModal = document.getElementById('progress-modal');
    progressModal.classList.remove('hidden');

    return;
  }

  if (!state.isDataLoaded) {
    return;
  }

  const activeServers = state.allServersData.filter(s => s.status === 'active');
  const serversToCheck = state.currentServerFilter === 'all'
    ? activeServers
    : activeServers.filter(s => s.name === state.currentServerFilter);

  if (serversToCheck.length > 1) {
    try {
      await showConfirmationModal(
        'Check Updates on Multiple Servers',
        `You are about to check for updates on <strong>${serversToCheck.length}</strong> servers:\n ${serversToCheck.map(s => s.name).join(' • ')}\n\nThis operation may take longer and will pull images from registries. <strong>Do you want to continue?</strong>`,
        'Check Updates'
      );
    } catch (error) {
      console.log('Multi-server update check cancelled by user');
      return;
    }
  }
  await checkUpdatesIndividually();
}

async function checkUpdatesIndividually() {
  const checkUpdatesButton = document.getElementById('check-updates-button');

  state.isCheckingForUpdates = true;

  checkUpdatesButton.classList.add('loading');
  checkUpdatesButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      </svg>
      Show Progress
  `;
  checkUpdatesButton.disabled = false;

  try {
    console.log('Fetching containers list...');
    const containersResponse = await fetch(apiUrl("/get-containers-list"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_filter: state.currentServerFilter })
    });

    if (!containersResponse.ok) {
      throw new Error(`Failed to get containers list: ${containersResponse.status}`);
    }

    const { containers, total } = await containersResponse.json();
    console.log(`Found ${total} containers to check`);

    if (total === 0) {
      showNoUpdatesModal();
      return;
    }

    showProgressModal(total);

    const updates = {};
    const updatedContainers = [];
    let processed = 0;

    const CONCURRENCY_LIMIT = 3; // Number of parallel checks
    const queue = [...containers];

    const checkContainer = async (container) => {
      if (!state.isCheckingForUpdates) return null;

      processed++;
      updateProgressModal(processed, total, container.key);

      console.log(`Checking ${container.key} (${processed + 1}/${total})`);
      let updateResult = { available: false, version: null };
      let cancelled = false;

      try {
        const response = await fetch(apiUrl("/check-single-update"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            server_name: container.server_name,
            container_name: container.container_name
          })
        });

        if (!response.ok) {
          console.error(`Failed to check ${container.key}: ${response.status}`);
        } else {
          const result = await response.json();
          if (result.cancelled) {
            cancelled = true;
          } else {
            updateResult = result.update_available;
            console.log(`${container.key}: ${updateResult.available ? 'UPDATE AVAILABLE' : 'up to date'}`);
          }
        }
      } catch (error) {
        console.error(`Error checking ${container.key}:`, error);
      }
      if (cancelled) {
        state.isCheckingForUpdates = false;
      }

      return { key: container.key, update_available: updateResult };
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
      const workerResults = [];
      while (queue.length > 0) {
        if (!state.isCheckingForUpdates) break;
        const container = queue.shift();
        if (container) {
          const result = await checkContainer(container);
          if (result) {
            workerResults.push(result);
          }
        }
      }
      return workerResults;
    });

    const allWorkerResults = await Promise.all(workers);
    const allResults = allWorkerResults.flat();

    const cancelled = !state.isCheckingForUpdates;

    allResults.forEach(result => {
      updates[result.key] = result.update_available;
    });

    state.allContainersData.forEach(container => {
      const key = `${container.server}:${container.name}`;
      if (updates.hasOwnProperty(key)) {
        container.update_available = updates[key].available;
        container.update_version = updates[key].version;
        if (updates[key].available) {
          updatedContainers.push(container);
        }
      }
    });

    updateDisplay();
    updateUpdatesLabel();
    hideProgressModal();

    if (!cancelled) {
      if (updatedContainers.length > 0) {
        showUpdatesModal(updatedContainers);
      } else {
        showNoUpdatesModal();
      }
    } else {
      console.log("Update check was cancelled");
    }

  } catch (error) {
    console.error("Update check failed:", error);
    hideProgressModal();
    alert("Failed to check for updates. Please try again.");
  } finally {
    resetUpdateButton();
  }
}

function resetUpdateButton() {
  const checkUpdatesButton = document.getElementById('check-updates-button');
  if (originalButtonHTML) {
    checkUpdatesButton.innerHTML = originalButtonHTML;
  }
  checkUpdatesButton.classList.remove('loading');
  checkUpdatesButton.disabled = false;
  state.isCheckingForUpdates = false;
}

export function updateExportLink() {
  const exportLink = document.getElementById('export-json-link');
  if (exportLink) {
    const serverParam = state.currentServerFilter === 'all' ? 'all' : encodeURIComponent(state.currentServerFilter);
    exportLink.href = `${apiUrl('/export/json')}?server=${serverParam}`;
  }
}

function loadFilterStates() {
  const savedRunningFilter = localStorage.getItem('filterRunningChecked');
  if (savedRunningFilter !== null) {
    document.getElementById('filter-running-checkbox').checked = JSON.parse(savedRunningFilter);
  }
}

export async function installUpdate(serverName, containerName) {
  const isDockpeek = containerName.toLowerCase().includes('dockpeek');
  
  let dependentContainers = [];
  try {
    const checkResponse = await fetch(apiUrl('/check-dependent-containers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_name: serverName,
        container_name: containerName,
      }),
    });
    if (checkResponse.ok) {
      const data = await checkResponse.json();
      dependentContainers = data.dependent_containers || [];
    }
  } catch (error) {
    console.warn('Could not check dependent containers:', error);
  }
  
  const dependentInfo = dependentContainers.length > 0 
    ? `<br><br><span style="color: #f59e0b; font-weight: 600;">This container has ${dependentContainers.length} dependent container(s) that will be recreated:</span><br><span style="color: #c9891d; margin-left: 1rem;">${dependentContainers.join(', ')}</span>` 
    : '';
  
  try {
    await showConfirmationModal(
      'Confirm Update',
      `Are you sure you want to update <strong>${containerName}</strong> on <strong>${serverName}</strong>? The container will be stopped and recreated with the new image.${dependentInfo}${
        isDockpeek 
          ? '<br><br><span style="color: #ef4444; font-weight: 600;">Warning: Dockpeek cannot update itself. This operation will fail. Please update dockpeek manually.</span>' 
          : ''
      }`,
      isDockpeek ? 'Update Anyway' : 'Update'
    );
  } catch (error) {
    console.log('Update cancelled by user.');
    return;
  }

  showUpdateInProgressModal(containerName);
  try {
    const response = await fetch(apiUrl('/update-container'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_name: serverName,
        container_name: containerName,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to update container.');
    }

    const { showUpdateSuccessModal } = await import('./modals.js');
    showUpdateSuccessModal(containerName, serverName);
    state.allContainersData.forEach(container => {
      if (container.server === serverName && container.name === containerName) {
        container.update_available = false;
        container.update_version = null;
      }
    });
    updateDisplay();
    updateUpdatesLabel();
    await fetchContainerData();

  } catch (error) {
    console.error('Update failed:', error);
    const { showUpdateErrorModal } = await import('./modals.js');
    showUpdateErrorModal(containerName, error.message, serverName);
  } finally {
    hideUpdateInProgressModal();
  }
}
let statusRefreshController = null;

export async function refreshContainerStatus() {
  if (!state.isDataLoaded) return;

  if (statusRefreshController) {
    statusRefreshController.abort();
  }

  statusRefreshController = new AbortController();

  try {
    const response = await fetch(apiUrl("/status"), {
      signal: statusRefreshController.signal
    });
    
    if (!response.ok) return;

    const { statuses = [] } = await response.json();

    if (statuses.length === 0) {
      console.warn("Status refresh returned empty - skipping update");
      return;
    }

    const existingKeys = new Set(
      state.allContainersData.map(c => `${c.server}:${c.name}`)
    );
    const statusKeys = new Set(statuses.map(s => `${s.server}:${s.name}`));

    const hasNewContainers = statuses.some(
      s => !existingKeys.has(`${s.server}:${s.name}`)
    );

    if (hasNewContainers) {
      console.log("New containers detected - reloading full data");
      await fetchContainerData();
      return;
    }

    for (let i = state.allContainersData.length - 1; i >= 0; i--) {
      const container = state.allContainersData[i];
      if (!statusKeys.has(`${container.server}:${container.name}`)) {
        state.allContainersData.splice(i, 1);
      }
    }

    state.allContainersData.forEach(existing => {
      const updated = statuses.find(
        s => s.server === existing.server && s.name === existing.name
      );
      if (updated) {
        existing.status = updated.status;
        existing.exit_code = updated.exit_code;
        existing.started_at = updated.started_at;
      }
    });

    updateDisplay();
    updateUpdatesLabel();
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error("Status refresh failed:", error);
    }
  } finally {
    statusRefreshController = null;
  }
}

let statusRefreshInterval = null;

export function startStatusRefresh() {
  if (statusRefreshInterval) return;
  statusRefreshInterval = setInterval(refreshContainerStatus, 60000);
}

export function stopStatusRefresh() {
  if (statusRefreshInterval) {
    clearInterval(statusRefreshInterval);
    statusRefreshInterval = null;
  }
}