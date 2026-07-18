import { updateDisplay } from './filters.js';
import { state } from './state.js';

export function showUpdatesModal(updatedContainers) {
  const updatesList = document.getElementById("updates-list");
  const updatesModal = document.getElementById("updates-modal");
  const updatesModalOkBtn = document.getElementById("updates-modal-ok-button");
  updatesList.innerHTML = "";

  updatedContainers.forEach(container => {
    const li = document.createElement("li");
    let versionStr = "";
    if (container.update_version) {
      versionStr = ` <span class="text-green-600 font-medium whitespace-nowrap">→ ${container.update_version}</span>`;
    }
    li.innerHTML = `<strong class="container-name">${container.name}</strong> <span class="stack-name">[${container.stack}]</span> <span class="server-name">(${container.server})</span> <span class="image-name">${container.image}</span>${versionStr}`;
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

export function showNoUpdatesModal() {
  const updatesModal = document.getElementById("updates-modal");
  const updatesModalTitle = document.getElementById("updates-modal-title");
  const updatesList = document.getElementById("updates-list");
  const updatesModalOkBtn = document.getElementById("updates-modal-ok-button");

  updatesModalTitle.innerHTML = `
    <div class="flex items-center justify-center">
      <svg class="mr-3 h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <span>No Updates Available</span>
    </div>
  `;

  updatesList.innerHTML = "<li class='no-updates-message'>All containers are up to date!</li>";
  updatesModal.classList.remove('hidden');
  updatesModal.classList.add('no-update');

  const okHandler = () => {
    updatesModal.classList.add('hidden');
    updatesModal.classList.remove('no-update');
    updatesModalTitle.textContent = "Updates Found";
  };

  updatesModalOkBtn.addEventListener('click', okHandler, { once: true });
  updatesModal.addEventListener('click', e => e.target === updatesModal && okHandler(), { once: true });
}


export function showConfirmationModal(title, message, confirmText = 'Confirm') {
  return new Promise((resolve, reject) => {
    const modal = document.getElementById("confirmation-modal");
    const modalConfirmBtn = document.getElementById("modal-confirm-button");
    const modalCancelBtn = document.getElementById("modal-cancel-button");
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

export function showProgressModal(total) {
  const progressModal = document.getElementById('progress-modal');
  const progressCounter = document.getElementById('progress-counter');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  const currentContainerEl = document.getElementById('current-container');
  const cancelButton = document.getElementById('progress-cancel-button');

  if (progressCounter) progressCounter.textContent = `0 / ${total}`;
  if (progressText) progressText.textContent = 'Starting update check...';
  if (progressFill) progressFill.style.width = '0%';
  if (currentContainerEl) currentContainerEl.textContent = 'Preparing...';

  progressModal.classList.remove('hidden');

  const cancelHandler = () => {
    state.isCheckingForUpdates = false;
    hideProgressModal();
  };


  cancelButton.removeEventListener('click', cancelHandler);
  cancelButton.addEventListener('click', cancelHandler);

  const backdropHandler = (e) => {
    if (e.target === progressModal) {
      hideProgressModal();
    }
  };

  progressModal.addEventListener('click', backdropHandler);
}


export function updateProgressModal(processed, total, currentContainer) {
  const percentage = Math.round((processed / total) * 100);
  const progressText = document.getElementById('progress-text');
  const progressCounter = document.getElementById('progress-counter');
  const progressFill = document.getElementById('progress-fill');
  const currentContainerEl = document.getElementById('current-container');

  if (progressText) {
    progressText.textContent = `Checking containers... (${percentage}%)`;
  }

  if (progressCounter) {
    progressCounter.textContent = `${processed} / ${total}`;
  }

  if (progressFill) {
    progressFill.style.width = `${percentage}%`;
  }

  if (currentContainerEl) {
    if (processed < total) {
      currentContainerEl.textContent = `${currentContainer}`;
    } else {
      currentContainerEl.textContent = 'Finishing up...';
    }
  }
}

export function hideProgressModal() {
  const progressModal = document.getElementById('progress-modal');
  if (progressModal) {
    progressModal.classList.add('hidden');
  }
}

export function showUpdateInProgressModal(containerName) {
  const modal = document.getElementById('update-in-progress-modal');
  const containerNameEl = document.getElementById('update-container-name');

  if (containerNameEl) {
    containerNameEl.textContent = containerName;
  }

  if (modal) {
    modal.classList.remove('hidden');
  }
}

export function hideUpdateInProgressModal() {
  const modal = document.getElementById('update-in-progress-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}
export function showUpdateSuccessModal(containerName, serverName) {
  const modal = document.getElementById('update-success-modal');
  const messageEl = document.getElementById('update-success-message');
  const okButton = document.getElementById('update-success-ok-button');
  const buttonsContainer = okButton.parentElement;

  if (messageEl) {
    messageEl.innerHTML = `Container <strong>"${containerName}"</strong> has been successfully updated!`;
  }

  if (modal) {
    modal.classList.remove('hidden');
  }

  const viewLogsBtn = document.createElement('button');
  viewLogsBtn.className = 'px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium view-logs-btn';
  viewLogsBtn.dataset.server = serverName;
  viewLogsBtn.dataset.container = containerName;
  viewLogsBtn.textContent = 'View Logs';

  buttonsContainer.innerHTML = '';
  buttonsContainer.appendChild(viewLogsBtn);
  buttonsContainer.appendChild(okButton);

  const okHandler = () => {
    modal.classList.add('hidden');
    buttonsContainer.innerHTML = '';
    buttonsContainer.appendChild(okButton);
    okButton.removeEventListener('click', okHandler);
    modal.removeEventListener('click', backdropHandler);
  };

  const backdropHandler = (e) => {
    if (e.target === modal) {
      okHandler();
    }
  };

  okButton.addEventListener('click', okHandler);
  modal.addEventListener('click', backdropHandler);
}

export function showUpdateErrorModal(containerName, errorMessage, serverName) {
  const modal = document.getElementById('update-error-modal');
  const messageEl = document.getElementById('update-error-message');
  const okButton = document.getElementById('update-error-ok-button');
  const buttonsContainer = okButton.parentElement;

  if (messageEl) {
    messageEl.innerHTML = errorMessage.replace(/\n/g, '<br>');
  }

  if (modal) {
    modal.classList.remove('hidden');
  }

  const viewLogsBtn = document.createElement('button');
  viewLogsBtn.className = 'px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium view-logs-btn';
  viewLogsBtn.dataset.server = serverName;
  viewLogsBtn.dataset.container = containerName;
  viewLogsBtn.textContent = 'View Logs';

  buttonsContainer.innerHTML = '';
  buttonsContainer.appendChild(viewLogsBtn);
  buttonsContainer.appendChild(okButton);

  const okHandler = () => {
    modal.classList.add('hidden');
    buttonsContainer.innerHTML = '';
    buttonsContainer.appendChild(okButton);
    okButton.removeEventListener('click', okHandler);
    modal.removeEventListener('click', backdropHandler);
  };

  const backdropHandler = (e) => {
    if (e.target === modal) {
      okHandler();
    }
  };

  if (okButton) {
    okButton.addEventListener('click', okHandler);
  }

  if (modal) {
    modal.addEventListener('click', backdropHandler);
  }
}

export function showPruneInfoModal(data) {
  const modal = document.getElementById('prune-info-modal');
  const messageEl = document.getElementById('prune-info-message');
  const confirmBtn = document.getElementById('prune-confirm-button');
  const cancelBtn = document.getElementById('prune-cancel-button');

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (data.total_count === 0) {
    messageEl.innerHTML = `<p class="text-center">No unused images found. All images are currently in use!</p>`;
    confirmBtn.style.display = 'none';
  } else {
    const pendingCount = data.servers.reduce((sum, server) =>
      sum + (server.images?.filter(img => img.pending_update).length || 0), 0);

    let details = `<p class="mb-3"><strong>${data.total_count}</strong> unused image${data.total_count > 1 ? 's' : ''} found, taking up <strong>${formatSize(data.total_size)}</strong> of disk space.</p>`;

    if (pendingCount > 0) {
      details += `<p class="mb-3 text-sm text-orange-500"><strong>Note:</strong> ${pendingCount} image${pendingCount > 1 ? 's are' : ' is'} marked as pending update and will not be removed.</p>`;
    }

    if (data.servers && data.servers.length > 0) {
      details += '<div class="text-sm text-left mt-3"><ul class="mt-2 space-y-1 prune-details-list">';
      data.servers.forEach(server => {
        details += `<li>• <strong>${server.server}:</strong> ${server.count} image${server.count > 1 ? 's' : ''} (${formatSize(server.size)})`;

        if (server.images && server.images.length > 0) {
          const sortedImages = [...server.images].sort((a, b) => {
            if (a.pending_update === b.pending_update) return 0;
            return a.pending_update ? 1 : -1;
          });

          details += '<ul class="ml-4 mt-1 text-xs text-gray-700">';
          sortedImages.forEach(img => {
            const imageName = img.tags && img.tags.length > 0
              ? img.tags[0].replace(/</g, '&lt;').replace(/>/g, '&gt;')
              : `&lt;untagged&gt; (${img.id.substring(7, 19)})`;
            const imageClass = img.pending_update ? 'text-orange-500 font-medium' : '';
            const pendingLabel = img.pending_update ? ' <span class="text-orange-500">[pending update]</span>' : '';
            details += `<li class="${imageClass}">- ${imageName} (${formatSize(img.size)})${pendingLabel}</li>`;
          });
          details += '</ul>';
        }

        details += '</li>';
      });
      details += '</ul></div>';
    }

    messageEl.innerHTML = details;
    confirmBtn.style.display = 'inline-block';
  }

  modal.classList.remove('hidden');

  return new Promise((resolve, reject) => {
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
      if (e.target === modal) cancelHandler();
    };

    const removeListeners = () => {
      confirmBtn.removeEventListener('click', confirmHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
      modal.removeEventListener('click', backdropHandler);
    };

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    modal.addEventListener('click', backdropHandler);
  });
}

export function showPruneResultModal(data) {
  const modal = document.getElementById('prune-result-modal');
  const messageEl = document.getElementById('prune-result-message');
  const okBtn = document.getElementById('prune-result-ok-button');

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  let message = `<p class="text-center mb-3">Successfully removed <strong>${data.total_count}</strong> unused image${data.total_count > 1 ? 's' : ''}, freeing up <strong>${formatSize(data.total_size)}</strong> of disk space!</p>`;

  if (data.servers && data.servers.length > 0) {
    message += '<div class="text-sm text-left"><ul class="mt-2 space-y-1 prune-details-list">';
    data.servers.forEach(server => {
      message += `<li>• <strong>${server.server}:</strong> ${server.count} image${server.count > 1 ? 's' : ''} (${formatSize(server.size)})</li>`;
    });
    message += '</ul></div>';
  }

  messageEl.innerHTML = message;
  modal.classList.remove('hidden');

  const okHandler = () => {
    modal.classList.add('hidden');
    okBtn.removeEventListener('click', okHandler);
    modal.removeEventListener('click', backdropHandler);
  };

  const backdropHandler = (e) => {
    if (e.target === modal) okHandler();
  };

  okBtn.addEventListener('click', okHandler);
  modal.addEventListener('click', backdropHandler);
}