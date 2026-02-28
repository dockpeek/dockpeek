import * as CellRenderer from './cell-renderer.js';
import { renderStatus } from './status-renderer.js';
import { updateColumnVisibility, updateFirstAndLastVisibleColumns } from './column-visibility.js';
import { updateTableOrder } from './column-order.js';


export class TableRenderer {
  constructor(templateId, bodyId) {
    this.template = document.getElementById(templateId);
    this.body = document.getElementById(bodyId);
  }

  render(containers) {
    this.body.innerHTML = '';

    if (!containers.length) {
      this.body.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-gray-500">No containers found matching your criteria.</td></tr>`;
      return;
    }

    const hasAnyTraefikRoutes = window.traefikEnabled !== false &&
      containers.some(c => c.traefik_routes?.length);

    const fragment = document.createDocumentFragment();

    for (const container of containers) {
      const row = this._renderRow(container, hasAnyTraefikRoutes);
      fragment.appendChild(row);
    }

    this.body.appendChild(fragment);
    updateTableOrder();
    updateColumnVisibility();
    updateFirstAndLastVisibleColumns();
  }

  _renderRow(container, hasAnyTraefikRoutes) {
    const clone = this.template.content.cloneNode(true);

    const nameCell = clone.querySelector('[data-content="name"]');
    nameCell.classList.add('table-cell-name');
    CellRenderer.renderName(container, nameCell);

    CellRenderer.renderServer(container, clone);

    const stackCell = clone.querySelector('[data-content="stack"]');
    stackCell.classList.add('table-cell-stack');
    CellRenderer.renderStack(container, stackCell);

    const imageCell = clone.querySelector('[data-content="image"]');
    imageCell.classList.add('table-cell-image');
    CellRenderer.renderImage(container, imageCell, clone);

    CellRenderer.renderUpdateIndicator(container, clone);

    const tagsCell = clone.querySelector('[data-content="tags"]');
    tagsCell.classList.add('table-cell-tags');
    CellRenderer.renderTags(container, tagsCell);

    const statusCell = clone.querySelector('[data-content="status"]');
    statusCell.classList.add('table-cell-status');
    const { span, className } = renderStatus(container);
    statusCell.className = `py-3 px-4 border-b border-gray-200 table-cell-status ${className}`;
    statusCell.appendChild(span);

    const ipAddressCell = clone.querySelector('[data-content="ipaddress"]');
    ipAddressCell.classList.add('table-cell-ipaddress');
    CellRenderer.renderIpAddress(container, ipAddressCell);

    const logsCell = clone.querySelector('[data-content="logs"]');
    logsCell.classList.add('table-cell-logs');
    CellRenderer.renderLogs(container, logsCell);

    const portsCell = clone.querySelector('[data-content="ports"]');
    portsCell.classList.add('table-cell-ports');
    CellRenderer.renderPorts(container, portsCell);

    const traefikCell = clone.querySelector('[data-content="traefik-routes"]');
    traefikCell.classList.add('table-cell-traefik');
    CellRenderer.renderTraefik(container, traefikCell, hasAnyTraefikRoutes);

    return clone;
  }
}