const connections_object = require("./connections");
const formatting = require('./formatting');
const remote_commands = require('./remote_commands');

const recursive = require("recursive-readdir");
const Promise = require("bluebird");
const path = require('path');
const Gauge = require("gauge");

let gauge_object;
let number_of_files = 0;
let number_files_uploaded = 0;

/**
 * splits an array up into chunks
 * @param {integer} length
 */
Object.defineProperty(Array.prototype, 'chunk', {
	value: function(n) {
    	return Array(Math.ceil(this.length/n))
    	.fill()
    	.map((_,i) => this.slice(i*n,i*n+n));
	}
});

/**
 * resets the gauge animation
 */
async function reset_gauge(){
	if(gauge_object && gauge_object.hide) {
		gauge_object.hide();
	}
}

/**
 * syncs all files to server
 * @param {object} remote_path
 */
async function sync_objects(all_files_data) {

	// make sure all file paths are correct format for Windows/UNIX
	const all_files_data_formatted = formatting.format_files(all_files_data);
	let synced_files_promises = [];

	// set loader configuration
	number_of_files = all_files_data_formatted.length;
	number_files_uploaded = 0;

	gauge_object = new Gauge();

	return new Promise(async (resolve, reject) => {

		// split up array of files into chunks
		let [file_chunks, number_of_chunks, processed_chunks] = _chunk_files(all_files_data_formatted)

		file_chunks.forEach(async file_chunk => {

			let connection;
			try {
				connection = await connections_object.sftp_connection_promise();

				await async_for_each(file_chunk, async file => {
					// if git file then ignore, sync file, update pulse animation
					if(/\.git/.test(file.local_path)) return;
					synced_files_promises.push(await sync_object(connection, file));
					_update_pulse(file);
				});

				// close connections
				connection.ssh_connection.end();
				connection.sftp_connection.end();
				gauge_object.hide();

				// set permissions
				await remote_commands.update_permissions(file_chunk);
				
				// if we have processed all chunks then clean up
				if(++processed_chunks === number_of_chunks){
					_process_synced_ojects(all_files_data);
					gauge_object.hide();
					return resolve();
				};

			} catch(error){
				// close any open connections
				if(connection && connection.ssh_connection) connection.ssh_connection.end();
				if(connection && connection.sftp_connection) connection.sftp_connection.end();

				// hide gauge and return error
				gauge_object.hide();
				return reject(`sync_objects::${error}`); 
			}
		});
	});
}

/**
 * logs files processed
 * @param {object} all_files_data
 */
async function _process_synced_ojects(all_files_data){
	// then log files synced
	if(all_files_data.length > 0) {
		const multiple = all_files_data.length == 1 ? '' : 's';
		console.log(`${all_files_data.length} object${multiple} processed`);

		// if not from a repo sync then show all files synced
		if(all_files_data.length > 0 && !all_files_data[0].sync_repo){
			all_files_data.forEach(file => {
				console.log(    `${file.action} -> ${formatting.stripRemotePathForDisplay(file.remote_path)}`);
			})
		}
	}
}


/**
 * takes an array and breaks it up into an array of arrays
 * @param {object} all_files_data_formatted
 */
function _chunk_files(all_files_data_formatted){

	const chunk_length = parseInt(all_files_data_formatted.length / 8);

	// if we have less then chunk_size then just use one chunk else
	// split up all files to upload multiple files at once
	let file_chunks;
	if(chunk_length == 0){
		file_chunks = [all_files_data_formatted];
	} else {
		file_chunks = all_files_data_formatted.chunk(chunk_length);
	}

	// for keeping track of when we've processed all chunks
	const number_of_chunks = file_chunks.length;

	return [file_chunks, number_of_chunks, 0]
}

/**
 * deletes a remote folder or file
 * @param {string} remote_path
 */
async function delete_remote(remote_path){
	return new Promise(async (resolve, reject) => {
		try {
			await remote_commands.execute_remote_command(`rm -rf ${remote_path}`);
			return resolve();
		} catch(err){
			return reject(`delete_remote::${err}`);
		}
	});
}

/**
 * syncs an object to the remote server
 * @param {ssh connection} connection
 * @param {object} object_data
 */
async function sync_object(connection, object_data) {
	switch(object_data.action){
		case 'change':
		case 'sync':
			return await sync_file(connection, object_data);
		case 'unlink':
			return await remote_commands.delete_remote_file(object_data.remote_path, connection.ssh_connection);
		case 'addDir':
			return await remote_commands.make_remote_directory(object_data.base_path, connection.ssh_connection);
		case 'unlinkDir':
			return await remote_commands.delete_remote_directory(object_data.base_path, connection.ssh_connection);
	}
}

/**
 * syncs a file to the remote server
 * @param {ssh connection} connection
 * @param {object} file_data
 */
async function sync_file(connection, file_data){
	// console.log('file_data: ', file_data);

	// if we are syncing repo make folder first
	await remote_commands.make_remote_directory(file_data.base_path, connection.ssh_connection);

	return new Promise(async (resolve, reject) => {
		connection.sftp_connection.fastPut(file_data.local_path, file_data.remote_path, async err => {
			if(err) return reject(`sync_file::${err}::${file_data.local_path}`);
			return resolve(file_data.remote_path);
		});
	});
}

/**
 * updates pulse animation
 * @param {object} object_data
 */
function _update_pulse(object_data) {
	number_files_uploaded++;
	gauge_object.show(object_data.action, number_files_uploaded/number_of_files);

	const remote_path = formatting.stripRemotePathForDisplay(object_data.remote_path);
	gauge_object.pulse(remote_path);
}

/**
 * upload a repo to the server
 * @param {string} original_local_path
 * @param {string} original_remote_path
 * @param {string} repo
 */
async function transfer_repo(original_local_path, original_remote_path, repo) {

	let local_path_folders = original_local_path.split('/');
	let files_to_upload = [];

	return new Promise( async (resolve, reject) => {

		// get all file path in local folder given
		recursive(original_local_path, async (err, files) => {
			if(err) { return reject(`transfer_repo::recursive::err: ${err}`); }

			console.log(`Syncing ${files.length} files...`);

			try {
				// format local/remote file paths
				const files_to_upload = formatting.transferRepoFormatPaths({
					files, local_path_folders, original_local_path, original_remote_path, repo
				});

				// delete remote repo first then sync files
				await remote_commands.delete_remote_directory(original_remote_path);
				await sync_objects(files_to_upload);
				return resolve();
			} catch(err){
				return reject(`transfer_repo::${err}`);
			}
		});  
	});	
}

/*
*/
async function async_for_each(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array)
	}
}

module.exports = {sync_objects, transfer_repo, async_for_each, reset_gauge};