# Installation

## Prerequisites

- Homey (Pro or Cloud)
- A remote host running Docker and accessible via SSH
- SSH credentials (user/password)
- Docker installed and running on the remote host

## Install the App

1. Open the Homey app or Homey Developer web interface
2. Search for "Container Manager for Docker" in the Homey App Store
3. Install the app

## Add a Docker Container

1. In Homey, add a new device and select "Container Manager for Docker"
2. Enter the SSH connection details (host, port, user, password)
3. The app will test Docker access and detect if `sudo` is required
4. Select the container you want to control
5. Optionally, set a custom icon
6. Configure the polling interval (default: 300s)

> **Tip:** For best results, add your SSH user to the `docker` group on the remote host, or configure passwordless sudo for Docker commands.

## Sudo configuration (optional)

If your user needs sudo for Docker, you can:
- Configure passwordless sudo for Docker commands (edit `/etc/sudoers`)
- Or, let the app use your SSH password for sudo (less secure)

---

For troubleshooting, see [Troubleshooting](troubleshooting.md). 