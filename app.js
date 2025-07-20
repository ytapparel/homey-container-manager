"use strict";

const Homey = require('homey');

class DockerContainersApp extends Homey.App {

	async onInit() {
		this.log('Docker Containers App is initialized');
		this.homey.flow.getConditionCard('container_status_is').registerRunListener(async (args, state) => {
			const device = args.device;
			if (!device || typeof device.getStatus !== 'function') return false;
			const status = String(await device.getStatus()).trim();
			const tested = Array.isArray(args.status)
				? args.status.map(s => String(s).trim())
				: String(args.status).trim();
			if (Array.isArray(tested)) {
				return tested.includes(status);
			} else {
				return status === tested;
			}
		});
	}
}

module.exports = DockerContainersApp;
