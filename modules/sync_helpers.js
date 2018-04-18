const connect_module = require("./connections");

const {
	execute_remote_command,
	delete_remote_file,
	make_remote_directory,
	delete_remote_directory,
	getRemoteFileTree
} = require('./remote_commands')

const {getAbsoluteRemoteAndLocalPaths, stripRemotePathForDisplay, filterNodeAndGitFiles} = require('./formatting')
const {create_progress, update_progress} = require('./progress');
const {chunk_files, async_for_each} = require('./tools');

const recursive = require("recursive-readdir");
const Promise = require("bluebird");
const streamEqual = require('stream-equal');

const { exec } = require('child_process');
const { createReadStream, existsSync } = require('fs');



/**
 * syncs all files to server
 * @param {object} remote_path
 */
async function sync_objects(all_files_data) {
	return new Promise(async (resolve, reject) => {
		try {
			const result = await sync_chunks(all_files_data, 8, sync_object, 'sync_objects', true);
			await _process_synced_ojects(all_files_data);
			return resolve(result);
		} catch(error){
			return reject(`sync_objects::${error}`); 
		}
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
				console.log(    `${file.action} -> ${stripRemotePathForDisplay(file.remote_path)}`);
			})
		}
	}
}

/**
 * deletes a remote folder or file
 * @param {string} remote_path
 */
async function delete_remote(remote_path){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rf ${remote_path}`);
			return resolve();
		} catch(err){
			return reject(`delete_remote::${err}`);
		}
	});
}

/**
 * syncs an object to the remote server
 * @param {object} file
 * @param {ssh connection} connection
 */
async function sync_object({file, connections, from_name}) {
	switch(file.action){
		case 'change':
		case 'sync':
			return await sync_local_to_remote({file, connections, from_name: `${from_name}::sync_object`});
		case 'unlink':
			return await delete_remote_file(file.remote_path, connections, from_name);
		case 'addDir':
			return await make_remote_directory(file.base_path, connections, from_name);
		case 'unlinkDir':
			return await delete_remote_directory(file.base_path, connections, from_name);
	}
}

/**
 * syncs a file to the remote server
 * @param {object} file
 * @param {ssh connection} connection
 */
async function sync_local_to_remote({file, connections, from_name='sync_file'}){
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		try {
			connections = await connect_module.check_both_connections(connections);
			await make_remote_directory(file.remote_base_path, connections);

			const result = await set_remote_file({
				absolute_remote_path: file.absolute_remote_path, 
				absolute_local_path: file.absolute_local_path, 
				local_base_path: file.local_base_path,
				local_file_path: file.local_file_path, 
				connections, 
				from_name
			});

			return resolve(result);
		} catch(err) {
			if(close_connection) connect_module.close_connections(connections);
			return reject(`sync_file::${err}::${file.local_path}`);
		}
	});
}

/**
 * compares a local and remote file
 * @param {string} absolute_local_path 
 * @param {string} absolute_remote_path 
 * @param {string} connections 
 * @return {boolean} are the files the same?
 */
async function needs_sync({absolute_local_path, absolute_remote_path, connections}){
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		try {
			connections = await connect_module.check_sftp_connection(connections);
			const is_equal = await areFileSteamsEqual({
				connections,
				absoluteLocalPath: absolute_local_path, 
				absoluteRemotePath: absolute_remote_path, 
			});

			if(close_connection) connect_module.close_connections(connections);
			return resolve(!is_equal);

		} catch(err) {
			if(close_connection) connect_module.close_connections(connections);
			return reject(`needs_sync::${err}`);
		}
	});
}

/**
 * upload a repo to the server
 * @param {string} local_path
 * @param {string} remote_base_path
 * @param {string} repo
 */
async function transfer_repo({local_path, remote_base_path, repo}) {
	return new Promise( async (resolve, reject) => {
		try {

			// get local and remote files list
			console.log('Getting local file list...');
			const localFiles = await getLocalFileTree({local_path});
			const filteredLocalFiles = filterNodeAndGitFiles({files:localFiles});
			console.log('Getting remote file list...');
			const remoteFiles = await getRemoteFileTree({path:remote_base_path});

			// console.log('localFiles: ', {remoteFiles,localFiles});

			// format local files then get all remote files that don't exist locally
			const formattedFiles = getAbsoluteRemoteAndLocalPaths({files:filteredLocalFiles, remote_base_path, local_path, repo});
			const absoluteRemoteFiles = formattedFiles.map(file => file.absolute_remote_path);
			const remoteFilesToDelete = remoteFiles.filter(x => !absoluteRemoteFiles.includes(x));

			if(remoteFilesToDelete.length > 0){
				console.log(`Deleting ${remoteFilesToDelete.length} extra remote files...`);
				await bulkDeleteRemoteFiles({remoteFilesToDelete});
			}
			

			// filter out any files that already are synced
			console.log('Comparing files...');
			const filesToSync = await findFilesToSync({formattedFiles});

			// checking if any files need to be synced
			if(filesToSync.length > 0){
				const plural = filesToSync.length === 1 ? '' : 's';
				console.log(`Syncing ${filesToSync.length} file${plural}...`);
				const filed_synced = await sync_objects(filesToSync);
				return resolve(filed_synced);
			} else {
				console.log('All files already synced!');
				return resolve();
			}
			
		} catch(err){
			return reject(`transfer_repo::${err}`);
		}  
	});	
}

/**
 *
 * @param {Array<Object>} formattedFiles
 */
async function findFilesToSync({formattedFiles}){
	let filesToSync = [];
	let processedChunks = 0;

	return new Promise((resolve, reject) => {
		try {
			const fileChunks = chunk_files({files:formattedFiles, number_of_chunks: 8});

			fileChunks.forEach(async chunkOfFiles => {
				let connections = await connect_module.sftp_connection_promise('sync_chunks');

				await async_for_each(chunkOfFiles , async file => {
					const isEqual = await areFileSteamsEqual({
						connections,
						absoluteLocalPath:file.absolute_local_path, 
						absoluteRemotePath:file.absolute_remote_path
					});

					if(!isEqual) filesToSync.push(file);
				});
				
				connect_module.close_connections(connections);
				if(++processedChunks === fileChunks.length){
					return resolve(filesToSync);
				};
			});

		} catch(err){
			return reject(`findFilesToSync::${err}`);
		}
	});
}

/**
 *
 */
async function chunk_operation({files, operation, operationArgs}){
	let filesToSync = [];
	let processedChunks = 0;

	return new Promise((resolve, reject) => {
		try {
			const fileChunks = chunk_files({files, number_of_chunks: 8});

			fileChunks.forEach(async chunkOfFiles => {
				let connections = await connect_module.sftp_connection_promise('chunk_operation');

				await async_for_each(chunkOfFiles , async file => {
					await operation({file, ...operationArgs});
				});
				
				connect_module.close_connections(connections);
				if(++processedChunks === fileChunks.length){
					return resolve(filesToSync);
				};
			});

		} catch(err){
			return reject(`chunk_operation::${err}`);
		}
	});
}

/**
 *
 * @param {Array<string>} remoteFilesToDelete
 */
async function bulkDeleteRemoteFiles({remoteFilesToDelete}){
	let filesToSync = [];
	let processedChunks = 0;

	return new Promise((resolve, reject) => {
		try {
			const fileChunks = chunk_files({files:remoteFilesToDelete, number_of_chunks: 8});

			fileChunks.forEach(async chunkOfFiles => {
				let connections = await connect_module.sftp_connection_promise('bulkDeleteRemoteFiles');

				await async_for_each(chunkOfFiles , async file => {
					await delete_remote_file(file, connection, 'bulkDeleteRemoteFiles');
				});
				
				connect_module.close_connections(connections);
				if(++processedChunks === fileChunks.length){
					return resolve(filesToSync);
				};
			});

		} catch(err){
			return reject(`bulkDeleteRemoteFiles::${err}`);
		}
	});
}

/**
 *
 * @param {string} local_path
 * @param {string} remote_base_path
 * @param {string} repo
 */
async function getLocalFileTree({local_path}){
	return new Promise((resolve, reject) => {
		recursive(local_path, async (err, files) => {
			if(err) return reject(`getLocalFileTree::${err}`);
			return resolve(files);
		});
	})
}

/**
 * takes two file streams and compares them
 */
async function areFileSteamsEqual({absoluteLocalPath, absoluteRemotePath, connections}){
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;

		try {
			connections = await connect_module.check_sftp_connection(connections, 'areFileSteamsEqual');

			const readStreamLocal = createReadStream(absoluteLocalPath);
			const readStreamRemote = connections.sftp_connection.createReadStream(absoluteRemotePath);

			streamEqual(readStreamLocal, readStreamRemote, (err, equal) => {
				if(close_connection) connect_module.close_connections(connections);

				if(err) {
					err = `${err}`;
					if(/No such file/.test(err)) return resolve(false);
					return reject(`areFileSteamsEqual::${err}`);
				}

				return resolve(equal);
			});
		} catch(err){
			if(close_connection) connect_module.close_connections(connections);
			return reject(`areFileSteamsEqual::${err}`)
		}
		
	});
}

/**
 * gets a remote file and syncs it to a local file
 */
async function get_remote_file({absolute_remote_path, absolute_local_path, local_base_path, connections}){
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		try {

			connections = await connect_module.check_sftp_connection(connections, 'get_remote_file');

			connections.sftp_connection.fastGet(absolute_remote_path, absolute_local_path, err => {
				if(err) return reject(`get_remote_file::${err}`);
				if(close_connection) connect_module.close_connections(connections);
				return resolve(`synced ${local_base_path} from remote`);
			});
		} catch(err){
			if(close_connection) connect_module.close_connections(connections);
			return reject(`get_remote_file::${err}`);
		}
	});
}

/**
 * gets a remote file and syncs it to a local file
 */
async function set_remote_file({absolute_remote_path, absolute_local_path, local_base_path, local_file_path, connections, from_name='set_remote_file'}){
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;

		try {
			connections = await connect_module.check_sftp_connection(connections, 'set_remote_file');
			connections.sftp_connection.fastPut(absolute_local_path, absolute_remote_path, err => {
				if(err) return reject(`${from_name}::set_remote_file::fastPut::${err}`);
				if(close_connection) connect_module.close_connections(connections);
				return resolve(`synced ${local_file_path} to remote`);
			});

		} catch(err){
			if(close_connection) connect_module.close_connections(connections);
			return reject(`set_remote_file::${from_name}::${err}`);
		}
	});
}

/**
 * syncs a file from server to host
 * @param {Object} file contains absolute_remote_path, local_file_name, and relative_file_path properties
 * @param {Object} sftp_connection optional connection to use (will create/close its own if not given)
 */
async function sync_remote_to_local({file, connections, from_name=''}) {
	return new Promise(async (resolve, reject) => {
		const {absolute_remote_path, absolute_local_path, local_base_path, remote_base_path} = file;

		let close_connections = !connections;
		connections = await connect_module.check_both_connections(connections, 'sync_remote_to_local');

		try {
			// try to create remote folder/file if doesn't exist
			await execute_remote_command(`mkdir -p ${local_base_path}`, connections, `${from_name}::sync_remote_to_local`, true); 
			await execute_remote_command(`touch ${remote_base_path}`, connections, `${from_name}::sync_remote_to_local`);

			// create local file if doesn't exist
			if (!existsSync(absolute_local_path)) {
				await exec(`touch ${absolute_local_path}`);
			}

			// sync remote to local
			let synced_message = '';
			const need_sync = await needs_sync({absolute_local_path, absolute_remote_path, connections});
			if(need_sync) synced_message = await get_remote_file({absolute_remote_path, absolute_local_path, local_base_path, connections});

			if(close_connections) connect_module.close_connections(connections);
			return resolve(synced_message);

		} catch(err){
			if(close_connections) connect_module.close_connections(connections);
			return reject(`sync_remote_to_local::${err}`);
		}	
	});
}

/**
 * breaks an array of files into chunks and syncs them from remote to local
 * @param {Array<Object>} files
 * @param {number} number_of_chunks
 * @param {Object} sftp_connection
 */
async function sync_chunks(files, number_of_chunks, sync_function, from_name, show_progress=false){
	return new Promise(async (resolve, reject) => {

		try {
			if(show_progress) create_progress(files.length);
			let sync_results = [];
			let files_uploaded = 0;
			let processed_chunks = 0;

			const file_chunks = chunk_files({files, number_of_chunks});
			file_chunks.forEach(async chunk_of_files => {
				let connections = await connect_module.sftp_connection_promise('sync_chunks');

				await async_for_each(chunk_of_files , async file => {
					let message = await sync_function({file, connections, from_name});
					files_uploaded++;
					if(show_progress) update_progress(file.local_file_path || file.local_base_path);
					sync_results.push(message);
				});
				
				connect_module.close_connections(connections);
				if(++processed_chunks === file_chunks.length){
					return resolve(sync_results);
				};
			});

		} catch(err) {
			return reject(`sync_chunks::${err}`);
		}
	});
}

module.exports = {
	sync_objects,
	transfer_repo,
	needs_sync,
	get_remote_file,
	sync_remote_to_local,
	sync_chunks,
	getLocalFileTree
};