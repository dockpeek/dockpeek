<img src="static\logo_2.svg" alt="dockpeek logo" width="60" height="60" />


# dockpeek

**dockpeek** is a simple tool that shows Docker container ports mapped to host ports.

---

## Features

- Displays Docker container port mappings
- Shows container status
- Search containers by name and image
- Dark mode (night mode) support
- Lightweight and easy to deploy with Docker
- User login support

## Screenshots
<p align="left">
  <img src="dockpeek_night_mode.png" alt="Night mode" width="800" />
</p>

## Installation & Usage

Run dockpeek quickly with Docker Compose using the following configuration:

```yaml
services:
  dockpeek:
    image: ghcr.io/dockpeek/dockpeek:latest
    container_name: dockpeek
    ports:
      - "3420:8000"
    environment:
      - SECRET_KEY=my_secret_key
      - USERNAME=admin # Set username for login
      - PASSWORD=admin # Set password for login
      - DOCKER_SOCKET=unix://var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
