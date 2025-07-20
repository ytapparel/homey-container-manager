# Usage

## Basic actions

- **Start/Stop**: Toggle the container on/off from Homey or in flows
- **Reboot**: Restart the container and wait for it to be running again
- **Refresh**: Force an immediate state check
- **Status condition**: Use the "Container status is" card in flows to check for states like running, paused, exited, etc.
- **Automatic polling**: The container updates its state at the configured interval (default: 300s)

## Homey Flows

- **Actions**: Start, Stop, Reboot, Refresh container
- **Condition**: Container status is (supports multiple states)

## Custom icons

- During pairing, you can upload a custom SVG icon for your container
- You can also select from standard icons

## Settings

- **Polling interval**: Change the refresh interval in the container's device settings
- **SSH/Sudo**: Update SSH credentials or sudo settings if needed

---

For troubleshooting, see [Troubleshooting](troubleshooting.md). 