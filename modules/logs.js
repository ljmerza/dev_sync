const Promise = require("bluebird");
const fs = require('fs');
const streamEqual = require('stream-equal');

const config = require('./../config');
const connections_object = require("./connections");
const remote_commands = require('./remote_commands');

// array of log files -> [remote path, remote log file name, local remote file name]
let log_files = [
	['logs', 'm5_log.log','logs/m5.log'],
	['logs', 'error_log', 'logs/error.log'],
	['logs', 'better_error_log', 'logs/better_error_log'],
	['www/UD_api/log', 'production.log', 'logs/UD_api.log'],
	['www/teamdbapi/logs', 'error.log', 'logs/teamdbapi.log'],
	['www/wam_api/log', 'production.log', 'logs/WAM_api.log'],
	['www/aqe_api/log', 'production.log', 'logs/AQE_api.log'],
	['www/upm_api/log', 'production.log', 'logs/UPM_api.log'],
	['www/utm_api/log', 'production.log', 'logs/UTM_api.log']
];


/*
*	function _sync_logs()
* 		syncs log files from server to host
*/
function _sync_logs(connections) {
	return new Promise( (resolve, reject) => {
		
		let log_promises = [];

		// check for files syncs
		for(let i=0,l=log_files.length;i<l;i++){
			log_promises.push( _sync_a_log(log_files[i], connections) );
		}

		// once all files synced log and close connections
		Promise.all(log_promises)
		.then( message => { 
			return resolve(message);
		})
		.catch( err => {
			return reject(`_sync_logs::${err}`);
		});

	});
}


/*
*	function _sync_a_log(file, connections)
* 		syncs a log file from server to host
*/
function _sync_a_log(file, connections) {

	const sftp_connection = connections.sftp_connection;
	const ssh_connection = connections.ssh_connection;

	return new Promise( (resolve, reject) => {

		const relative_file_path = file[0];
		const remote_file_name = file[1];
		const local_file_name = file[2];
		
		// get local and remote files to compare
		let read_stream_local;
		let read_stream_remote;

		// create remote file if doesn't exist
		remote_commands.execute_remote_command(
			` mkdir -p ${config.remote_base}/${relative_file_path}; touch ${config.remote_base}/${relative_file_path}/${remote_file_name}`
		).then( () => {

			console.log('local_file_name: ', local_file_name);

			try {
				read_stream_local = fs.createReadStream(local_file_name);
				read_stream_remote = sftp_connection.createReadStream(`${config.remote_base}/${relative_file_path}/${remote_file_name}`);
			} catch (err) {
				return reject(`_sync_a_log::${err}`);
			}

			console.log('`${config`: ', `${config.remote_base}/${relative_file_path}/${remote_file_name}`);
			
			// compare files
			streamEqual(read_stream_local, read_stream_remote, (err, equal) => {
				// if error then we most likely don't have the remote file setup yet so create it
				if(err) { return reject(`_sync_a_log::${err}`); }
				console.log('equal: ', equal);
				// if not equal then get remote file and sync to local
				if(!equal){
					sftp_connection.fastGet(`${config.remote_base}/${relative_file_path}/${remote_file_name}`, local_file_name, err => {
						if(err) { return reject(`_sync_a_log::${err}`); }
						return resolve(`updated local log file ${local_file_name}`);
					});
				} else {
					return resolve(`local log file ${local_file_name} already synced`);
				}
			}); // end streamEqual	
		})
		.catch(err => {
			return reject(`_sync_a_log::${err}`);
		});
		
	});
}


/*
*	function syncLogsInterval()
* 		download log files periodically
*/
function syncLogsInterval() {

	let syncing_done = true;

	

	setInterval( () => {
		// if last syncing is done then sync again else do nothing
		if(syncing_done){
			syncing_done = false;

			// create ssh connection
			connections_object.sftp_connection_promise()
			.then( connections => {				
				// sync logs
				_sync_logs(connections)
				// .then (message => console.log(message) )
				.catch ( err => console.log(`syncLogsInterval::${err}`) )
				.finally( () => {
					// when syncing done change syncing flag and close ssh connections
					syncing_done = true;
					connections.ssh_connection.end();
					connections.sftp_connection.end();
				});
			})
			.catch( err => console.log(`syncLogsInterval::${err}`) );
		}
	}, 2000);

}

// start syncing logs
// syncLogsInterval();





/*
*	function reset_logs()
* 		resets logs
*/
function reset_logs() {

	// combine all log file paths into a command
	const command = log_files.map(log_file => `${log_file[0]}/${log_file[1]}`)
	.reduce( (command, dir) => `${command} cat /dev/null > ${config.remote_base}/${dir};`, '');
	
	console.log('reset logs...');

	return new Promise( (resolve, reject) => {
		remote_commands.execute_remote_command(command)
		.then( () => resolve() )
		.catch( err => reject(`reset_logs::${err}`) );
	});
	
}

module.exports = {
	reset_logs
};