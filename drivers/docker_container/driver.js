'use strict';

const Homey = require('homey');
const fs = require('fs');
const DRIVER_LOCATION = "/app/io.ytapparel.container/drivers/docker_container/";
const { Client } = require('ssh2');
const path = require('path');

class VirtualDriver extends Homey.Driver {
  onInit() {
		// Log only driver initialization (for debug)
		this.log('Initialized driver for Docker Containers');
    // Actions
    this.homey.flow.getActionCard('reboot_container').registerRunListener(async (args, state) => {
      if (!args.device) throw new Error('Aucun device sélectionné');
      return args.device.rebootContainer();
    });
    this.homey.flow.getActionCard('refresh_container_state').registerRunListener(async (args, state) => {
      if (!args.device) throw new Error('Aucun device sélectionné');
      try {
        const running = await args.device._pollContainerState();
        await args.device.setSettings({ state: running });
        return running;
      } catch (err) {
        this.log('[FLOW][ERROR] refresh_container_state failed:', err);
        throw err;
      }
    });
  }

  /**
   * Handles the Homey pairing process for the Docker container driver (SDK v3).
   * Manages SSH connection, Docker access test, container selection, and sudo detection.
   * @param {object} session - The Homey pairing session (SDK v3).
   */
  async onPair(session) {
    this.homey.log('[PAIR] Pairing session started');
    // Persistent pairing device object for the session
    let pairingDevice = {
      name: this.homey.__('pair.default.name.device'),
      settings: {
        refresh: 300 // Default value in seconds
      },
      data: {
        id: guid(),
        version: 3
      },
      capabilities: [],
      capabilitiesOptions: {}
    };

    // Handler for logging (debug)
    session.setHandler('log', async (data) => {
      return 'ok';
    });

    // Handler for setting SSH configuration
    session.setHandler('setSSH', async (data) => {
      const safeData = { ...data, password: data.password ? '***' : undefined };
      this.homey.log('[PAIR] setSSH called', safeData);
      pairingDevice.ssh = { ...data };
      if (!pairingDevice.data) pairingDevice.data = {};
      pairingDevice.data.ssh = { ...data };
      pairingDevice.data.forceSudoPassword = !!data.forceSudoPassword;
      return pairingDevice;
    });

    // Handler for retrieving Docker containers via SSH
    session.setHandler('getDockerContainers', async (data) => {
      this.homey.log('[PAIR] getDockerContainers called');
      if (!pairingDevice.ssh) {ajou
        this.homey.log('[PAIR][ERROR] SSH info missing');
        throw new Error('SSH info missing');
      }
      const conn = new Client();
      let containers = [];
      let errorReturned = false;
      // Get already paired containers (by id)
      const devices = await this.getDevices();
      const used = Object.values(devices)
        .map(d => {
          let data = typeof d.getData === 'function' ? d.getData() : d.data;
          return {
            id: data && data.containerId,
            name: data && (data.containerName || d.name)
          };
        })
        .filter(d => d.id);
      const usedIds = used.map(u => u.id);
      // Helper to execute a Docker command over SSH
      function tryDockerCommand(command, onDone) {
        const fullCommand = `export PATH=$PATH:/usr/bin:/usr/local/bin && ${command}`;
        conn.exec(fullCommand, function(err, stream) {
          if (err) {
            const msg = `[PAIR][ERROR] Docker command failed (${fullCommand}): ${err.message}`;
            onDone(msg, null);
            return;
          }
          let output = '';
          stream.on('data', function(data) { output += data.toString(); });
          stream.stderr.on('data', function(data) { output += data.toString(); });
          stream.on('close', function() { onDone(null, output); });
        });
      }
      // Return a promise for SSH connection and container listing
      return new Promise((resolve, reject) => {
        conn.on('ready', () => {
          this.homey.log('[PAIR] SSH connection established');
          // SSH connection established, list containers
          const dockerFormat = '--format "{{.ID}}\t{{.Names}}"';
          tryDockerCommand(`docker ps -a ${dockerFormat}`, (err, output) => {
            if (err || !output || /permission denied|Got permission denied|not found|error/i.test(output)) {
              // Retry with sudo if permission denied
              tryDockerCommand(`sudo docker ps -a ${dockerFormat}`, (err2, output2) => {
                if (err2 || !output2 || /not found|error|a terminal is required|a password is required/i.test(output2)) {
                  const msg = `[PAIR][ERROR] Docker command (sudo) failed: ${err2 ? err2 : output2}`;
                  this.homey.log(msg); // Log SSH error
                  if (!errorReturned) reject(new Error(msg));
                  errorReturned = true;
                  conn.end();
                  return;
                }
                // Parse and filter containers
                containers = output2.split('\n').filter(Boolean).map(line => {
                  const [id, name] = line.split('\t');
                  return { id, name };
                });
                containers = containers.filter(c => !usedIds.includes(c.id));
                if (!pairingDevice.data) pairingDevice.data = {};
                pairingDevice.data.sudo = true;
                resolve(containers);
                conn.end();
              });
            } else {
              // Parse and filter containers (no sudo needed)
              containers = output.split('\n').filter(Boolean).map(line => {
                const [id, name] = line.split('\t');
                return { id, name };
              });
              containers = containers.filter(c => !usedIds.includes(c.id));
              if (!pairingDevice.data) pairingDevice.data = {};
              pairingDevice.data.sudo = false;
              resolve(containers);
              conn.end();
            }
          });
        }).on('error', (err) => {
          // Log SSH connection error
          const msg = `[PAIR][ERROR] SSH connection error: ${err.message}`;
          this.homey.log(msg);
          if (!errorReturned) reject(new Error(msg));
          errorReturned = true;
        }).connect({
          host: pairingDevice.ssh.host,
          port: pairingDevice.ssh.port,
          username: pairingDevice.ssh.user,
          password: pairingDevice.ssh.password
        });
      });
    });

    // Handler for selecting a Docker container
    session.setHandler('setDockerContainer', async (data) => {
      this.homey.log(`[PAIR] setDockerContainer: name=${data.name}, id=${data.id}`);
      pairingDevice.selectedContainer = data.id;
      pairingDevice.name = data.name; // Update device name with selected container name
      pairingDevice.capabilities = ['onoff', 'container_state']; // Add required capabilities
      pairingDevice.data = pairingDevice.data || {};
      pairingDevice.data.containerId = data.id; // Persist selected container id
      return pairingDevice;
    });

    // Handler for retrieving available icons
    session.setHandler('getIcons', async () => {
      return [
        { name: 'container', location: 'container.svg' },
      ];
    });

    // Handler for setting the selected icon
    session.setHandler('setIcon', async (data) => {
      // Store selected icon for the device
      pairingDevice.data = pairingDevice.data || {};
      pairingDevice.data.icon = data.icon.location;
      pairingDevice.icon = data.icon.location;
      return pairingDevice;
    });

    // Handler for saving a custom icon (base64)
    session.setHandler('saveIcon', async (imgBase64) => {
      const iconFileName = pairingDevice.data.id + '.svg';
      const iconRelativePath = '../../../userdata/' + iconFileName;
      const iconFullPath = path.join(this.homey.homeyDir || process.cwd(), 'userdata', iconFileName);
      try {
        const fs = require('fs');
        const pathMod = require('path');
        fs.mkdirSync(pathMod.dirname(iconFullPath), { recursive: true });
        const base64 = imgBase64.replace(/^data:image\/svg\+xml;base64,/, '');
        fs.writeFileSync(iconFullPath, base64, 'base64');
        pairingDevice.data.icon = iconRelativePath;
        pairingDevice.icon = iconRelativePath;
        return pairingDevice;
      } catch (error) {
        throw new Error('Failed to save custom icon: ' + error.message);
      }
    });

    // Handler for getPairingDevice (used by the frontend pairing)
    session.setHandler('getPairingDevice', async () => {
      return {
        name: pairingDevice.name || 'Docker Container',
        data: pairingDevice.data,
        capabilities: ['onoff', 'container_state'], // Explicitly force capabilities
        icon: pairingDevice.icon,
        settings: pairingDevice.settings || {},
      };
    });

    // Handler for list_devices (final step of pairing)
    session.setHandler('list_devices', async () => {
      // Finalize pairing and return the device object to Homey
      if (pairingDevice.ssh) {
        if (!pairingDevice.data) pairingDevice.data = {};
        pairingDevice.data.ssh = pairingDevice.ssh;
      }
      return [{
        name: pairingDevice.name || 'Docker Container',
        data: pairingDevice.data,
        capabilities: ['onoff', 'container_state'], // Explicitly force capabilities
        icon: pairingDevice.icon,
        settings: pairingDevice.settings || {},
      }];
    });
  }

  registerFlowCardAction_sensor(card_name) {
    this.homey.flow.getActionCard(card_name)
      .registerRunListener(( args, state ) => {
        try {
          this.log('args: ' + simpleStringify(args) );
          let device = validateItem('device', args.device);
          let sensor = validateItem('sensor', args.sensor);
          let value  = validateItem('value',  args.value );

          this.log(device.getName() + ' -> Sensor: ' + sensor);

          var valueToSet;
          if( isNaN(value) ) {
            if ( value.toLowerCase() === 'true' ) {
              valueToSet = true;
            } else if ( value.toLowerCase() === 'false' ) {
              valueToSet = false;
            } else {
              valueToSet = value;
            }
          } else {
            valueToSet = parseFloat(value, 10);
          }

          this.log(device.getName() + ' -> Value:  ' + valueToSet);
          return device.setCapabilityValue(sensor, valueToSet) 
        }
        catch(error) {
          this.log('Device triggered with missing information: ' + error.message)
          this.log('args: ' + simpleStringify(args) );
          return Promise.reject(error);
        }
      })
  }
}

module.exports = VirtualDriver;

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function getIconNameAndLocation( name ) {
	return {
		"name": name,
		"location": name + ".svg"
	}
};

function listFiles( path ) {
  console.log("listFiles: ");
  return new Promise((resolve, reject) => {
    try {
      fs.readdirSync(path).forEach(file => {
        console.log(file);
      });
    } catch (error) {
      return reject(error);
    }
  })
}

function uploadIcon(img, id) {
  return new Promise((resolve, reject) => {
    try {
      const path = "../userdata/"+ id +".svg";
      const base64 = img.replace("data:image/svg+xml;base64,", '');
      fs.writeFile(path, base64, 'base64', (error) => {
        if (error) {
          return reject(error);
        } else {
          return resolve(true);
        }
      });
    } catch (error) {
      return reject(error);
    }
  })
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


function validateItem(item, value) {
  if (typeof(value) == 'undefined' || value == null ) {
    throw new ReferenceError( item + ' is null or undefined' );
  }
  return value;
}

function simpleStringify (object) {
    var simpleObject = cleanJson(object);
    return JSON.stringify(simpleObject);
};

function cleanJson (object){
  var simpleObject = {};
  for (var prop in object ){
      if (!object.hasOwnProperty(prop)){
          continue;
      }
      if (typeof(object[prop]) == 'object'){
          continue;
      }
      if (typeof(object[prop]) == 'function'){
          continue;
      }
      simpleObject[prop] = object[prop];
  }
  return simpleObject; // returns cleaned up Object
};
