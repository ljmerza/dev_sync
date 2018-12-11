const Promise = require("bluebird");
const streamEqual = require('stream-equal');
const {existsSync} = require('fs');
const {join} = require('path');
const {exec} = require('child_process');
const chalk = require('chalk');

const config = require('./../config');
const {executeRemoteCommand} = require('./remoteCommands');
const {syncChunks, syncRemoteToLocal} = require('./syncHelpers');
const {formatLogFiles} = require('./formatting');
const {asyncForEach} = require('./tools');
const {sftpConnectionPromise, closeConnections} = require('./connections');


/**
 * syncs log files from server to host
 */
async function syncLogs(logFiles) {
	let connections = await sftpConnectionPromise('syncLogs');

	return new Promise( async (resolve, reject) => {
		try {
			await syncLogFolders(connections);

			const result = await syncChunks(logFiles, 1, syncRemoteToLocal, 'syncLogs', false);
			await closeConnections(connections);
			return resolve(result);

		} catch(err){
			await closeConnections(connections);
			return reject(`syncLogs::${err}`);
		}
	});
}

/**
 * creates remote log paths if they dont exist
 */
async function syncLogFolders(connections){
	const closeConnection = !connections;

	if(!connections){
		connections = await sftpConnectionPromise('syncLogFolders');
	}

	return new Promise(async (resolve, reject) => {
		try {
			await asyncForEach(getAllLogFiles(), async file => {

				const remoteFilePath = `${config.remoteBase}/${file[0]}`;
				const remoteFile = `${remoteFilePath}/${file[1]}`;
				const localFile = join(__dirname, '../', file[2]);

				await executeRemoteCommand(`mkdir -p ${remoteFilePath}`, connections, `syncLogFolders`, true); 
				await executeRemoteCommand(`touch ${remoteFile}`, connections, `syncLogFolders`);

				// create local file if doesn't exist
				if (!existsSync(localFile)) {
					await exec(`touch ${localFile}`);
				}
			});

			if(closeConnection) await closeConnections(connections);
			return resolve();

		} catch(err){
			if(closeConnection) await closeConnections(connections);
			return reject(`syncLogFolders::${err}`);
		}
	});
}

/**
 * download log files periodically
 */
async function syncLogsInterval() {

	let checkSync = true; // only allow one sync operation at a time
	const formattedLogFiles = formatLogFiles(getAllLogFiles());

	setInterval(async () => {
		try {
			if(!checkSync) return;

			checkSync = false;
			const messages = await syncLogs(formattedLogFiles);
			checkSync = true;

			// log any sync messages
			messages
				.filter(message => message)
				.forEach(message => console.log(chalk.blueBright(message)));

		} catch(err){
			checkSync = true;
			console.log('syncLogsInterval::', err);
		}
	}, 500);
};

/**
 * resets all logs
 */
async function resetLogs(fromName='resetLogs') {

	// combine all log file paths into a command
	const command = getAllLogFiles().map(logFile => `${logFile[0]}/${logFile[1]}`)
	.reduce( (command, dir) => `${command} cat /dev/null > ${config.remoteBase}/${dir};`, '');
	
	console.log(chalk.blueBright('resetting logs...'));

	// try to reset remote logs
	return new Promise(async (resolve, reject) => {
		try {
			await executeRemoteCommand(command, null, `${fromName}::resetLogs`);
			return resolve(chalk.blueBright('logs reset'));
		} catch(err){
			return reject(`resetLogs::${err}`);
		}
	});	
}

function getAllLogFiles(){
	let logFiles = [];

	Object.keys(config.repos).forEach(repoName => {
		const repo = config.repos[repoName];
		(repo.logs || []).forEach(log => logFiles.push(log));
	});

	return logFiles;
}

module.exports = {syncLogs, syncLogsInterval, resetLogs};