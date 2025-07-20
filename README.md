# Container Manager for Docker

Easily manage and automate your remote Docker containers from Homey via SSH.

---

## Features

- **Native Homey container integration**: start, stop, reboot, and monitor containers
- **Simple pairing**: SSH connection, sudo detection, container selection
- **Automatic polling**: configurable interval, robust state detection
- **Homey Flow cards**:
  - Actions: Start, Stop, Reboot, Refresh container
  - Condition: Container status is (created, running, paused, etc.)
- **Secure**: SSH credentials stored per container, sudo detection at pairing

---

## Installation & Setup

1. **Install the app on your Homey**
2. **Add a new Docker container**
   - Enter SSH connection details (host, port, user, password)
   - The app will test Docker access and detect if `sudo` is required
   - Select the container to control
   - Optionally set a custom icon
3. **Configure polling interval** (in container settings, default: 300s)

> **Tip:** For best results, add your SSH user to the `docker` group on the remote host, or configure passwordless sudo for Docker commands.

---

## Usage

- **On/Off**: Start or stop the container from Homey or in flows
- **Reboot**: Restart the container and wait for it to be running again
- **Refresh**: Force an immediate state check
- **Status condition**: Use the "Container status is" card in flows to check for states like running, paused, exited, etc.
- **Automatic polling**: The container updates its state at the configured interval

---

## Troubleshooting

- Check the container logs in Homey Developer Tools for SSH or Docker errors
- Ensure your SSH user has the necessary rights to run Docker commands
- If sudo is required, configure passwordless sudo for Docker or add the user to the `docker` group

---

## Contributing

Pull requests and suggestions are welcome! See the code for detailed comments and docstrings.

---

## More information

- [GitHub Pages Documentation](https://ytapparel.github.io/homey-container-manager/)
- [Report issues on GitHub](https://github.com/ytapparel/homey-container-manager/issues)

---

## License

This project is licensed under the MIT License. See `License.md` for details, including icon attributions and third-party notices.

- Not affiliated with or endorsed by Docker Inc. or Athom B.V. (Homey).
- Icon attributions and details are listed in License.md.
