import os
import re
from flask import Flask, render_template, request, jsonify, redirect, url_for
import docker
from flask_cors import CORS
from flask_login import (
    LoginManager, UserMixin, login_user,
    logout_user, login_required, current_user
)
from werkzeug.security import generate_password_hash, check_password_hash
from urllib.parse import urlparse
from docker.client import DockerClient
from docker.constants import DEFAULT_TIMEOUT_SECONDS

# === Flask Init ===
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "defaultsecretkey")
CORS(app)

# === Flask-Login Init ===
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# === User credentials from environment ===
ADMIN_USERNAME = os.environ.get("USERNAME")
ADMIN_PASSWORD = os.environ.get("PASSWORD")

if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    raise RuntimeError("USERNAME and PASSWORD environment variables must be set.")

# Hashed user storage
users = {
    ADMIN_USERNAME: {
        "password": generate_password_hash(ADMIN_PASSWORD)
    }
}

class User(UserMixin):
    def __init__(self, id):
        self.id = id

@login_manager.user_loader
def load_user(user_id):
    if user_id in users:
        return User(user_id)
    return None

@login_manager.unauthorized_handler
def unauthorized_callback():
    return redirect(url_for('login'))

# === Docker Client Logic ===

DOCKER_TIMEOUT = 1 # Timeout in seconds

def discover_docker_clients():
    """
    Discovers and initializes Docker clients from environment variables.
    This function is called on each data request to ensure the client list is fresh.
    """
    clients = []
    
    # Support for DOCKER_HOST for backward compatibility
    if "DOCKER_HOST" in os.environ:
        host_url = os.environ.get("DOCKER_HOST")
        public_hostname = os.environ.get("DOCKER_HOST_PUBLIC_HOSTNAME")
        try:
            client = DockerClient(base_url=host_url, timeout=DOCKER_TIMEOUT)
            # Perform a quick ping to check connectivity
            client.ping()
            clients.append({"name": "local", "client": client, "url": host_url, "public_hostname": public_hostname})
            print(f"✅ Discovered and connected to default Docker daemon at {host_url}")
        except Exception as e:
            print(f"❌ Error connecting to default Docker daemon at {host_url}: {e}")

    # Discovery of DOCKER_HOST_n_URL and DOCKER_HOST_n_NAME
    host_vars = {k: v for k, v in os.environ.items() if re.match(r"^DOCKER_HOST_\d+_URL$", k)}
    for key, url in host_vars.items():
        match = re.match(r"^DOCKER_HOST_(\d+)_URL$", key)
        if match:
            num = match.group(1)
            name = os.environ.get(f"DOCKER_HOST_{num}_NAME", f"server{num}")
            public_hostname = os.environ.get(f"DOCKER_HOST_{num}_PUBLIC_HOSTNAME")
            try:
                client = DockerClient(base_url=url, timeout=DOCKER_TIMEOUT)
                # Perform a quick ping to check connectivity
                client.ping()
                clients.append({"name": name, "client": client, "url": url, "public_hostname": public_hostname})
                print(f"✅ Discovered and connected to Docker daemon '{name}' at {url}")
            except Exception as e:
                print(f"❌ Error connecting to Docker daemon '{name}' at {url}: {e}")

    # If no hosts are configured via environment variables, try the local socket
    if not clients:
        print("⚠️ No Docker hosts configured via environment variables. Trying local socket...")
        try:
            client = docker.from_env(timeout=DOCKER_TIMEOUT)
            # Perform a quick ping to check connectivity
            client.ping()
            clients.append({"name": "local", "client": client, "url": "unix:///var/run/docker.sock", "public_hostname": "localhost"})
            print("✅ Discovered and connected to local Docker daemon via socket.")
        except Exception as e:
            print(f"❌ Failed to connect to any Docker daemon, including local socket: {e}")
            
    return clients


# === Helpers ===
def get_container_data():
    # ** FIX: Re-discover clients on every data fetch to get the latest list **
    clients = discover_docker_clients()
    
    if not clients:
        return []

    all_data = []
    for host in clients:
        # Wrap the logic for a single host in a try-except block to handle individual failures
        try:
            server_name = host["name"]
            client = host["client"]
            server_url_str = host["url"]
            public_hostname = host["public_hostname"]

            # This will throw a timeout exception if the server is down, which will be caught below
            containers = client.containers.list(all=True)

            for container in containers:
                ports = container.attrs['NetworkSettings']['Ports']
                port_map = []

                if ports:
                    for container_port, mappings in ports.items():
                        if mappings:
                            m = mappings[0]
                            host_port = m['HostPort']
                            
                            if server_name == "local":
                                host_ip = m.get('HostIp', '0.0.0.0')
                                link_ip = request.host.split(":")[0] if host_ip in ['0.0.0.0', '127.0.0.1'] else host_ip
                                link = f"http://{link_ip}:{host_port}"
                            else:
                                link_hostname = "localhost"
                                if public_hostname:
                                    link_hostname = public_hostname
                                else:
                                    parsed_url = urlparse(server_url_str)
                                    if parsed_url.hostname:
                                        link_hostname = parsed_url.hostname
                                link = f"http://{link_hostname}:{host_port}"
                            
                            port_map.append({
                                'container_port': container_port,
                                'host_port': host_port,
                                'link': link
                            })

                all_data.append({
                    'server': server_name,
                    'name': container.name,
                    'id': container.short_id,
                    'status': container.status,
                    'image': container.image.tags[0] if container.image.tags else "none",
                    'ports': port_map
                })
        except Exception as e:
            # If any error occurs with a host, print it and continue to the next one
            print(f"❌ Could not retrieve data from host '{host.get('name', 'unknown')}'. Error: {e}. Skipping.")
            continue

    return all_data

# === Routes ===

@app.route("/")
def index():
    if current_user.is_authenticated:
        return render_template("index.html")
    return redirect(url_for("login"))

@app.route("/data")
@login_required
def data():
    return jsonify(get_container_data())

@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user_record = users.get(username)
        if user_record and check_password_hash(user_record["password"], password):
            login_user(User(username))
            return redirect(url_for("index"))
        else:
            error = "Invalid credentials. Please try again."
    return render_template("login.html", error=error)

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))

# === Entry Point ===
if __name__ == "__main__":
    if not os.path.exists('templates'):
        os.makedirs('templates')
        print("Created 'templates' directory.")
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=8000, debug=debug)
