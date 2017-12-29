const connections_object = require("./connections");
const formatting = require('./formatting');

const Promise = require("bluebird");

// test connection to dev server
execute_remote_command('hostname');

/*
*	function mkdirs(all_dirs)
* 		makes directory paths if they dont exist for all file paths
*/
async function mkdirs(all_dirs) {

	// get all base paths and format them for *nix
	const base_paths = all_dirs.map( file => file.base_path.replace(/\\/g, '/') );

	// get all directories to log them once created
	const dirs = all_dirs.filter(file => file.dir);

	// get all unique directories and create command to send
	const command = [...new Set(base_paths)]
	.reduce( (command, dir) => `${command}mkdir -p ${dir};`, '' );

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(command)
			// log any directories created and return resolved promise
			if(dirs.length > 0){
				console.log('directories created: ');
				dirs.forEach( dir => console.log(`	${dir.remote_path}`) );
			}
		}catch(err){
			return reject(`mkdirs::${err}`);
		}
		
		return resolve(); 

	});
}


/*
*	delete_remote_repo(repo_path)
* 		deletes a repo's remote folder
*/
async function delete_remote_repo(repo_path) {
	console.log('deleting remote repo folder...');

	return new Promise(async (resolve, reject) => {
		try {
			await execute_remote_command(`rm -rd ${repo_path}`);
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
*	function execute_remote_command(command)
* 		exec a bash command remotely
*/
async function execute_remote_command(command) {
	return new Promise(async (resolve, reject) => {
		// connect to server
		let ssh_connection;
		try {
			ssh_connection = await connections_object.ssh_connection_promise();

			// once uploaded array is empty then execute command to reset permissions
			ssh_connection.exec(command, (err, stream) => {
				if(err){ 
					if(ssh_connection) ssh_connection.end();
					return reject(`execute_remote_dcommand::${err}`); 
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
					if(ssh_connection) ssh_connection.end();
					return resolve(); 
				});
			});
		} catch(err) {
			if(ssh_connection) ssh_connection.end();
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
	mkdirs
};
