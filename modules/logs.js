const Promise = require("bluebird");
const fs = require('fs');
const streamEqual = require('stream-equal');

const config = require('./../config');
const {executeRemoteCommand} = require('./remoteCommands');
const {syncChunks, syncRemoteToLocal} = require('./syncHelpers');
const {formatLogFiles} = require('./formatting');


/**
 * syncs log files from server to host
 */
async function syncLogs(logFiles) {
	return new Promise( async (resolve, reject) => {
		try {
			const result = await syncChunks(logFiles, 1, syncRemoteToLocal, 'syncLogs');
			return resolve(result);
		} catch(err){
			return reject(`syncLogs::${err}`);
		}
	});
}

/**
 * download log files periodically
 */
async function syncLogsInterval() {
	let checkSync = true; // only allow one sync operation at a time
	const formattedLogFiles = formatLogFiles(config.logFiles);

	setInterval(async () => {
		try {
			if(!checkSync) return;

			checkSync = false;
			const messages = await syncLogs(formattedLogFiles);
			checkSync = true;

			// log any sync messages
			messages
				.filter(message => message)
				.forEach(message => console.log(message));

		} catch(err){
			checkSync = true;
			console.log('syncLogsInterval::', err);
		}
	}, 500);
};

/**
 * resets all logs
 */
async function resetLogs(fromName='resetLogs') {

	// combine all log file paths into a command
	const command = config.logFiles.map(logFile => `${logFile[0]}/${logFile[1]}`)
	.reduce( (command, dir) => `${command} cat /dev/null > ${config.remoteBase}/${dir};`, '');
	
	console.log('resetting logs...');

	// try to reset remote logs
	return new Promise(async (resolve, reject) => {
		try {
			await executeRemoteCommand(command, null, `${fromName}::resetLogs`);
			return resolve('logs reset');
		} catch(err){
			return reject(`resetLogs::${err}`);
		}
	});	
}

module.exports = {syncLogs, syncLogsInterval, resetLogs};