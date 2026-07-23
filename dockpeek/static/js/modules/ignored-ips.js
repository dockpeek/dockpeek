import { apiUrl } from './config.js';
import { state } from './state.js';

export async function loadIgnoredIps() {
  try {
    const res = await fetch(apiUrl('/ignored-ips'));
    if (res.ok) {
      const ips = await res.json();
      state.ignoredIps.splice(0, state.ignoredIps.length, ...ips);
    }
  } catch (err) {
    console.error('Failed to load ignored IPs:', err);
  }
}

export async function addIgnoredIp(ip) {
  if (!state.ignoredIps.includes(ip)) {
    state.ignoredIps.push(ip);
  }
  await _persist();
}

export async function removeIgnoredIp(ip) {
  const idx = state.ignoredIps.indexOf(ip);
  if (idx !== -1) {
    state.ignoredIps.splice(idx, 1);
  }
  await _persist();
}

async function _persist() {
  try {
    await fetch(apiUrl('/ignored-ips'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.ignoredIps)
    });
  } catch (err) {
    console.error('Failed to save ignored IPs:', err);
  }
}
