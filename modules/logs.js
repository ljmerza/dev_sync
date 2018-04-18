const Promise = require("bluebird");
const fs = require('fs');
const streamEqual = require('stream-equal');

const config = require('./../config');
const remote_commands = require('./remote_commands');
const sync_helpers = require('./sync_helpers');
const formatting = require('./formatting');

// array of log files -> [remote path, remote log file name, local remote file name]
let log_files = [
	['logs', 'm5_log.log','logs/m5.log'],
	['logs', 'error_log', 'logs/error.log'],
	['logs', 'better_error_log', 'logs/better_error_log.log'],
	['logs', 'access_log', 'logs/access_log.log'],
	['www/UD_api/log', 'production.log', 'logs/UD_api.log'],
	['www/teamdbapi/logs', 'error.log', 'logs/teamdbapi.log'],
	['www/wam_api/log', 'production.log', 'logs/WAM_api.log'],
	['www/aqe_api/log', 'production.log', 'logs/AQE_api.log'],
	['www/upm_api/log', 'production.log', 'logs/UPM_api.log'],
	['www/utm_api/log', 'production.log', 'logs/UTM_api.log']
];


/**
 * syncs log files from server to host
 */
async function _sync_logs(log_files) {
	return new Promise( async (resolve, reject) => {
		try {
			const result = await sync_helpers.sync_chunks(log_files, 1, sync_helpers.sync_remote_to_local, '_sync_logs');
			return resolve(result);
		} catch(err){
			return reject(`_sync_logs::${err}`);
		}
	});
}

/**
 * download log files periodically
 */
async function sync_logs_interval() {
	let check_sync = true; // only allow one sync operation at a time
	const formatted_log_files = formatting.formatLogFiles(log_files);

	setInterval(async () => {
		try {
			if(!check_sync) return;

			check_sync = false;
			const messages = await _sync_logs(formatted_log_files);
			check_sync = true;

			// log any sync messages
			messages
				.filter(message => message)
				.forEach(message => console.log(message));

		} catch(err){
			check_sync = true;
			console.log('sync_logs_interval::', err);
		}
	}, 500);
};

/*
*	function reset_logs()
* 		resets logs
*/
async function reset_logs(from_name='reset_logs') {

	// combine all log file paths into a command
	const command = log_files.map(log_file => `${log_file[0]}/${log_file[1]}`)
	.reduce( (command, dir) => `${command} cat /dev/null > ${config.remote_base}/${dir};`, '');
	
	console.log('resetting logs...');

	// try to reset remote logs
	return new Promise(async (resolve, reject) => {
		try {
			await remote_commands.execute_remote_command(command, null, `${from_name}::reset_logs`);
			return resolve('logs reset');
		} catch(err){
			return reject(`reset_logs::${err}`);
		}
	});	
}

module.exports = {reset_logs, sync_logs_interval};