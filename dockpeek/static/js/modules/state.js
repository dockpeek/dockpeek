export const state = {
  allContainersData: [],
  allServersData: [],
  serverStatusCache: {
    data: null,
    timestamp: 0,
    ttl: 30000
  },
  filteredAndSortedContainers: [],
  swarmServers: [],
  swarmModeEnabled: true,
  pruneInfoCache: null,
  currentSortColumn: "name",
  currentSortDirection: "asc",
  currentServerFilter: "all",
  isDataLoaded: false,
  isCheckingForUpdates: false,
  updateCheckController: null,
  columnOrder: ['name', 'stack', 'server', 'ports', 'traefik', 'image', 'tags', 'logs', 'status'],
  columnVisibility: {
    name: true,
    server: true,
    stack: true,
    image: true,
    tags: true,
    status: true,
    ports: true,
    traefik: true,
    logs: true
  }
};
