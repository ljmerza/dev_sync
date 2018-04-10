const connect_module = require("./connections");
const formatting = require('./formatting');
const remote_commands = require('./remote_commands');
const config = require('./../config');

const recursive = require("recursive-readdir");
const Promise = require("bluebird");
const path = require('path');
const Gauge = require("gauge");
const streamEqual = require('stream-equal');
const fs = require('fs');

let gauge_object;
let number_of_files = 0;
let number_files_uploaded = 0;

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
 * resets the gauge animation
 */
function reset_gauge(){
	if(gauge_object && gauge_object.hide) {
		gauge_object.hide();
	}
}

/**
 * creates a gauge animation
 */
function create_gauge(){
	gauge_object = new Gauge();
}

/**
 * syncs all files to server
 * @param {object} remote_path
 */
async function sync_objects(all_files_data) {
	return new Promise(async (resolve, reject) => {
		try {
			const formatted_files = formatting.format_files(all_files_data);
			create_gauge();

			const result = await async_sync(formatted_files, 8, sync_object, 'sync_objects');
			_process_synced_ojects(all_files_data);

			reset_gauge();
			return resolve();

		} catch(error){
			reset_gauge();
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
async function sync_object(file, connections) {
	switch(file.action){
		case 'change':
		case 'sync':
			return await sync_file(file, connections);
		case 'unlink':
			return await remote_commands.delete_remote_file(file.remote_path, connections);
		case 'addDir':
			return await remote_commands.make_remote_directory(file.base_path, connections);
		case 'unlinkDir':
			return await remote_commands.delete_remote_directory(file.base_path, connections);
	}
}

/**
 * syncs a file to the remote server
 * @param {object} file_data
 * @param {ssh connection} connection
 */
async function sync_file(file_data, connections){
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		try {
			connections = await connect_module.check_both_connections(connections);
			await remote_commands.make_remote_directory(file_data.base_path, connection.ssh_connection);
			connections.sftp_connection.fastPut(file_data.local_path, file_data.remote_path, async err => {
				if(err) return reject(`sync_file::${err}`);
				if(close_connection) connect_module.close_connections(connections);
				return resolve(file_data.remote_path);
			});
		} catch(err) {
			if(close_connection) connect_module.close_connections(connections);
			return reject(`sync_file::${err}::${file_data.local_path}`);
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
async function needs_sync(absolute_local_path, absolute_remote_path, connections){
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		try {
			connections = await connect_module.check_sftp_connection(connections);

			let read_stream_local = fs.createReadStream(absolute_local_path);
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
 * updates pulse animation
 * @param {object} object_data
 */
function _update_pulse(object_data){
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
	return new Promise( async (resolve, reject) => {
		try {
			// get all file path in local folder given
			recursive(original_local_path, async (err, files) => {
				if(err) return reject(`transfer_repo::${err}`);
				console.log(`Syncing ${files.length} files...`);

				let local_path_folders = original_local_path.split('/');
				const files_to_upload = formatting.transferRepoFormatPaths({files, local_path_folders, original_local_path, original_remote_path, repo});

				await remote_commands.delete_remote_directory(original_remote_path);
				await sync_objects(files_to_upload);
				return resolve();
			});
		} catch(err){
			return reject(`transfer_repo::${err}`);
		}  
	});	
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
async function get_remote_file(absolute_remote_path, local_file_name, connections){
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		try {
			connections = await connect_module.check_sftp_connection(connections, 'get_remote_file');

			connections.sftp_connection.fastGet(absolute_remote_path, local_file_name, err => {
				if(err) return reject(`get_remote_file::${err}`);
				if(close_connection) connect_module.close_connections(connections);
				return resolve(`synced ${local_file_name} from remote`);
			});
		} catch(err){
			if(close_connection) connect_module.close_connections(connections);
			return reject(`get_remote_file::${err}`);
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

		try {
			let sync_results = [];
			let [file_chunks, number_of_chunks, processed_chunks] = chunk_files(files, 5);

			file_chunks.forEach(async file_chunk => {
				await async_for_each(file_chunk, async file => {
					let message = await sync_function(file, connections, from_name);
					sync_results.push(message);
				});

				if(++processed_chunks === number_of_chunks){
					connect_module.close_connections(connections);
					return resolve(sync_results);
				};
			});

		} catch(err) {
			console.log('err: ', err);
			connect_module.close_connections(connections);
			return reject(`async_sync::${err}`);
		}
	});
}

function currier(fn) {
	const args = [...args];
	return function(){
		return fn.apply(this, [...args, ...arguments])
	}
}

module.exports = {
	sync_objects,
	transfer_repo,
	async_for_each,
	reset_gauge,
	needs_sync,
	get_remote_file,
	chunk_files,
	async_sync,
	currier
};