const connect_module = require("./connections");
const formatting = require('./formatting');

const Promise = require("bluebird");

// test connection to dev server

(async () => {
	const server = await execute_remote_command('hostname', null, 'hostname', true);
	console.log(`Connected with ${server}`);
})();

/**
 *  makes directory folder for a given path
 * @param {string} base_path
 * @param {ssh2 connection} connections
 */
async function make_remote_directory(base_path, connections, from_name) {
	return new Promise(async (resolve, reject) => {
		try {
			connections = await connect_module.check_ssh_connection(connections, `${from_name}::make_remote_directory`);
			await execute_remote_command(`mkdir -p ${base_path}`, connections, `${from_name}::make_remote_directory`);
		} catch(err){
			return reject(`make_remote_directory::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes directory folder for a given path
 * @param {string} base_path
 * @param {ssh2 connection} connections
 */
async function delete_remote_directory(base_path, connections, from_name){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${base_path}`, connections, `${from_name}::delete_remote_directory`);
		} catch(err){
			return reject(`delete_remote_directory::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes file for a given path
 * @param {string} remote_path
 * @param {ssh2 connection} connections
 */
async function delete_remote_file(remote_path, connections, from_name){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm ${remote_path}`, connections, `${from_name}::delete_remote_file`);
		} catch(err){
			return reject(`delete_remote_file::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes a repo's remote folder
 * @param {string} repo_path
 * @param {ssh2 connection} connections
 */
async function delete_remote_repo(repo_path, connections, from_name) {
	console.log('deleting remote repo folder...');
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${repo_path}`, connections, `${from_name}::delete_remote_repo`);
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
async function update_permissions(uploaded_files, from_name, connections) {

	return new Promise(async (resolve, reject) => {
		// create command for all files uploaded
		const command = uploaded_files.reduce( (command, uploaded_file) => {
			return `${command}chgrp m5atools ${uploaded_file.remote_path}; chmod 770 ${uploaded_file.remote_path};`
		}, '');

		// try to execute command
		try {
			await execute_remote_command(command, connections, `${from_name}::update_permissions`);
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
async function execute_remote_command(command, connections, from_name='execute_remote_command', return_result=false) {
	return new Promise(async (resolve, reject) => {
		let close_connection = !connections;
		connections = await connect_module.check_ssh_connection(connections, `${from_name}::execute_remote_command`);

		let return_value = '';
		try {
			// once uploaded array is empty then execute command to reset permissions
			connections.ssh_connection.exec(command, (err, stream) => {
				if(err) return reject(`stream error execute_remote_command::${err}`);

				// on data or error event -> format then log stdout from server
				stream.on('data', data => {
					// on data received - process it
					data = formatting.formatServerStdOut(data);
					if(!return_result) console.log(data);
					else return_value += data;

				}).stderr.on('data', error => {
					// on error data received process it - dont show certain errors
					data = formatting.formatServerStdOut(error).trim();
					if(!data.match(/^( chmod| bash| : No such| chgrp| cannot|Too late|$)/)){
						return reject(`stderr execute_remote_command::${error}`);
					}
					return resolve(return_value);

	  			}).on('close', () => { 
					if(close_connection) connect_module.close_connections(connections);
					return resolve(return_value);
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
 * @param {string} repo_name
 */
async function restart_hypnotoad({path, repo_name, connections, from_name='restart_hypnotoad'}) {
	console.log(`restarting ${repo_name} hypnotoad...`);

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`hypnotoad -s ${path}; hypnotoad ${path}`, connections, `${from_name}::restart_hypnotoad`);
		} catch(err){
			return reject(`restart_hypnotoad::${err}`)
		}
		return resolve();
	});
}


/**
 * restarts a user's apache
 * 
 */
async function restart_apache({connections, from_name='restart_apache'}) {
	console.log(`restarting apache...`);

	return new Promise(async (resolve, reject) => {
		try {			
			await execute_remote_command(`apache.sh`, connections, `${from_name}::restart_hypnotoad`);
		} catch(err){
			return reject(`restart_apache::${err}`)
		}
		return resolve();
	});
}


/**
 * gets a recursive list of all remote files given a path
 */
async function get_remote_file_tree({path, from_name='get_remote_file_tree'}) {
	return new Promise(async (resolve, reject) => {
		try {
			const result = await execute_remote_command(`find ${path}. -print`, null, `${from_name}::get_remote_file_tree`, true);
		
			// split into an array of file paths, remove folders, and remote relative path markerLBS071150001
			const files = result.split(path)
				.filter(file => /\.[a-zA-Z]{2,4}$/g.test(file))
				.map(file => /^\.\//.test(file) ? file.substring(2) : file);
			return resolve(files);
		} catch(err){
			return reject(`get_remote_file_tree::${err}`)
		}
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
	make_remote_directory,
	get_remote_file_tree
};
