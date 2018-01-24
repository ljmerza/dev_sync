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
const chunk_size = 7;

let ceil = Math.ceil;
Object.defineProperty(Array.prototype, 'chunk', {value: function(n) {
    return Array(ceil(this.length/n)).fill().map((_,i) => this.slice(i*n,i*n+n));
}});

/*
*	function sync_objects(all_files_data)
* 		syncs all files to server
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

		const chunk_length = parseInt(all_files_data_formatted.length / chunk_size);

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
		let processed_chunks = 0;

		file_chunks.forEach(async file_chunk => {

			let connection;
			try {
				connection = await connections_object.sftp_connection_promise();
				// sync files
				await async_for_each(file_chunk, async file => {
					// if git file then ignore
					if(/\.git/.test(file.local_path)) return;
					
					synced_files_promises.push(await sync_object(connection, file));

					// update loading screen and return promise
					_update_pulse(file);
				});

				// close connections
				connection.ssh_connection.end();
				connection.sftp_connection.end();

				// if we have processed all chunks then clean up
				if(++processed_chunks === number_of_chunks){
					gauge_object.hide();
					await remote_commands.update_permissions(all_files_data);

					// then log files synced
					if(all_files_data.length > 0) {
						const multiple = all_files_data.length == 1 ? '' : 's';
						console.log(`${all_files_data.length} object${multiple} processed:`);
						all_files_data.forEach(file => {
							console.log(`	${file.action} -> ${file.remote_path}`);
						})
					}
					return resolve();
				};

			} catch(error){
				// close any open connections
				if(connection.ssh_connection) connection.ssh_connection.end();
				if(connection.sftp_connection) connection.sftp_connection.end();

				// hide gauge and return error
				gauge_object.hide();
				return reject(`sync_objects::${error}`); 
			}
		});
	});
}

/**
*	function delete_remote(remote_path)
*		deletes a remote folder or file
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


/*
*	function sync_object(connection, object_data)
* 		syncs an object to the server
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

/*
*	function sync_file(connection, file_data)
* 		syncs a file to server
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

/*
*	_update_pulse(object_data)
*		updates pulse animation
*/
function _update_pulse(object_data) {
	number_files_uploaded++;
	gauge_object.show(object_data.action, number_files_uploaded/number_of_files);
	gauge_object.pulse(object_data.remote_path);
}


/*
*	function transfer_repo(local_path, remote_path, repo) 
* 		upload a repo to the server
*/
async function transfer_repo(local_path, remote_path, repo) {

	let local_path_folders = local_path.split('/');
	let files_to_upload = [];

	return new Promise( async (resolve, reject) => {

		// get all file path in local folder given
		recursive(local_path, async (err, files) => {
			if(err) { return reject(`transfer_repo::recursive::err: ${err}`); }

			try {
				// format local/remote file paths
				const files_to_upload = formatting.transferRepoFormatPaths({
					files, local_path_folders, local_path, remote_path, repo
				});

				// delete remote repo first then sync files
				await remote_commands.delete_remote_directory(remote_path);
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

module.exports = {sync_objects, transfer_repo, async_for_each};