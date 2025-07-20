# Troubleshooting

## Common issues

### Network request failed / Pairing stuck
- Check your Homey and remote host are on the same network
- Make sure SSH is accessible from Homey
- Try restarting the pairing process

### SSH connection fails
- Double-check the SSH host, port, username, and password
- Make sure the user has rights to run Docker commands
- If sudo is required, configure passwordless sudo for Docker or allow the app to use your SSH password

### No containers found
- Make sure Docker is running on the remote host
- The SSH user must have access to list containers (`docker ps -a`)

### State not updating
- Check the polling interval in the container's settings
- Make sure the container is running and accessible

## Logs
- Use Homey Developer Tools > Apps > Logs to view app logs
- Look for `[PAIR]` or `[ERROR]` messages for pairing and SSH issues

## Still stuck?
- Open an issue on GitHub: [https://github.com/ytapparel/homey-container-manager/issues](https://github.com/ytapparel/homey-container-manager/issues) 