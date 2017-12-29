const connections_object = require("./connections");
const formatting = require('./formatting');
const remote_commands = require('./remote_commands');

const recursive = require("recursive-readdir");
const Promise = require("bluebird");
const path = require('path');
const Gauge = require("gauge");


let number_of_files = 0;
let number_files_uploaded = 0;
let gauge;

/*
*	function sync_objects(all_files_data)
* 		syncs all files to server
*/
async function sync_objects(all_files_data) {

	// create new loading screen
	gauge = new Gauge();

	// make sure all file paths are correct format for Windows/UNIX
	const all_files_data_formatted = formatting.format_files(all_files_data);
	let synced_files_promises = [];

	// set loader configuration
	number_of_files = all_files_data_formatted.length;
	number_files_uploaded = 0;

	return new Promise(async (resolve, reject) => {

		let connection;
		try {
			connection = await connections_object.sftp_connection_promise();
			// console.log('connection: ', connection);
			
			// for each file -> sync it
			await async_for_each(all_files_data_formatted, file => {
				synced_files_promises.push(sync_object(connection, file));
			});

			console.log('test');

			// once all files synced close connections and reset file permissions
			await Promise.all(synced_files_promises)
			.then(async files => {

				// hide loading screen
				gauge.hide();

				// close connections
				connection.ssh_connection.end();
				connection.sftp_connection.end();

				// try to update permissions
				try {
					// update file permissions and reset logs
					await remote_commands.update_permissions(all_files_data);
					return resolve(files);
				} catch(err){
					gauge.hide()
					return reject(`sync_objects::${err}`);
				}	
			});
		} catch(err){

			// close any open connections
			if(connection.ssh_connection) connection.ssh_connection.end();
			if(connection.sftp_connection) connection.sftp_connection.end();

			// hide gauge and return error
			gauge.hide();
			return reject(`sync_objects::${err}`); 
		}
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
	// console.log('object_data: ', object_data);
	let returned_promise;

	switch(object_data.action){
		case 'change':
			returned_promise = await sync_file(connection, object_data);
			break;
		case 'unlink':
			returned_promise = await remote_commands.delete_remote_file(object_data.remote_path, connection.ssh_connection);
			break;
		case 'addDir':
			returned_promise = await remote_commands.make_remote_directory(object_data.base_path, connection.ssh_connection);
			break;
		case 'unlinkDir':
			returned_promise = await remote_commands.delete_remote_directory(object_data.base_path, connection.ssh_connection);
			break;
	}

	// update loading screen and return promise
	_update_pulse(object_data);
	return returned_promise;
}

/*
*	function sync_file(connection, file_data)
* 		syncs a file to server
*/
async function sync_file(connection, file_data){
	return new Promise(async (resolve, reject) => {
		connection.sftp_connection.fastPut(file_data.local_path, file_data.remote_path, async err => {
			if(err) return reject(`sync_file::${err}`);
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
	gauge.show(`${object_data.action} ${object_data.local_path}`, number_files_uploaded/number_of_files);
	gauge.pulse(object_data.remote_path);
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
		  
			// format local/remote file paths
			const files_to_upload = files.map(file => {

				// create local/remote file absolute paths
				let file_remote_path = file.split('\\').splice(local_path_folders.length).join('\\');
				let file_local_path = `${local_path}\\${file_remote_path}`
				file_remote_path = `${remote_path}/${file_remote_path}`;
				let base_path = path.dirname(file_remote_path);
				return {remote_path:file_remote_path, local_path:file_local_path, base_path, repo};
			});

			// delete remote repo first then sync files
			try {
				await remote_commands.delete_remote_directory(remote_path);
				await sync_objects(files_to_upload);
				return resolve(`Uploaded ${files_to_upload.length} files for ${repo}`);
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