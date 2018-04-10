const Promise = require("bluebird");
const fs = require('fs');
const streamEqual = require('stream-equal');
const {exec} = require('node-exec-promise');

const config = require('./../config');
const connections = require('./connections');
const remote_commands = require('./remote_commands');
const sync_helpers = require('./sync_helpers');

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


/*
*	function _sync_logs(connections)
* 		syncs log files from server to host
*/
async function _sync_logs(connections) {
	return new Promise( async (resolve, reject) => {
		
		let sync_results = [];

		// check for files syncs
		await sync_helpers.async_for_each(log_files, async log_file => {
			try {
				let message = await _sync_a_log(log_file, connections);
				sync_results.push(message);
			} catch(err){
				return reject(`_sync_logs::${err}`);
			}
		});

		return resolve(sync_results);
	});
}




/*
*	function _sync_a_log(file, connections)
* 		syncs a log file from server to host
*/
async function _sync_a_log(file, connections) {

	const sftp_connection = connections.sftp_connection;
	const ssh_connection = connections.ssh_connection;

	return new Promise( async (resolve, reject) => {

		const relative_file_path = file[0];
		const remote_file_name = file[1];
		const local_file_name = file[2];
		
		// get local and remote files to compare
		let read_stream_local;
		let read_stream_remote;

		try {
			// create remote file if doesn't exist
			await remote_commands.execute_remote_command(`mkdir -p ${config.remote_base}/${relative_file_path}`); 
			await remote_commands.execute_remote_command(`touch ${config.remote_base}/${relative_file_path}/${remote_file_name}`);

			// create local file if doesnt exist
			if (!fs.existsSync(local_file_name)) {
				await exec(`touch ${local_file_name}`);
			}

			// see if we need a log sync
			const absolute_remote_path = `${config.remote_base}/${relative_file_path}/${remote_file_name}`;
			const need_sync = await sync_helpers.compare_files(local_file_name, absolute_remote_path, sftp_connection);

			// if we need a log sync then sync it from remote
			if(need_sync){
				sftp_connection.fastGet(`${config.remote_base}/${relative_file_path}/${remote_file_name}`, local_file_name, err => {
					if(err) { return reject(`_sync_a_log::${err}`); }
					return resolve(`updated local log file ${local_file_name}`);
				});
			}
		}
		catch(err){
			return reject(`_sync_a_log::${err}`);
		}		
	});
}


/*
*	function syncLogsInterval()
* 		download log files periodically
*/
async function sync_logs_interval() {
	let syncing_done = true;

	setInterval( async () => {
		try {
			// console.log('syncing_done: ', syncing_done);
			// if last syncing is done then sync again else do nothing
			if(syncing_done){

				// don't allow any other syncing going on
				syncing_done = false;
				let conns; 

				// try to sync all logs
				try {
					conns = await connections.sftp_connection_promise();
					const messages = await _sync_logs(connections);
					// console.log(messages);
				} catch(err){
					console.log(`syncLogsInterval::${err}`)
				}

				syncing_done = true;
				conns.ssh_connection.end();
				conns.sftp_connection.end();
			}
		} catch(err){
			// always reset sync logs and display message
			syncing_done = true;
			console.log('sync_logs_interval::', err);
		}

	}, 200);
};

/*
*	function reset_logs()
* 		resets logs
*/
async function reset_logs() {

	// combine all log file paths into a command
	const command = log_files.map(log_file => `${log_file[0]}/${log_file[1]}`)
	.reduce( (command, dir) => `${command} cat /dev/null > ${config.remote_base}/${dir};`, '');
	
	console.log('resetting logs...');

	// try to reset remote logs
	return new Promise(async (resolve, reject) => {
		try {
			await remote_commands.execute_remote_command(command);
			return resolve('logs reset');
		} catch(err){
			return reject(`reset_logs::${err}`);
		}
	});	
}

module.exports = {reset_logs, sync_logs_interval};