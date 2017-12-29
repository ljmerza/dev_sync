const connections_object = require("./connections");
const formatting = require('./formatting');

const Promise = require("bluebird");

// test connection to dev server
// execute_remote_command('hostname');

/*
*	function make_remote_directory(base_path, connection)
* 		makes directory folder for a given path
*/
async function make_remote_directory(base_path, connection) {
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`mkdir -p ${base_path}`, connection);
		}catch(err){
			return reject(`make_remote_directory::${err}`);
		}
		return resolve(base_path); 
	});	
}

/*
*	function delete_remote_directory(base_path, connection)
* 		deletes directory folder for a given path
*/
async function delete_remote_directory(base_path, connection){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${base_path}`, connection);
		}catch(err){
			return reject(`delete_remote_directory::${err}`);
		}
		return resolve(base_path);
	});	
}

/*
*	function delete_remote_file(remote_path, connection)
* 		deletes file for a given path
*/
async function delete_remote_file(remote_path, connection){
	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm ${remote_path}`, connection);
		}catch(err){
			return reject(`delete_remote_file::${err}`);
		}
		return resolve(base_path); 
	});	
}

/*
*	delete_remote_repo(repo_path, connection)
* 		deletes a repo's remote folder
*/
async function delete_remote_repo(repo_path, connection) {
	console.log('deleting remote repo folder...');

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${repo_path}`, connection);
			return resolve();
		} catch(err){
			return reject(`delete_remote_repo::${err}`)
		}
	});
}

/*
*	function update_permissions(uploaded_files)
* 		update permissions for all uploaded files
*/
function update_permissions(uploaded_files) {
	return new Promise( async (resolve, reject) => {

		// create command for all files uploaded
		const command = uploaded_files.reduce( (command, uploaded_file) => {
			return `${command}chgrp m5atools ${uploaded_file.remote_path}; chmod 770 ${uploaded_file.remote_path};`
		}, '');

		// try to execute command
		try {
			await execute_remote_command(command);
			return resolve();
		} catch(err){
			return reject(`update_permissions::${err}`);
		}
	});
}


/*
*	function execute_remote_command(command, ssh_connection)
* 		exec a bash command remotely
*/
async function execute_remote_command(command, ssh_connection) {

	// if given a connection object dont close at the end
	let close_connection = true;

	return new Promise(async (resolve, reject) => {
		try {
			// if SSH connection wasn't passed then get one
			if(!ssh_connection){
				ssh_connection = await connections_object.ssh_connection_promise();
			} else {
				close_connection = false;
			}

			// once uploaded array is empty then execute command to reset permissions
			ssh_connection.exec(command, (err, stream) => {
				if(err){
					if(ssh_connection && close_connection) ssh_connection.end();
					return reject(`execute_remote_command::exec::${err}`); 
				}

				// on data or error event -> format then log stdout from server
				stream.on('data', data => {
					data = formatting.formatServerStdOut(data);
					if(command == 'hostname') console.log('\nConnected with:', data);
					else console.log(data);
				}).stderr.on('data', error => {
					data = formatting.formatServerStdOut(error).trim();
					// dont show certain errors
					if(!data.match(/^-( chmod| bash| : No such| chgrp| cannot|$)/)){
						console.log(data);
					}
      			})
				.on('close', () => { 
					if(ssh_connection && close_connection) ssh_connection.end();
					return resolve(); 
				});
			});
		} catch(err) {
			if(ssh_connection && close_connection) ssh_connection.end();
			return reject(`execute_remote_command::${err}`);
		}
	});
}


/*
*	restart_hypnotoad(path, repo)
* 		restarts a repo's hypnotoad
*/
async function restart_hypnotoad(path, repo) {
	console.log(`restarting ${repo} hypnotoad...`);

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`hypnotoad -s ${path}; hypnotoad ${path}`);
			return resolve();
		} catch(err){
			return reject(`restart_hypnotoad::${err}`)
		}
	});
}


/*
*	restart_apache()
* 		restarts a user's apache
*/
async function restart_apache() {
	console.log(`restarting apache...`);

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`apache.sh`);
			return resolve();
		} catch(err){
			return reject(`restart_apache::${err}`)
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
	make_remote_directory
};
