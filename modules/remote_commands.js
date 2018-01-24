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

	return new Promise(async (resolve, reject) => {
		// create command for all files uploaded
		const command = uploaded_files.reduce( (command, uploaded_file) => {
			return `${command}chgrp m5atools ${uploaded_file.remote_path}; chmod 770 ${uploaded_file.remote_path};`
		}, '');

		// try to execute command
		try {
			await execute_remote_command(command);
		} catch(err){
			return reject(`update_permissions::${err}`);
		}
		return resolve();
	});
}


/**
 * exec a bash command remotely
 * @param {string} command
 * @param {ssh2 connection} connection
 */
async function execute_remote_command(command, connection) {

	// if given a connection object dont close at the end
	let close_connection = false;

	return new Promise(async (resolve, reject) => {

		try {

			// if SSH connection wasn't passed then get one
			if(!connection){
				connection = await connections_object.ssh_connection_promise();
				close_connection = true;
			}

			// once uploaded array is empty then execute command to reset permissions
			connection.exec(command, (err, stream) => {
				if(err){
					if(connection && close_connection) connection.end();
					return reject(`execute_remote_command::exec::${err}::`); 
				}

				// on data or error event -> format then log stdout from server
				stream.on('data', data => {
					// on data received - process it
					data = formatting.formatServerStdOut(data);
					if(command == 'hostname') console.log('\nConnected with:', data);
					else console.log(data);

				}).stderr.on('data', error => {
					// on error data received process it - dont show certain errors
					data = formatting.formatServerStdOut(error).trim();
					if(!data.match(/^-( chmod| bash| : No such| chgrp| cannot|$)/)){
						console.log(data);
					}

	  			}).on('close', () => { 
	  				// on close disconnect
					if(connection && close_connection) connection.end();
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
 * restarts a repo's hypnotoad
 * @param {string} path
 * @param {string} repo
 */
async function restart_hypnotoad(path, repo) {
	console.log(`restarting ${repo} hypnotoad...`);

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`hypnotoad -s ${path}; hypnotoad ${path}`);
		} catch(err){
			return reject(`restart_hypnotoad::${err}`)
		}
		return resolve();
	});
}


/*
 * restarts a user's apache
 * @param {string} base_path
 * @param {ssh2 connection} connection
 */
async function restart_apache() {
	console.log(`restarting apache...`);

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`apache.sh`);
		} catch(err){
			return reject(`restart_apache::${err}`)
		}
		return resolve();
	});
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
