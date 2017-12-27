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
*	function sync_files(all_files_data)
* 		syncs all files to server
*/
async function sync_files(all_files_data) {

	// create new loading screen
	gauge = new Gauge();

	console.log('all_files_data: ', all_files_data);

	// make sure all file paths are correct format for Windows/UNIX
	const all_files_data_formatted = formatting.format_files(all_files_data);
	let synced_files_promises = [];

	// set loader configuration
	number_of_files = all_files_data_formatted.length;
	number_files_uploaded = 0;

	return new Promise(async (resolve, reject) => {

		let connection;
		try {
			await remote_commands.mkdirs(all_files_data_formatted);
			connection = await connections_object.sftp_connection();
			
			// for each file -> sync it
			all_files_data_formatted.forEach( async file => {
				synced_files_promises.push(await sync_file(connection, file));
			});

			// once all files synced close connections and reset file permissions
			await Promise.all(synced_files_promises)
			.then(async files => {

				console.log('files: ', files);

				// hide loading screen
				gauge.hide();

				// close connections
				connection.ssh_connection.close();
				connection.sftp_connection.close();

				// try to update permissions
				try {
					// update file permissions and reset logs
					await remote_commands.update_permissions(all_files_data);
					return resolve(files);
				} catch(err){
					gauge.hide()
					return reject(`sync_files::${err}`);
				}	
			});
		} catch(err){

			// close any open connections
			if(connection.ssh_connection) connection.ssh_connection.close();
			if(connection.sftp_connection) connection.sftp_connection.close();

			// hide gauge and return error
			gauge.hide();
			return reject(`sync_files::${err}`); 
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
*	function sync_file(connection, file_data)
* 		syncs a file to server
*/
async function sync_file(connection, file_data) {
	return new Promise( async (resolve, reject) => {

		console.log('file_data: ', file_data);
		
		// try to syn a file
		try {
			await connection.sftp_connection.fastPut(file_data.local_path, file_data.remote_path)
			number_files_uploaded++;
			gauge.show(`uploaded ${file_data.local_path}`, number_files_uploaded/number_of_files);
			gauge.pulse(file_data.remote_path);
			return resolve(file_data.remote_path);

		} catch(err){

			// if local file doesn't exist then try to delete remote file
			if(err.code == 'ENOENT'){
				try {
					await delete_remote(file_data.remote_path);
				} catch(err){
					return reject(`sync_file::${err}`); 
				}
			} else {
				return reject(`sync_file::${err}`); 
			}
		}
	});
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
			const files_to_upload = files.map( async file => {

				// create local/remote file absolute paths
				let file_remote_path = file.split('\\').splice(local_path_folders.length).join('\\');
				let file_local_path = `${local_path}\\${file_remote_path}`
				file_remote_path = `${remote_path}/${file_remote_path}`;
				let base_path = path.dirname(file_remote_path);

				return {remote_path:file_remote_path, local_path:file_local_path, base_path, repo};
			});

			// delete remote repo first then sync files
			try {
				await remote_commands.delete_remote_repo(remote_path);
				await sync_files(files_to_upload);
				return resolve(`Uploaded ${files_to_upload.length} files for ${repo}`);
			} catch(err){
				return reject(`transfer_repo::${err}`);
			}
		});  
	});	
}

module.exports = {sync_files, transfer_repo};