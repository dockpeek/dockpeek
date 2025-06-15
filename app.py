import os
from flask import Flask, render_template, request, jsonify, redirect, url_for
import docker
from flask_cors import CORS
from flask_login import (
    LoginManager, UserMixin, login_user,
    logout_user, login_required, current_user
)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "defaultsecretkey")
DOCKER_SOCKET = os.environ.get("DOCKER_SOCKET", "unix://var/run/docker.sock")

CORS(app)

# Setup Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Dummy user storage using environment variables
ADMIN_USERNAME = os.environ.get("USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("PASSWORD", "password")

users = {
    ADMIN_USERNAME: {"password": ADMIN_PASSWORD}
}

class User(UserMixin):
    def __init__(self, id):
        self.id = id

@login_manager.user_loader
def load_user(user_id):
    return User(user_id)

# Initialize Docker client
try:
    client = docker.DockerClient(base_url=DOCKER_SOCKET)
    client.ping()
    print("Successfully connected to Docker daemon!")
except Exception as e:
    print(f"Error connecting to Docker daemon: {e}")
    client = None

def get_container_data():
    if client is None:
        return []

    containers = client.containers.list(all=True)
    data = []

    for container in containers:
        ports = container.attrs['NetworkSettings']['Ports']
        port_map = []

        if ports:
            for container_port, mappings in ports.items():
                if mappings:
                    m = mappings[0]
                    host_ip = m['HostIp']
                    host_port = m['HostPort']
                    link_ip = request.host.split(":")[0] if host_ip in ['0.0.0.0', '127.0.0.1'] else host_ip
                    link = f"http://{link_ip}:{host_port}"
                    port_map.append({
                        'container_port': container_port,
                        'host_port': host_port,
                        'link': link
                    })

        data.append({
            'name': container.name,
            'id': container.short_id,
            'status': container.status,
            'image': container.image.tags[0] if container.image.tags else "none",
            'ports': port_map
        })

    return data

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
    error = None  # Initialize error variable
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        if username in users and users[username]["password"] == password:
            user = User(username)
            login_user(user)
            return redirect(url_for("index"))
        else:
            error = "Invalid credentials. Please try again." # Set error message in English
    return render_template("login.html", error=error) # Pass error variable to the template

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))

if __name__ == "__main__":
    if not os.path.exists('templates'):
        os.makedirs('templates')
        print("Created 'templates' directory.")
    app.run(host="0.0.0.0", port=8000, debug=True)
