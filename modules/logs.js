const Promise = require("bluebird");
const fs = require('fs');
const streamEqual = require('stream-equal');

const config = require('./../config');
const connections_object = require("./connections");
const remote_commands = require('./remote_commands');


/*
*	function _sync_logs()
* 		syncs log files from server to host
*/
function _sync_logs(connections) {
	return new Promise( (resolve, reject) => {

		let log_files = [];
		let log_promises = [];

		log_files.push( ['logs', 'm5_log.log','logs/m5.log'] );
		log_files.push( ['logs', 'error_log', 'logs/error.log'] );
		log_files.push( ['www/UD_api/log', 'production.log', 'logs/UD_api.log'] );
		log_files.push( ['www/teamdbapi/logs', 'error.log', 'logs/teamdbapi.log'] );
		log_files.push( ['www/wam_api/log', 'production.log', 'logs/WAM_api.log'] );
		log_files.push( ['www/aqe_api/log', 'production.log', 'logs/AQE_api.log'] );
		log_files.push( ['www/upm_api/log', 'production.log', 'logs/UPM_api.log'] );
		log_files.push( ['www/utm_api/log', 'production.log', 'logs/UTM_api.log'] );	 	
			
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

		try {
			read_stream_local = fs.createReadStream(local_file_name);
			read_stream_remote = sftp_connection.createReadStream(`${config.remote_base}/${relative_file_path}/${remote_file_name}`);
		} catch (err) {
			return reject(`_sync_a_log::${err}`);
		}
		
		// compare files
		streamEqual(read_stream_local, read_stream_remote, (err, equal) => {
			// if error then we most likely don't have the remote file setup yet so create it
			if(err) { 
				// need to implement
				return resolve('File missing.');
			}

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
	});
}


/*
*	function syncLogsInterval()
* 		download log files periodically
*/
function syncLogsInterval() {

	let syncing_done = true;

	// create ssh connection
	connections_object.sftp_connection_promise()
	.then( connections => {

		setInterval( () => {
			// if last syncing is done then sync again else do nothing
			if(syncing_done){
				syncing_done = false;
				
					
					// sync logs
					_sync_logs(connections)
					// .then (message => console.log(message) )
					.catch ( err => console.log(`syncLogsInterval::${err}`) )
					.finally( () => {
						// when syncing done change syncing flag and close ssh connections
						syncing_done = true;
					});
			}
		}, 2000);
	});
}

// start syncing logs
syncLogsInterval();





/*
*	function reset_logs()
* 		resets logs
*/
function reset_logs() {

	// create clear log command
	const command = [
		'logs/m5_log.log', 
		'logs/error_log', 
		'www/wam_api/log/production.log', 
		'www/UD_api/log/production.log', 
		'www/aqe_api/log/production.log', 
		'www/upm_api/log/production.log',
		'www/utm_api/log/production.log'
	]
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