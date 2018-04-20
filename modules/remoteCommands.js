const Promise = require("bluebird");

const {checkSshConnection,closeConnections} = require("./connections");
const {formatServerStdOut} = require('./formatting');


// test connection to dev server
(async () => {
	const server = await executeRemoteCommand('hostname', null, 'hostname', true);
	console.log(`Connected with ${server}`);
})();

/**
 *  makes directory folder for a given path
 * @param {string} basePath
 * @param {ssh2 connection} connections
 */
async function makeRemoteDirectory(basePath, connections, fromName) {
	return new Promise(async (resolve, reject) => {
		try {
			connections = await checkSshConnection(connections, `${fromName}::makeRemoteDirectory`);
			await executeRemoteCommand(`mkdir -p ${basePath}`, connections, `${fromName}::makeRemoteDirectory`);
		} catch(err){
			return reject(`makeRemoteDirectory::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes directory folder for a given path
 * @param {string} basePath
 * @param {ssh2 connection} connections
 */
async function deleteRemoteDirectory(basePath, connections, fromName){
	return new Promise(async (resolve, reject) => {
		try {
			await executeRemoteCommand(`rm -rd ${basePath}`, connections, `${fromName}::deleteRemoteDirectory`);
		} catch(err){
			return reject(`deleteRemoteDirectory::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes file for a given path
 * @param {string} remotePath
 * @param {ssh2 connection} connections
 */
async function deleteRemoteFile({remotePath, connections, fromName}){
	return new Promise(async (resolve, reject) => {
		try {
			await executeRemoteCommand(`rm ${remotePath}`, connections, `${fromName}::deleteRemoteFile`);
		} catch(err){
			return reject(`deleteRemoteFile::${err}`);
		}
		return resolve();
	});
}

/**
 * deletes a repo's remote folder
 * @param {string} repoPath
 * @param {ssh2 connection} connections
 */
async function deleteRemoteRepo(repoPath, connections, fromName) {
	console.log('deleting remote repo folder...');
	return new Promise(async (resolve, reject) => {
		try {
			await executeRemoteCommand(`rm -rd ${repoPath}`, connections, `${fromName}::deleteRemoteRepo`);
		} catch(err){
			return reject(`deleteRemoteRepo::${err}`);
		}
		return resolve();
	});
}

/**
 * update permissions for all uploaded files
 * @param {Array<object>} uploadedFiles
 */
async function updatePermissions(uploadedFiles, fromName, connections) {

	return new Promise(async (resolve, reject) => {
		// create command for all files uploaded
		const command = uploadedFiles.reduce( (command, uploadedFile) => {
			return `${command}chgrp m5atools ${uploadedFile.remotePath}; chmod 770 ${uploadedFile.remotePath};`
		}, '');

		// try to execute command
		try {
			await executeRemoteCommand(command, connections, `${fromName}::updatePermissions`);
		} catch(err){
			return reject(`updatePermissions::${err}`);
		}
		return resolve();
	});
}


/**
 * exec a bash command remotely
 * @param {string} command
 * @param {ssh2 connection} connection
 */
async function executeRemoteCommand(command, connections, fromName='executeRemoteCommand', returnResult=false) {
	return new Promise(async (resolve, reject) => {
		let closeConnection = !connections;
		let returnValue = '';
		try {
			connections = await checkSshConnection(connections, `${fromName}::executeRemoteCommand`);

			connections.sshConnection.exec(command, (err, stream) => {
				if(err) return reject(`stream error executeRemoteCommand::${err}`);

				// on data or error event -> format then log stdout from server
				stream.on('data', data => {
					// on data received - process it
					data = formatServerStdOut(data);
					if(!returnResult) console.log(data);
					else returnValue += data;

				}).stderr.on('data', error => {
					// on error data received process it - dont show certain errors
					data = formatServerStdOut(error).trim();
					if(!data.match(/^( chmod| bash| : No such| chgrp| cannot|Too late|$)/)){
						return reject(`stderr executeRemoteCommand::${error}`);
					}
					return resolve(returnValue);

	  			}).on('close', () => { 
					if(closeConnection) closeConnections(connections);
					return resolve(returnValue);
				});
			});

		} catch(err) {
			if(closeConnection) closeConnections(connections);
			return reject(`executeRemoteCommand::${err}`);
		}
	});
}


/**
 * restarts a repo's hypnotoad
 * @param {string} path
 * @param {string} repoName
 */
async function restartHypnotoad({path, repoName, connections, fromName='restartHypnotoad'}) {
	console.log(`restarting ${repoName} hypnotoad...`);

	return new Promise(async (resolve, reject) => {
		try {
			await executeRemoteCommand(`hypnotoad -s ${path}; hypnotoad ${path}`, connections, `${fromName}::restartHypnotoad`);
		} catch(err){
			return reject(`restartHypnotoad::${err}`)
		}
		return resolve();
	});
}


/**
 * restarts a user's apache
 * 
 */
async function restartApache({connections, fromName='restartApache'}) {
	console.log(`restarting apache...`);

	return new Promise(async (resolve, reject) => {
		try {			
			await executeRemoteCommand(`apache.sh`, connections, `${fromName}::restartApache`);
		} catch(err){
			return reject(`restartApache::${err}`)
		}
		return resolve();
	});
}

/**
 * gets a recursive list of all remote files given a path
 */
async function getRemoteFileTree({path, fromName='getRemoteFileTree'}) {
	return new Promise(async (resolve, reject) => {
		try {
			const result = await executeRemoteCommand(`find ${path}/. -print`, null, `${fromName}::getRemoteFileTree`, true);
		
			// split into an array of file paths, remove folders, 
			// remote relative path marker, and filter out ignored files
			const files = result.split(path)
				.filter(file => /\.[a-zA-Z]{2,4}$/g.test(file))
				.map(file => `${path}${file.substring(2)}`)
				.filter(file => !/\/.git\/|\/bower_components\/|\/node_modules\/|\/tmp\//.test(file));

			return resolve(files);
		} catch(err){
			return reject(`getRemoteFileTree::${err}`)
		}
	});
}

/**
 * deletes a remote folder or file
 * @param {string} remotePath
 */
async function deleteRemote(remotePath){
	return new Promise(async (resolve, reject) => {
		try {
			await executeRemoteCommand(`rm -rf ${remotePath}`);
			return resolve();
		} catch(err){
			return reject(`deleteRemote::${err}`);
		}
	});
}

module.exports = {
	makeRemoteDirectory, deleteRemoteDirectory, 
	deleteRemoteFile, deleteRemoteRepo, updatePermissions, 
	restartHypnotoad, restartApache, getRemoteFileTree, 
	deleteRemote, executeRemoteCommand
}