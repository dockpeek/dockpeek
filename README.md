<div align="center">
  
  <a href="https://github.com/dockpeek/dockpeek">
     <img src="dockpeek/static/images/logo_2.svg" alt="dockpeek logo" width="80" height="80"/>
  </a>
  <h1>Dockpeek</h1>
  
  [![GitHub release (latest by date)](https://img.shields.io/github/v/release/dockpeek/dockpeek?style=flat-square&logo=github)](https://github.com/dockpeek/dockpeek/releases)
  [![GitHub Repo stars](https://img.shields.io/github/stars/dockpeek/dockpeek?style=flat-square&logo=github)](https://github.com/dockpeek/dockpeek)
  [![License](https://img.shields.io/github/license/dockpeek/dockpeek?style=flat-square&logo=github)](https://github.com/dockpeek/dockpeek/blob/main/LICENSE)
  [![Package Registry](https://img.shields.io/badge/package-ghcr.io-blue?style=flat-square&logo=github)](https://github.com/dockpeek/dockpeek/pkgs/container/dockpeek)
  [![Docker Image Size](https://img.shields.io/docker/image-size/dockpeek/dockpeek/latest?style=flat-square&logo=docker)](https://hub.docker.com/r/dockpeek/dockpeek)
  [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-donate-yellow?style=flat-square&logo=buymeacoffee)](https://buymeacoffee.com/dockpeek)


<h3>Quick Access & Easy Updates for Your Docker Containers</h3>

<p><b>Dockpeek</b> is a lightweight, self-hosted Docker dashboard for quick access to your containers.  
Open web interfaces, view logs, monitor ports, and update images — all from one clean, intuitive interface.  
It automatically detects Traefik labels and works out of the box with zero configuration.</p>

</div>

## ✨ Key Features

* **One-click web access** — Instantly open your containers’ dashboards and web apps
* **Automatic port mapping** — Detect and display all published ports
* **Live container logs** — Stream logs in real time
* **Traefik integration** — Automatically extract service URLs from labels
* **Multi-host management** — Control multiple Docker daemons from one interface
* **Image update checks** — Detect and upgrade outdated containers

## 🏷️ Labels Support

Add labels to your containers to tag them, customize their appearance, or control how dockpeek interacts with them.

* `dockpeek.https` — Force HTTPS protocol for specific ports
* `dockpeek.link` — Turn container names into clickable links
* `dockpeek.ports` — Add custom ports to display alongside detected ones
* `dockpeek.port-range-grouping` — Control port range grouping (true/false)
* `dockpeek.tags` — Organize and categorize containers with custom tags

### Port Range Grouping

Dockpeek automatically groups consecutive ports into ranges for cleaner display. For example, ports 601, 602, 603, 604, 605, 606 will be displayed as a single range "601-606" instead of individual port badges.

**Global Configuration:**
```bash
# Disable port range grouping globally
export PORT_RANGE_GROUPING=false
```

**Per-Container Configuration:**
```yaml
labels:
  - "dockpeek.port-range-grouping=false"  # Disable for this container
  - "dockpeek.port-range-grouping=true"   # Enable for this container (overrides global)
```

<br>

<div align="center">

![Dockpeek Night mode screenshot](screenshots/screenshot_dark_v1.6.5.png)

<details>
<summary><strong>Container logs view</strong></summary>

![Dockpeek Container logs screenshot](screenshots/screenshot_dark_logs_v1.6.6.png)

</details>

<details>
<summary><strong>Checking for updates</strong></summary>

![Dockpeek Checking for updates](screenshots/screenshot_dark_check_update_v1.6.5.png)

</details>

<details>
<summary><strong>Updates available</strong></summary>

![Dockpeek Updates available](screenshots/screenshot_dark_updates_available_v1.6.5.png)

</details>

<details>
<summary><strong>Light mode</strong></summary>

![Dockpeek Light mode screenshot](screenshots/screenshot_light_v1.6.5.png)

</details>

</div>


<br>

## 🔧 Installation

### Basic Setup (Recommended)

The easiest way to get started with dockpeek:

```yaml
services:
  dockpeek:
    image: dockpeek/dockpeek:latest
    container_name: dockpeek
    environment:
      - SECRET_KEY=your_secure_secret_key # Required: Set a secure secret key
      - USERNAME=admin # username
      - PASSWORD=admin # password
    # Server name for UI (optional, auto-detected from Docker API if not set)
    #  - DOCKER_HOST_NAME=
    ports:
      - "3420:8000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
```


> [!TIP]
> You can add labels to your other containers to tag them or control how dockpeek interacts with them.
>
> Learn more about [available dockpeek labels.](#%EF%B8%8F-container-labels)

### Option 2: Socket Proxy

For enhanced security, use a socket proxy to limit Docker API access:

```yaml
services:
  dockpeek:
    image: dockpeek/dockpeek:latest
    container_name: dockpeek
    environment:
      - SECRET_KEY=your_secure_secret_key
      - USERNAME=admin
      - PASSWORD=admin
      - DOCKER_HOST=tcp://socket-proxy:2375 # Connect via socket proxy
    ports:
      - "3420:8000"
    depends_on:
      - socket-proxy
    restart: unless-stopped

  socket-proxy:
           # alternative: tecnativa/docker-socket-proxy
    image: lscr.io/linuxserver/socket-proxy:latest 
    container_name: dockpeek-socket-proxy
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - PING=1
      - VERSION=1
      - INFO=1
      - POST=1
      # Required for container updates
      - ALLOW_START=1
      - ALLOW_STOP=1
      - ALLOW_RESTARTS=1
      - NETWORKS=1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    read_only: true
    tmpfs:
      - /run
    restart: unless-stopped
```

<br>

## 🌐 Multi-Host Setup

Manage multiple Docker hosts from a single dashboard:
```yaml
services:
  dockpeek:
    image: dockpeek/dockpeek:latest
    container_name: dockpeek
    restart: unless-stopped
    ports:
      - "3420:8000"
    environment:
      - SECRET_KEY=your_secure_secret_key
      - USERNAME=admin
      - PASSWORD=admin

      # --- Docker Host 1 (Local) ---
      - DOCKER_HOST_1_URL=unix:///var/run/docker.sock # Local Docker socket
      # DOCKER_HOST_1_NAME= is Optional: Auto-detected from Docker API if not set
      # DOCKER_HOST_1_PUBLIC_HOSTNAME= is optional; uses host IP by default

      # --- Docker Host 2 (Remote Server) ---
      - DOCKER_HOST_2_URL=tcp://192.168.1.100:2375 # Remote socket proxy
      - DOCKER_HOST_2_NAME=Production Server # Optional: Auto-detected from Docker API if not set
      - DOCKER_HOST_2_PUBLIC_HOSTNAME=server.local # Optional: Custom hostname for links

      # --- Docker Host 3 (Tailscale) ---
      - DOCKER_HOST_3_URL=tcp://100.64.1.5:2375 # Tailscale IP
      - DOCKER_HOST_3_NAME=Remote VPS # Optional: Auto-detected from Docker API if not set
      - DOCKER_HOST_3_PUBLIC_HOSTNAME=vps.tailnet.ts.net # Optional: Tailscale FQDN

      # --- Continue pattern for additional hosts (4, 5, etc.) ---
    volumes:
      # Required only if you are connecting to a local socket
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

> [!TIP]
> Install a Docker Socket Proxy on each remote host for secure API access.

<br>

## ⚙️ Configuration

### Required Environment Variables

| Variable     | Description                                                                |
| ------------ | -------------------------------------------------------------------------- |
| `SECRET_KEY` | **Required.** Essential for application functionality and session security |
| `USERNAME`   | **Required.** Username for dashboard login                                 |
| `PASSWORD`   | **Required.** Password for dashboard login                                 |

### Optional Configuration

| Variable                      | Default       | Description                                            |
| ----------------------------- | ------------- | ------------------------------------------------------ |
| `DISABLE_AUTH`                | `false`       | Set to `true` to disable authentication                |
| `TRAEFIK_LABELS`              | `true`        | Set to `false` to hide Traefik column      |
| `TAGS`                        | `true`        | Set to `false` to hide tags column           |
| `UPDATE_FLOATING_TAGS`        | `disabled`    | Update check mode: `latest`, `major` (e.g., `8.3.3` → `8`), or `minor` (e.g., `8.3.3` → `8.3`) (default: exact tags) |
| `TRUST_PROXY_HEADERS`         | `false`       | Set to `true` to enable proxy header support (X-Forwarded-*) |
| `TRUSTED_PROXY_COUNT`         | `1`           | Number of trusted proxies when `TRUST_PROXY_HEADERS=true` |
| `DOCKER_HOST`                 | Local socket  | Primary Docker connection URL                          |
| `DOCKER_HOST_NAME`            | Auto-detected | Display name for the primary server (auto-detected from Docker API if not set) |
| `DOCKER_HOST_PUBLIC_HOSTNAME` | Auto-detected | Optional hostname or IP for generating clickable links |
| `DOCKER_CONNECTION_TIMEOUT`   | `0.5`           | Connection timeout in seconds for Docker host discovery |

### Multi-Host Variables

For additional Docker hosts, use the pattern `DOCKER_HOST_N_*`:

| Variable                        | Description                              |
| ------------------------------- | ---------------------------------------- |
| `DOCKER_HOST_N_URL`             | Docker API URL (e.g., `tcp://host:2375`) |
| `DOCKER_HOST_N_NAME`            | Display name in the dashboard (auto-detected from Docker API if not set) |
| `DOCKER_HOST_N_PUBLIC_HOSTNAME` | Optional public hostname for links       |

> [!IMPORTANT] 
> **Important Configuration Requirements:**
>
> - `SECRET_KEY` must always be set - dockpeek will not function without it
> - `USERNAME` and `PASSWORD` are required unless `DISABLE_AUTH=true`
> - Multi-host variables require matching `N` identifiers (URL, name, hostname)

<br>

## 🏷️ Container Labels

Customize how containers appear and behave in dockpeek:

```yaml
services:
  webapp:
    image: nginx:latest
    ports:
      - "3001:80"
    labels:
      - "dockpeek.ports=8080,9090" # Show additional ports
      - "dockpeek.https=3001,8080" # Force HTTPS for these ports
      - "dockpeek.link=https://myapp.local" # Make container name clickable
      - "dockpeek.tags=frontend,production" # Add organization tags
```

### Available Labels

| Label            | Purpose               | Example                         |
| ---------------- | --------------------- | ------------------------------- |
| `dockpeek.ports` | Show additional ports | `dockpeek.ports=8080,9090`      |
| `dockpeek.https` | Force HTTPS for ports | `dockpeek.https=9002,3000`      |
| `dockpeek.link`  | Custom container link | `dockpeek.link=https://app.com` |
| `dockpeek.port-range-grouping` | Control port range grouping | `dockpeek.port-range-grouping=false` |
| `dockpeek.tags`  | tags                  | `dockpeek.tags=web,prod`        |

<br>

## 🐳 Docker Swarm Support

Dockpeek natively supports Docker Swarm, You can deploy dockpeek as a stack, with a single socket-proxy instance, and view/manage all Swarm services and tasks in the dashboard. This configuration is ideal for production clusters using Traefik as an ingress proxy.

![swarm](https://i.imgur.com/ceEFBT7.png)

<details>
<summary>Click to see Example stack file (docker-compose-swarm-socket.yml)</summary>

```yaml
services:
  dockpeek:
    image: dockpeek/dockpeek:latest
    environment:
      - SECRET_KEY=your_secure_secret_key
      - USERNAME=admin
      - PASSWORD=admin
      - TRAEFIK_LABELS=true
      - DOCKER_HOST=tcp://tasks.socket-proxy:2375 # Connect to Swarm manager via socket-proxy
    ports:
      - "3420:8000"
    networks:
      - traefik
      - dockpeek-internal
    deploy:
      replicas: 1
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.dockpeek.rule=Host(`dockpeek.example.com`)"
        - "traefik.http.routers.dockpeek.entrypoints=websecure"
        - "traefik.http.routers.dockpeek.tls=true"
        - "traefik.http.services.dockpeek.loadbalancer.server.port=8000"

  socket-proxy:
    image: lscr.io/linuxserver/socket-proxy:latest
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - PING=1
      - VERSION=1
      - INFO=1
      - POST=1
      - SERVICES=1 # Enable Swarm services API
      - TASKS=1 # Enable Swarm tasks API
      - NODES=1 # Enable Swarm nodes API
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - type: tmpfs
        target: /run
        tmpfs:
          size: 100000000
    networks:
      - socket-proxy
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

networks:
  socket-proxy:
  traefik:
    external: true
```

**How it works:**

- The dockpeek and socket-proxy services share a private network for secure API access.
- The traefik network is external and should be pre-created by your Traefik deployment.
- Traefik labels on dockpeek expose the dashboard securely at your chosen domain.
- The DOCKER_HOST variable points to the socket-proxy service, which must run on a Swarm manager node.
- Dockpeek will auto-detect Swarm mode and show all services/tasks in the dashboard, with all the usual features (port mapping, Traefik integration, update checks, etc.).

> Deploy with:
>
> ```sh
> docker stack deploy -c docker-compose-swarm-socket.yml dockpeek
> ```

</details>

<br>

## FAQ

**Answers to common questions:**

<br>


<details>
<summary><strong>Why do I see "Swarm mode" and no containers?</strong></summary>

> Dockpeek detected that Docker is running in **Swarm mode**, which changes how containers are managed (as "services" instead of standalone containers).  
>
> If you’re **not intentionally using Docker Swarm**, you can safely leave swarm mode with:
>
> ```bash
> docker swarm leave --force
> ```
>
> After running this command, refresh dockpeek — your regular containers should appear again.

</details>

<details>
<summary><strong>How do I search for containers by port?</strong></summary>

> Use the format `:port` in the search box. For example, typing `:8080` will show all containers exposing port 8080.

</details>

<details>
<summary><strong>How do I search for available ports?</strong></summary>

> Use the `:free` search syntax to find the next available port:
>
> - **`:free`** — Returns the next free port after the lowest occupied port  
> - **`:free 3420`** — Returns the next free port starting from port 3420 or higher
>
> The search works per server when a specific server is selected, or across all servers when "All" is selected.  
>
> Click the copy button next to the result to copy the port number to your clipboard.

</details>

<details>
<summary><strong>When does dockpeek use HTTPS automatically?</strong></summary>

> Dockpeek automatically uses HTTPS for:
>
> - Container port `443/tcp`
> - Host ports ending with `443` (e.g., `8443`, `9443`)
> - Ports specified with the `dockpeek.https` label

</details>

<details>
<summary><strong>How do I make container names clickable?</strong></summary>

> Use the `dockpeek.link` label:
>
> ```yaml
> labels:
>   - "dockpeek.link=https://myapp.example.com"
> ```
>
> This is especially useful with reverse proxies to link directly to public addresses.

</details>

<details>
<summary><strong>How can I add ports for containers without port mapping?</strong></summary>

> Some containers (like those using host networking or behind reverse proxies) don't expose ports through Docker's standard port mapping. Use the `dockpeek.ports` label:
>
> ```yaml
> labels:
>   - "dockpeek.ports=8096,8920"
> ```

</details>

<details>
<summary><strong>How does port range grouping work?</strong></summary>

> Dockpeek automatically detects consecutive ports and groups them into ranges for cleaner display:
> - **Input**: 601, 602, 603, 604, 605, 606, 8080, 9000
> - **Output**: 601-606, 8080, 9000
>
> **Disable globally:**
> ```bash
> export PORT_RANGE_GROUPING=false
> ```
>
> **Disable per-container:**
> ```yaml
> labels:
>   - "dockpeek.port-range-grouping=false"
> ```

</details>

<details>
<summary><strong>How do I check updates for pinned versions like 8.2.2-alpine?</strong></summary>

> Use the `UPDATE_FLOATING_TAGS` environment variable:
>
> Available modes:
> - `latest` - always checks the `latest` tag
> - `major` - for `8.2.2` checks `8`
> - `minor` - for `8.2.2` checks `8.2`
> - `disabled` (default) - checks exact tag
>
> ```yaml
> environment:
>   - UPDATE_FLOATING_TAGS=major  # Checks 8-alpine instead of exact 8.2.2-alpine
> ```

</details>

<details>
<summary><strong>How do I enable X-Forwarded-* headers behind a proxy?</strong></summary>

> Enable proxy header support with these environment variables:
>
> ```yaml
> environment:
>   - TRUST_PROXY_HEADERS=true
>   - TRUSTED_PROXY_COUNT=1  # Number of proxies between client and dockpeek
> ```
>
> This allows dockpeek to correctly handle X-Forwarded-* headers (including X-Forwarded-Prefix for subpath deployments) from proxies.

</details>

<details>
<summary><strong>How do I clear the search filter?</strong></summary>

> Click the **dockpeek** title at the top of the page to reset the search and return to the full container view.

</details>

<br>

---

<div align="center">
  <sub>Made with ❤️ for the self-hosted and open-source community</sub>  
  <br>
  <a href="https://github.com/dockpeek/dockpeek/releases">Check releases</a>
</div>
