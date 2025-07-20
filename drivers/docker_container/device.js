'use strict';

const Homey = require('homey');
const fs = require('fs');
const { Client } = require('ssh2');

var devices = {};

class DockerContainerDevice extends Homey.Device {
  async onInit() {
    this.log('Device initialized:', this.getName());
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this._lastState = null;
    this._startPolling();
    this.on('settings', (changedKeys) => {
      if (changedKeys.includes('refresh')) {
        this._startPolling();
      }
    });
  }

  _startPolling() {
    if (this._pollingInterval) clearTimeout(this._pollingInterval);
    const poll = async () => {
      let refresh = this.getSetting('refresh') || 300;
      if (refresh <= 0) {
        this.log('Polling disabled (refresh <= 0)');
        return;
      }
      if (refresh > 0 && refresh < 30) {
        this.log('Refresh too low, forced to 30 seconds');
        refresh = 30;
      }
      await this._pollContainerState();
      this._pollingInterval = setTimeout(poll, refresh * 1000);
    };
    poll();
  }

  async _pollContainerState() {
    const containerId = this.getData().containerId;
    if (!containerId) {
      this.log('[POLL] No container ID available, cannot poll state');
      return false;
    }
    try {
      // Get full container state as JSON
      const output = await this._execDockerCommand(`docker inspect ${containerId}`, true);
      let stateString = 'unknown';
      let running = false;
      try {
        const inspect = JSON.parse(output)[0];
        stateString = inspect.State.Status || 'unknown';
        running = inspect.State.Running === true;
      } catch (e) {
        // Fallback: try to parse as string (legacy)
        running = parseDockerRunningStatus(output);
        stateString = running ? 'running' : 'exited';
      }
      // Update both onoff and container_state capabilities
      await this.setSettings({ state: running });
      this.setCapabilityValue('onoff', running)
        .catch(err => this.log(`[POLL][ERROR] setCapabilityValue('onoff', ${running}) failed:`, err));
      // Update custom sensor capability with textual state
      this.setCapabilityValue('container_state', stateString).catch(() => {});
      if (this._lastState !== null && this._lastState !== running) {
        // Trigger Homey flow if container state changed (supprimé car carte non déclarée)
      }
      this._lastState = running;
      return running;
    } catch (err) {
      this.log('[POLL][ERROR] Polling SSH error:', err);
      return false;
    }
  }

  async onCapabilityOnoff(value, opts) {
    // Called when user toggles the onoff capability (start/stop container)
    const containerId = this.getData().containerId;
    if (!containerId) {
      // No container ID, cannot perform action
      throw new Error('containerId missing');
    }
    const baseCmd = value ? 'start' : 'stop';
    const command = `docker ${baseCmd} ${containerId}`;
    const targetState = value;
    const timeout = Math.floor((this.getSetting('refresh') || 300) / 2);
    return this._waitForState(command, targetState, timeout, true, containerId)
      .then((finalState) => {
        // Update capability and trigger flow if state changed
        if (this._lastState !== finalState) {
          this.setCapabilityValue('onoff', finalState).catch(() => {});
          // Trigger Homey flow if state changed (supprimé car carte non déclarée)
        }
        if (finalState === targetState) {
          return true;
        } else {
          throw new Error("Container state could not be changed");
        }
      })
      .catch(err => {
        this.log('SSH error:', err);
        throw new Error('SSH error: ' + err);
      });
  }

  async rebootContainer() {
    // Called to restart the container
    const containerId = this.getData().containerId;
    if (!containerId) {
      // No container ID, cannot perform reboot
      throw new Error('containerId missing');
    }
    const command = `docker restart ${containerId}`;
    const timeout = Math.floor((this.getSetting('refresh') || 300) / 2);
    return this._waitForState(command, true, timeout, true, containerId, true)
      .then((finalState) => {
        // Update capability and trigger flow if state changed
        if (this._lastState !== finalState) {
          this.setCapabilityValue('onoff', finalState).catch(() => {});
          // Trigger Homey flow if state changed (supprimé car carte non déclarée)
        }
        if (finalState === true) {
          return true;
        } else {
          throw new Error("Container did not restart correctly");
        }
      })
      .catch(err => {
        this.log('SSH error:', err);
        throw new Error('SSH error: ' + err);
      });
  }

  _waitForState(command, targetState, timeout, useSudo, containerId, isReboot = false) {
    // Waits for the container to reach the desired state after executing a command
    const effectiveTimeout = Math.max(timeout, 120);
    return new Promise((resolve, reject) => {
      let done = false;
      let elapsed = 0;
      const pollInterval = 2000;
      const maxTime = effectiveTimeout * 1000;
      const pollState = async () => {
        try {
          const output = await this._execDockerCommand(`docker inspect -f '{{.State.Running}}' ${containerId}`, true);
          const running = parseDockerRunningStatus(output);
          if (isReboot) {
            // For reboot, resolve as soon as running=true
            if (running === true) {
              return resolve(true);
            }
          } else {
            // For start/stop, resolve when target state is reached
            if (running === targetState) {
              return resolve(running);
          }
        }
          elapsed += pollInterval;
          if (elapsed >= maxTime) {
            // Timeout reached, return last known state
            return resolve(running);
          }
          setTimeout(pollState, pollInterval);
        } catch (err) {
          this.log('SSH polling error:', err);
          return reject(err);
        }
      };
      // Execute the main Docker command (start/stop/restart)
      this._execDockerCommand(command, useSudo)
        .then(() => {
          // Wait 5s before polling state to allow command to take effect
          setTimeout(pollState, 5000);
        })
        .catch(err => {
          this.log('SSH action error:', err);
          reject(err);
        });
    });
  }

  async _execDockerCommand(command, useSudo = false) {
    // Builds and executes a Docker command over SSH, with optional sudo
    const ssh = this.getData().ssh || this.getSetting('ssh');
    const forceSudoPassword = this.getData().forceSudoPassword || false;
    let fullCommand = command;
    if (useSudo) {
      if (forceSudoPassword) {
        // Use password-based sudo if required
        fullCommand = `echo '${ssh.password}' | sudo -S ${command}`;
      } else {
        fullCommand = `sudo ${command}`;
      }
    }
    return this._execSSH(fullCommand, ssh);
  }

  _execSSH(command, ssh) {
    // Executes a shell command over SSH and returns the output
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const fullCommand = `export PATH=$PATH:/usr/bin:/usr/local/bin && ${command}`;
      conn.on('ready', () => {
        // SSH connection established, execute command
        conn.exec(fullCommand, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          let output = '';
          stream.on('data', data => { output += data.toString(); });
          stream.stderr.on('data', data => { output += data.toString(); });
          stream.on('close', () => {
            // Command execution finished, return output
            conn.end();
            resolve(output);
          });
        });
      }).on('error', err => {
        // SSH connection error
        reject(err);
      }).connect({
        host: ssh.host,
        port: ssh.port,
        username: ssh.user,
        password: ssh.password
      });
    });
  }

  async getStatus() {
    const containerId = this.getData().containerId;
    if (!containerId) return null;
    try {
      const output = await this._execDockerCommand(`docker inspect -f '{{.State.Status}}' ${containerId}`, true);
      const status = output ? output.trim() : null;
      await this.setSettings({ state: status });
      return status;
    } catch (e) {
      this.log('getStatus error:', e);
      return null;
    }
  }

  onDeleted() {
    if (this._pollingInterval) clearInterval(this._pollingInterval);
  }
}

function removeIcon(iconpath) {
  console.log("removeIcon( " + iconpath + " )");
  return new Promise((resolve, reject) => {
    try {
      if (fs.existsSync(iconpath)) {
        fs.unlinkSync(iconpath);
        return resolve(true);
      } else {
        return resolve(true);
      }
    } catch (error) {
      return reject(error);
    }
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse the output of docker inspect -f '{{.State.Running}}'
function parseDockerRunningStatus(output) {
  return output.trim() === 'true';
}

module.exports = DockerContainerDevice;
