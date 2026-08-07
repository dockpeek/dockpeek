import { escapeHtml } from './sanitize.js';

export function showLoadingIndicator() {
  const refreshButton = document.getElementById('refresh-button');
  const containerRowsBody = document.getElementById("container-rows");
  refreshButton.classList.add('loading');
  containerRowsBody.innerHTML = `<tr><td colspan=9"><div class="loader"></div></td></tr>`;
}

export function hideLoadingIndicator() {
  const refreshButton = document.getElementById('refresh-button');
  refreshButton.classList.remove('loading');
}

export function displayError(message) {
  const containerRowsBody = document.getElementById("container-rows");
  hideLoadingIndicator();
  containerRowsBody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-red-500">${escapeHtml(message)}</td></tr>`;
}

export function initCustomTooltips() {
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

  function hideTooltip(immediate = false) {
    clearTimeout(hideTooltipTimer);
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
      }, 100);
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
export function applyTheme(theme) {
  const themeIcon = document.getElementById("theme-icon");
  const body = document.body;
  
  // Determine actual theme (handle 'system' option)
  let effectiveTheme = theme;
  if (theme === 'system') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  if (effectiveTheme === "dark") {
    body.classList.add("dark-mode");
    themeIcon.innerHTML = `<svg fill="currentColor" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 11.5373 21.3065 11.4608 21.0672 11.8568C19.9289 13.7406 17.8615 15 15.5 15C11.9101 15 9 12.0899 9 8.5C9 6.13845 10.2594 4.07105 12.1432 2.93276C12.5392 2.69347 12.4627 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/></svg>`;
  } else {
    body.classList.remove("dark-mode");
    themeIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><g clip-path="url(#a)" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4" stroke-linejoin="round"/><path d="M20 12h1M3 12h1m8 8v1m0-18v1m5.657 13.657.707.707M5.636 5.636l.707.707m0 11.314-.707.707M18.364 5.636l-.707.707" stroke-linecap="round"/></g><defs><clipPath id="a"><path fill="currentColor" d="M0 0h24v24H0z"/></clipPath></defs></svg>`;
  }
  localStorage.setItem("theme", theme);
}

let currentTheme = 'system';

export function initTheme() {
  currentTheme = localStorage.getItem("theme") || "system";
  applyTheme(currentTheme);
  updateThemeMenuActive();
  
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  });
}

export function toggleThemeMenu() {
  const menu = document.getElementById('theme-menu');
  menu.classList.toggle('show');
}

export function setTheme(theme) {
  currentTheme = theme;
  applyTheme(currentTheme);
  updateThemeMenuActive();
  document.getElementById('theme-menu').classList.remove('show');
}

function updateThemeMenuActive() {
  document.querySelectorAll('.theme-menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.theme === currentTheme);
  });
}