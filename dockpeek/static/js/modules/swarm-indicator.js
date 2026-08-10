
import { state } from './state.js';
/**
 * @param {Array} swarmServers
 * @param {string} currentServerFilter 
 */
function isSwarmContext(swarmServers, currentServerFilter) {
  return swarmServers && swarmServers.length > 0 &&
    (currentServerFilter === 'all' || swarmServers.includes(currentServerFilter));
}

export function isSwarmMode() {
  return isSwarmContext(state.swarmServers, state.currentServerFilter) && state.swarmModeEnabled;
}

function loadSwarmModeState() {
  const saved = localStorage.getItem('swarmModeEnabled');
  if (saved !== null) {
    state.swarmModeEnabled = JSON.parse(saved);
  }
}

export function updateSwarmIndicator(swarmServers, currentServerFilter) {
  const indicator = document.getElementById('swarm-indicator');
  if (!indicator) return;
  
  const isSwarmActive = isSwarmContext(swarmServers, currentServerFilter);
  
  if (isSwarmActive) {
    indicator.classList.remove('hidden');
    indicator.setAttribute('aria-pressed', state.swarmModeEnabled ? 'true' : 'false');

    const modeLabel = indicator.querySelector('.swarm-mode-label');
    if (modeLabel) {
      modeLabel.textContent = state.swarmModeEnabled ? 'Swarm Mode' : 'Swarm View Off';
    }

    indicator.classList.toggle('opacity-70', !state.swarmModeEnabled);

    const scope = swarmServers.length > 1
      ? `Swarm servers: ${swarmServers.join(' • ')}`
      : `Server "${swarmServers[0]}" running in Swarm mode`;

    const viewHint = state.swarmModeEnabled
      ? 'Click to show standalone containers too'
      : 'Click to switch back to swarm-service view';

    indicator.setAttribute('data-tooltip', `${scope} • ${viewHint}`);

    if (!indicator.dataset.toggleBound) {
      indicator.dataset.toggleBound = 'true';
      indicator.addEventListener('click', () => {
        state.swarmModeEnabled = !state.swarmModeEnabled;
        localStorage.setItem('swarmModeEnabled', JSON.stringify(state.swarmModeEnabled));
        updateSwarmIndicator(state.swarmServers, state.currentServerFilter);

        import('./filters.js').then(({ updateDisplay }) => {
          updateDisplay();
        });
      });
    }

  } else {
    indicator.classList.add('hidden');
    indicator.removeAttribute('data-tooltip');
    indicator.classList.remove('opacity-70');
  }
}

export function initSwarmIndicator() {
  const logoContainer = document.querySelector('.flex.items-center.space-x-4');
  loadSwarmModeState();

  if (!logoContainer) return;

  if (document.getElementById('swarm-indicator')) return;

  const indicator = document.createElement('button');
  indicator.type = 'button';
  indicator.id = 'swarm-indicator';
  indicator.className = 'hidden flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium swarm-indicator cursor-pointer focus:outline-none';
  
  indicator.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2M6.5 12.5L7.5 16.5L11.5 17.5L7.5 18.5L6.5 22.5L5.5 18.5L1.5 17.5L5.5 16.5L6.5 12.5M17.5 12.5L18.5 16.5L22.5 17.5L18.5 18.5L17.5 22.5L16.5 18.5L12.5 17.5L16.5 16.5L17.5 12.5Z"/>
    </svg>
    <span class="swarm-mode-label">Swarm Mode</span>
  `;
  
  logoContainer.appendChild(indicator);
}