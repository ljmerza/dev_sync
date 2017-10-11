const connections_object = require("./connections");
const formatting = require('./formatting');

const Promise = require("bluebird");

// test connection to dev server
execute_remote_command('hostname');

/*
*	function mkdirs(all_dirs)
* 		makes directory paths if they dont exist for all file paths
*/
function mkdirs(all_dirs) {

	// get all base paths and format them for *nix
	const base_paths = all_dirs.map( file => file.base_path.replace(/\\/g, '/') );

	// get all unique directories and create command to send
	const command = [...new Set(base_paths)]
	.reduce( (command, dir) => `${command}mkdir -p ${dir};`, '' );

	return new Promise( (resolve, reject) => {
		execute_remote_command(command)
		.then( () => { return resolve(); })
		.catch( err => { return reject(`mkdirs::${err}`); });
	});
}


/*
*	delete_remote_repo(repo_path)
* 		deletes a repo's remote folder
*/
function delete_remote_repo(repo_path) {
	return new Promise( (resolve, reject) => {
		console.log('deleting remote repo folder...');
		execute_remote_command(`rm -rd ${repo_path}`)
		.then( () => { return resolve(); } )
		.catch( err => { return reject(`delete_remote_repo::${err}`); });
	});
}

/*
*	function update_permissions(uploaded_files)
* 		update permissions for all uploaded files
*/
function update_permissions(uploaded_files) {
	return new Promise( (resolve, reject) => {

		// create command for all files uploaded
		const command = uploaded_files.reduce( (command, uploaded_file) => {
			return `${command}chgrp m5atools ${uploaded_file.remote_path}; chmod 770 ${uploaded_file.remote_path};`
		}, '');

		// execute command
		execute_remote_command(command)
		.then( () => { return resolve(); })
		.catch( (err) => { return reject(`update_permissions::${err}`); });
	});
}


/*
*	function execute_remote_command(command)
* 		exec a bash command remotely
*/
function execute_remote_command(command) {
	return new Promise( (resolve, reject) => {
		// connect to server
		connections_object.ssh_connection_promise()
		.then( ssh_connection => {
			// once uploaded array is empty then execute command to reset permissions
			ssh_connection.exec(command, (err, stream) => {
				if(err) { ssh_connection.end(); return reject(`execute_remote_command::${err}`); }

				// on data or error event -> format then log stdout from server
				stream.on('data', data => {
					data = formatting.formatServerStdOut(data);
					if(command == 'hostname') console.log('\nConnected with:', data);
					else console.log(data);
				}).stderr.on('data', data => {
					data = formatting.formatServerStdOut(data).trim();
					// dont show certain errors
					if(!data.match(/^-( chmod| bash| : No such| chgrp| cannot|$)/)){
						console.log(data);
					}
      			})
				.on('close', () => { ssh_connection.end(); return resolve(); });	

			});
		})
		.catch( err => { return reject(`execute_remote_command::${err}`); });
	});
}


/*
*	restart_hypnotoad(url, repo)
* 		restarts a repo's hypnotoad
*/
function restart_hypnotoad(path, repo) {
	console.log(`restarting ${repo} hypnotoad...`);
	execute_remote_command(`hypnotoad -s ${path}; hypnotoad ${path}`)
	.catch( message => console.log(`restart_hypnotoad::${message}`) );
}


/*
*	restart_apache()
* 		restarts a user's apache
*/
function restart_apache() {
	console.log(`restarting apache...`);
	execute_remote_command(`apache.sh`)
	.catch( message => console.log(`restart_apache::${message}`) );
}


module.exports = {
	restart_apache,
	restart_hypnotoad,
	execute_remote_command,
	update_permissions,
	delete_remote_repo,
	mkdirs
};
