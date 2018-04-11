const connect_module = require("./connections");
const formatting = require('./formatting');
const remote_commands = require('./remote_commands');
const config = require('./../config');

const recursive = require("recursive-readdir");
const Promise = require("bluebird");
const ProgressBar = require('progress');
const streamEqual = require('stream-equal');

const { exec } = require('child_process');
const { createReadStream, existsSync } = require('fs');

let bar_object;

/**
 * splits an array up into chunks
 * @param {integer} length
 * @return {Array<Array<any>>} an array of array chunks
 */
function chunk(arr, n) {
	return Array(Math.ceil(arr.length/n))
		.fill()
		.map((_,i) => arr.slice(i*n,i*n+n));
}

/**
 * creates a gauge animation
 */
function create_progress(number_of_files){
	bar_object = new ProgressBar(':bar :percent :token1', { 
		total: number_of_files,
		clear: true,
		complete: '#',
		width: 20
	});
}

/**
 * updates pulse animation
 * @param {object} object_data
 */
function update_progress(file_name){
	bar_object.tick({token1: file_name});
}

/**
 * syncs all files to server
 * @param {object} remote_path
 */
async function sync_objects(all_files_data) {
	return new Promise(async (resolve, reject) => {
		try {
			const result = await async_sync(all_files_data, 8, sync_object, 'sync_objects');
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
				console.log(    `${file.action} -> ${formatting.stripRemotePathForDisplay(file.remote_path)}`);
			})
		}
	}
}


/**
 * takes an array and breaks it up into an array of arrays
 * @param {object} files
 * @param {number} split_length
 */
function chunk_files(files, split_length=8){

	const chunk_length = parseInt(files.length / split_length);

	// if we have less then chunk_size then just use one chunk else
	// split up all files to upload multiple files at once
	let file_chunks;
	if(chunk_length == 0){
		file_chunks = [files];
	} else {
		file_chunks = chunk(files, chunk_length);
	}

	return [file_chunks, file_chunks.length, 0]
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
 * @param {object} file
 * @param {ssh connection} connection
 */
async function sync_object({file, connections, from_name}) {
	switch(file.action){
		case 'change':
		case 'sync':
			return await sync_local_to_remote({file, connections, from_name: `${from_name}::sync_object`});
		case 'unlink':
			return await remote_commands.delete_remote_file(file.remote_path, connections, from_name);
		case 'addDir':
			return await remote_commands.make_remote_directory(file.base_path, connections, from_name);
		case 'unlinkDir':
			return await remote_commands.delete_remote_directory(file.base_path, connections, from_name);
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
			await remote_commands.make_remote_directory(file.remote_base_path, connections);

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

			let read_stream_local = createReadStream(absolute_local_path);
			let read_stream_remote = connections.sftp_connection.createReadStream(absolute_remote_path);
			const is_equal = await are_streams_equal(read_stream_local, read_stream_remote);

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
			const files_to_upload = await get_local_file_tree({local_path, remote_base_path, repo});
			const filed_synced = await sync_objects(files_to_upload);
			return resolve(filed_synced);

		} catch(err){
			return reject(`transfer_repo::${err}`);
		}  
	});	
}

/**
 *
 * @param {string} local_path
 * @param {string} remote_base_path
 * @param {string} repo
 */
async function get_local_file_tree({local_path, remote_base_path, repo}){
	return new Promise((resolve, reject) => {
		recursive(local_path, async (err, files) => {
			if(err) return reject(`transfer_repo::${err}`);

			const files_to_upload = formatting.getAbsoluteRemoteAndLocalPaths({files, remote_base_path, local_path, repo});
			return resolve(files_to_upload);
		});
	})
}

/**
 * async compatible for each looping
 */
async function async_for_each(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array)
	}
}

/**
 * takes two file streams and compares them
 */
async function are_streams_equal(read_stream_local, read_stream_remote){
	return new Promise(async (resolve, reject) => {
		try {
			streamEqual(read_stream_local, read_stream_remote, (err, equal) => {
				if(err) return reject(`are_streams_equal::${err}`);
				return resolve(equal);	
			});
		} catch(err){
			return reject(`are_streams_equal::${err}`)
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
		const {absolute_remote_path, absolute_local_path, local_base_path} = file;

		let close_connections = !connections;
		connections = await connect_module.check_both_connections(connections, 'sync_remote_to_local');

		try {
			// try to create remote folder/file if doesn't exist
			await remote_commands.execute_remote_command(`mkdir -p ${local_base_path}`, connections, `${from_name}::sync_remote_to_local`); 
			await remote_commands.execute_remote_command(`touch ${absolute_remote_path}`, connections, `${from_name}::sync_remote_to_local`);

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
 * @param {number} chunk_length
 * @param {Object} sftp_connection
 */
async function async_sync(files, chunk_length, sync_function, from_name){
	return new Promise(async (resolve, reject) => {
		let connections = await connect_module.sftp_connection_promise('async_sync');
		let show_progress_bar = files.length && files[0].sync_repo;

		try {
			if(show_progress_bar) create_progress(files.length);
			let sync_results = [];
			let files_uploaded = 0;
			let [file_chunks, number_of_chunks, processed_chunks] = chunk_files(files, 5);

			file_chunks.forEach(async file_chunk => {
				await async_for_each(file_chunk, async file => {
					let message = await sync_function({file, connections, from_name});
					files_uploaded++;
					if(show_progress_bar) update_progress(file.local_file_path);
					sync_results.push(message);
				});

				if(++processed_chunks === number_of_chunks){
					connect_module.close_connections(connections);
					return resolve(sync_results);
				};
			});

		} catch(err) {
			connect_module.close_connections(connections);
			return reject(`async_sync::${err}`);
		}
	});
}

module.exports = {
	sync_objects,
	transfer_repo,
	async_for_each,
	needs_sync,
	get_remote_file,
	chunk_files,
	sync_remote_to_local,
	async_sync,
	get_local_file_tree
};