const Promise = require("bluebird");
const fs = require('fs');
const streamEqual = require('stream-equal');

const config = require('./../config');
const connections_object = require("./connections");
const remote_commands = require('./remote_commands');

// array of log files -> [remote path, remote log file name, local remote file name]
let log_files = [
	['logs', 'm5_log.log','logs/m5.log'],
	// ['logs', 'error_log', 'logs/error.log'],
	// ['logs', 'better_error_log', 'logs/better_error_log'],
	// ['www/UD_api/log', 'production.log', 'logs/UD_api.log'],
	// ['www/teamdbapi/logs', 'error.log', 'logs/teamdbapi.log'],
	// ['www/wam_api/log', 'production.log', 'logs/WAM_api.log'],
	// ['www/aqe_api/log', 'production.log', 'logs/AQE_api.log'],
	// ['www/upm_api/log', 'production.log', 'logs/UPM_api.log'],
	// ['www/utm_api/log', 'production.log', 'logs/UTM_api.log']
];


/*
*	function _sync_logs(connections)
* 		syncs log files from server to host
*/
async function _sync_logs(connections) {
	return new Promise( async (resolve, reject) => {
		
		let sync_results = [];

		// check for files syncs
		log_files.forEach(async log_file => {
			try {
				let message = await _sync_a_log(log_file, connections);
				console.log('message: ', message);
				sync_results.push(message);
			} catch(err){
				reject(`_sync_logs::${err}`);
			}
		});

		console.log('sync_results: ', sync_results);

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

			console.log('test: ', relative_file_path);
			// create local file if doesnt exist
			await remote_commands.execute_command(`touch ../${local_file_name}`);

			// try to create read/write streams for local/remote files
			try {
				read_stream_local = fs.createReadStream(local_file_name);
				read_stream_remote = sftp_connection.createReadStream(`${config.remote_base}/${relative_file_path}/${remote_file_name}`);
			} catch(err) {
				return reject(`_sync_a_log::${err}`);
			}
			
			// compare files to see if we need to sync them
			streamEqual(read_stream_local, read_stream_remote, async (err, equal) => {
				if(err) { return reject(`_sync_a_log::${err}`); }
				
				// if not equal then get remote file and sync to local
				if(!equal){

					// try to sync log file
					try {
					 	await sftp_connection.fastGet(`${config.remote_base}/${relative_file_path}/${remote_file_name}`, local_file_name)
					} catch(err){
						return reject(`_sync_a_log::${err}`)
					}
					return resolve(`updated local log file ${local_file_name}`);
				} else {
					return resolve(`local log file ${local_file_name} already synced`);
				}
			});	
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
(async function syncLogsInterval() {
	let syncing_done = true;

	setInterval( async () => {

		// if last syncing is done then sync again else do nothing
		if(syncing_done){

			// don't allow any other syncing going on
			syncing_done = false;

			// create ssh connection
			const connections = await connections_object.sftp_connection()

			// try to sync all logs
			try {
				const messages = await _sync_logs(connections);
				console.log('messages: ', messages);
			} catch(err){
				console.log(`syncLogsInterval::${err}`)
			}

			syncing_done = true;
			connections.ssh_connection.close();
			connections.sftp_connection.close();
		}
		
	}, 2000);
})();

/*
*	function reset_logs()
* 		resets logs
*/
async function reset_logs() {

	// combine all log file paths into a command
	const command = log_files.map(log_file => `${log_file[0]}/${log_file[1]}`)
	.reduce( (command, dir) => `${command} cat /dev/null > ${config.remote_base}/${dir};`, '');

	console.log('command: ', command);
	
	console.log('resetting logs...');

	// try to reset remote logs
	return new Promise(async (resolve, reject) => {
		try {
			await remote_commands.execute_remote_command(command);
			return resolve();
		} catch(err){
			return reject(`reset_logs::${err}`);
		}
	});	
}

module.exports = {reset_logs};