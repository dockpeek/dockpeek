
import { state } from './state.js';
import { showPruneInfoModal, showPruneResultModal } from './modals.js';

export async function initPruneInfo() {
  try {
    const response = await fetch('./get-prune-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_name: state.currentServerFilter })
    });

    if (!response.ok) throw new Error('Failed to get prune info');

    const data = await response.json();
    updatePruneBadge(data.total_count);
  } catch (error) {
    console.error('Error getting prune info:', error);
    alert('Failed to get image information. Please try again.');
  }
}


export async function handlePruneImages() {
  try {
    const response = await fetch('./get-prune-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_name: state.currentServerFilter })
    });

    if (!response.ok) throw new Error('Failed to get prune info');

    const data = await response.json();
    
    updatePruneBadge(data.total_count);

    try {
      await showPruneInfoModal(data);
      await performPrune();
    } catch (err) {
      console.log('Prune cancelled');
    }
  } catch (error) {
    console.error('Error getting prune info:', error);
    alert('Failed to get image information. Please try again.');
  }
}

async function performPrune() {
  try {
    const response = await fetch('./prune-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_name: state.currentServerFilter })
    });

    if (!response.ok) throw new Error('Failed to prune images');

    const data = await response.json();
    showPruneResultModal(data);
    updatePruneBadge(0);
  } catch (error) {
    console.error('Error pruning images:', error);
    alert('Failed to prune images. Please try again.');
  }
}

export function updatePruneBadge(count) {
  const badge = document.getElementById('prune-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}