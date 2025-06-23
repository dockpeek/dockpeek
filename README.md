<a href="https://github.com/dockpeek/dockpeek">
  <img src="static/logo_2.svg" alt="dockpeek logo" width="60" height="60" />
</a>

# dockpeek

**dockpeek** is a lightweight, dashboard for monitoring Docker containers. With an simple UI and built-in authentication, it allows users to inspect container statuses and port mappings securely.

## Features

* **Port Mapping Visibility** — Maps host → container ports with clickable links
* **Container Overview** — Instantly see all running/stopped containers
* **Security-Oriented Design** — Supports `socket-proxy` for read-only Docker access
* **Export Data** — Easily export container information in JSON format
* **Login Authentication** — Simple username/password access
* **Dark Mode Support** — Theme toggle with persistence
## 📸 Screenshots

<p align="left">
  <img src="screenshot.png" alt="Night mode" width="800" />
</p>

## Getting Started

### Deployment Options

###  Option 1: Secure Setup (with `socket-proxy`)

```yaml
services:
  dockpeek:
    image: ghcr.io/dockpeek/dockpeek:latest
    container_name: dockpeek
    environment:
      - SECRET_KEY=my_secret_key   # Set secret key
      - USERNAME=admin             # Change default username
      - PASSWORD=admin             # Change default password
      - DOCKER_HOST=tcp://dockpeek-socket-proxy:2375
    ports:
      - "3420:8000"
    depends_on:
      - dockpeek-socket-proxy
    restart: unless-stopped

  dockpeek-socket-proxy:
    image: lscr.io/linuxserver/socket-proxy:latest
    container_name: dockpeek-socket-proxy
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - PING=1
      - VERSION=1
      - LOG_LEVEL=info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    read_only: true
    tmpfs:
      - /run
    ports:
      - "2375:2375"
    restart: unless-stopped
```

### Option 2: Direct Access (without proxy)

```yaml
services:
  dockpeek:
    image: ghcr.io/dockpeek/dockpeek:latest
    container_name: dockpeek
    environment:
      - SECRET_KEY=my_secret_key   # Set secret key
      - USERNAME=admin             # Change default username
      - PASSWORD=admin             # Change default password
    ports:
      - "3420:8000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```
