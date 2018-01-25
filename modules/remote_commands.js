const connections_object = require("./connections");
const formatting = require('./formatting');

const Promise = require("bluebird");

// test connection to dev server
execute_remote_command('hostname');

/**
 *  makes directory folder for a given path
 * @param {string} base_path
 * @param {ssh2 connection} connection
 */
async function make_remote_directory(base_path, connection) {
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`mkdir -p ${base_path}`, connection);
		} catch(err){
			return reject(`make_remote_directory::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes directory folder for a given path
 * @param {string} base_path
 * @param {ssh2 connection} connection
 */
async function delete_remote_directory(base_path, connection){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${base_path}`, connection);
		} catch(err){
			return reject(`delete_remote_directory::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes file for a given path
 * @param {string} remote_path
 * @param {ssh2 connection} connection
 */
async function delete_remote_file(remote_path, connection){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm ${remote_path}`, connection);
		} catch(err){
			return reject(`delete_remote_file::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes a repo's remote folder
 * @param {string} repo_path
 * @param {ssh2 connection} connection
 */
async function delete_remote_repo(repo_path, connection) {
	console.log('deleting remote repo folder...');
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${repo_path}`, connection);
		} catch(err){
			return reject(`delete_remote_repo::${err}`);
		}
		return resolve();
	});
}

/**
 * update permissions for all uploaded files
 * @param {Array<object>} uploaded_files
 */
async function update_permissions(uploaded_files) {

	// create command for all files uploaded
	const command = uploaded_files.reduce( (command, uploaded_file) => {
		return `${command}chgrp m5atools ${uploaded_file.remote_path}; chmod 770 ${uploaded_file.remote_path};`
	}, '');

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(command);
			return resolve();
		} catch(err){
			return reject(`update_permissions::${err}`);
		}
	});
}


/**
 * execute a bash command remotely. Prints stdout and stderr to console
 * @param {string} command the bash command to execute on the server
 * @param {object} connection optional ssh2 connection to execute command
 * @returns {Promise<string|null>} returns error string or null on success
 */
async function execute_remote_command(command, connection) {
	let is_temporary_connection = !connection;

	return new Promise(async (resolve, reject) => {
		try {

			// if SSH connection wasn't passed then get a temporary one
			// we will close when this exec is done
			if(is_temporary_connection){
				connection = await connections_object.ssh_connection();
			}

			// execute command on remote server
			connection.exec(command, (err, stream) => {
				if(err) throw new Error(`::exec::${err}`);

				// process exec output
				stream
				.on('data', _log_execute_output)
				.stderr.on('data',  _log_execute_error)
				.on('close', () => {
					if(connection && is_temporary_connection) connection.end();
					return resolve(); 
				});
			});

		} catch(err) {
			if(connection && close_connection) connection.end();
			return reject(`execute_remote_command::${err}`);
		}
	});
}

/**
 *	executes a command on the remote server. Prints stderr/out to console
 * @param {string} command the command string to execute remotely
 * @param {object} connection optional ssh2 connection to execute command
 */
function _execute_command(command, connection){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(command, connection);
			return resolve();
		} catch(err){
			return reject(`execute_command::${err}`)
		}
	});
}

/**
 * logs the formatted data input to the console
 * @param {string} output the output string to format and log 
 */
function _log_execute_output(output){
	output = formatting.format_output(output);
	if(command == 'hostname') console.log('\nConnected with:', output);
	else console.log(output);
}

/**
 * logs the formatted data stderr to the console
 * @param {string} error the error string to format and log
 */
function _log_execute_error(error){
	// on error data received process it - dont show certain errors
	data = formatting.format_output(error).trim();
	if(!data.match(/^-( chmod| bash| : No such| chgrp| cannot|$)/)){
		console.log(data);
	}
}

/**
 * restarts a hypnotoad instance
 * @param {string} remote path to hypnotoad start file
 */
async function restart_hypnotoad(path) {
	return _execute_command(`hypnotoad -s ${path}; hypnotoad ${path}`);
}


/*
 * restarts a user's apache instance
 */
async function restart_apache() {
	return _execute_command(`apache.sh`);
}


module.exports = {
	restart_apache,
	restart_hypnotoad,
	execute_remote_command,
	update_permissions,
	delete_remote_repo,
	delete_remote_file,
	delete_remote_directory,
	make_remote_directory
};
