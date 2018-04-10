const connect_module = require("./connections");
const formatting = require('./formatting');

const Promise = require("bluebird");

// test connection to dev server
execute_remote_command('hostname', null, 'hostname');

/**
 *  makes directory folder for a given path
 * @param {string} base_path
 * @param {ssh2 connection} connection
 */
async function make_remote_directory(base_path, ssh_connection, from_name) {
	return new Promise(async (resolve, reject) => {
		try {
			ssh_connection = await connect_module.check_ssh_connection(ssh_connection, `${from_name}::make_remote_directory`);
			await execute_remote_command(`mkdir -p ${base_path}`, ssh_connection, `${from_name}::make_remote_directory`);
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
async function delete_remote_directory(base_path, connection, from_name){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${base_path}`, connection, `${from_name}::delete_remote_directory`);
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
async function delete_remote_file(remote_path, connection, from_name){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm ${remote_path}`, connection, `${from_name}::delete_remote_file`);
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
async function delete_remote_repo(repo_path, connection, from_name) {
	console.log('deleting remote repo folder...');
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${repo_path}`, connection, `${from_name}::delete_remote_repo`);
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
async function update_permissions(uploaded_files, from_name) {

	return new Promise(async (resolve, reject) => {
		// create command for all files uploaded
		const command = uploaded_files.reduce( (command, uploaded_file) => {
			return `${command}chgrp m5atools ${uploaded_file.remote_path}; chmod 770 ${uploaded_file.remote_path};`
		}, '');

		// try to execute command
		try {
			await execute_remote_command(command, null, `${from_name}::update_permissions`);
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
async function execute_remote_command(command, connections, from_name='execute_remote_command') {
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		connections = await connect_module.check_ssh_connection(connections, `${from_name}::execute_remote_command`);


		try {
			// once uploaded array is empty then execute command to reset permissions
			connections.ssh_connection.exec(command, (err, stream) => {
				if(err) return reject(`execute_remote_command::${err}`);

				// on data or error event -> format then log stdout from server
				stream.on('data', data => {
					// on data received - process it
					data = formatting.formatServerStdOut(data);
					if(command === 'hostname') data = `\nConnected with: ${data}`;
					console.log(data);

				}).stderr.on('data', error => {
					// on error data received process it - dont show certain errors
					data = formatting.formatServerStdOut(error).trim();
					if(!data.match(/^-( chmod| bash| : No such| chgrp| cannot|$)/)){
						console.log(data);
					}

	  			}).on('close', () => { 
					if(close_connection) connect_module.close_connections(connections);
					return resolve(); 
				});
			});
		} catch(err) {
			if(close_connection) connect_module.close_connections(connections);
			return reject(`execute_remote_command::${err}`);
		}
	});
}


/**
 * restarts a repo's hypnotoad
 * @param {string} path
 * @param {string} repo
 */
async function restart_hypnotoad(path, repo, from_name='restart_hypnotoad') {
	console.log(`restarting ${repo} hypnotoad...`);

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`hypnotoad -s ${path}; hypnotoad ${path}`, null, `${from_name}::restart_hypnotoad`);
		} catch(err){
			return reject(`restart_hypnotoad::${err}`)
		}
		return resolve();
	});
}


/*
 * restarts a user's apache
 * @param {ssh2 connection} connection
 */
async function restart_apache(from_name='restart_apache') {
	console.log(`restarting apache...`);

	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		try {
			connections = await connect_module.check_sftp_connection(connections);
			await execute_remote_command(`apache.sh`, null, `${from_name}::restart_hypnotoad`);
			if(close_connection) connect_module.close_connections(connections);
			return resolve();
		} catch(err){
			if(close_connection) connect_module.close_connections(connections);
			return reject(`restart_apache::${err}`)
		}
	});
}

async function restart_apache2(connections){
	return sync_helpers.currier(remote_command_factory, {
		command: 'apache.sh',
		log_message: 'Restarting apache...',
		from_name: 'restart_apache'
	})(connections);
}

/**
 *
 */
async function remote_command_factory({command='', log_message='', from_name='remote_command_factory', connections=''}) {
	if(log_message) console.log(log_message);

	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		try {
			connections = await connect_module.check_ssh_connection(connections);
			const result = await execute_remote_command(`apache.sh`, connections, from_name);
			if(close_connection) connect_module.close_connections(connections);
			return resolve(result);
		} catch(err){
			if(close_connection) connect_module.close_connections(connections);
			return reject(`${from_name}::${err}`)
		}
	});
}

/**
 *
 */
async function mkdir(absolute_file_path, connections='', from_name=''){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`mkdir -p ${absolute_file_path}`, connections, `${from_name}::mkdir`);
		} catch(err){
			return reject(`restart_hypnotoad::${err}`)
		}
		return resolve();
	});

	return await remote_commands.execute_remote_command; 

}

module.exports = {
	restart_apache,
	restart_apache2,
	restart_hypnotoad,
	execute_remote_command,
	update_permissions,
	delete_remote_repo,
	delete_remote_file,
	delete_remote_directory,
	make_remote_directory
};
