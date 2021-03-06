const path = require('path');
const fs = require('fs');
const Promise = require("bluebird");
const chokidar = require('chokidar');
const chalk = require('chalk');

const {retrievePaths} = require("./modules/formatting");
const {syncObjects, processSyncedObjects} = require("./modules/syncHelpers");
const {executeRemoteCommand} = require("./modules/remoteCommands");

const {asyncForEach} = require('./modules/tools');
const logs = require("./modules/logs");
const config = require('./config');

require("./modules/consoleCommands");

// array of changed files than need to be uploaded
let changedFiles = [];

// create a default timeout to clear
let currentTimer = setTimeout(()=>{},0);


// test connection to dev server then start watching
(async () => {
	const server = await executeRemoteCommand('hostname', null, 'hostname', true);
	console.log(chalk.green(`Connected with ${server}`));

	await logs.syncLogsInterval();
	await watchRepos();
})();

/**
 * format dirs to relative path of this file then create watcher
 */
async function watchRepos() {
	console.log(chalk.greenBright('watching the following repositories:'));

	const watchDirs = Object.keys(config.repos)
	.map(repo => { return {dir: `../${config.repos[repo].local}/`, repo} });

	await asyncForEach(watchDirs, async element => {
		try {
			const result = await addFolderToSync(element);
			console.log(chalk.greenBright(result));
		} catch(error){
			console.log(chalk.red(`Could not sync folder: ${error}`));
		}
	});

	console.log(chalk.greenBright('All folders watched'));
}

/**
 *
 */
 async function addFolderToSync(element){
 	return new Promise((resolve, reject) => {
	 	chokidar.watch(path.join(__dirname, element.dir), {
				ignored: /\.git|node_modules|bower_components|\/tmp\//,
				persistent: true,
				ignoreInitial: true,
			})
			.on('add', path => addToSync(path, 'add', element.repo))
			.on('change', path => addToSync(path, 'change', element.repo))
			.on('unlink', path => addToSync(path, 'unlink', element.repo))
			.on('addDir', path => addToSync(path, 'addDir', element.repo))
			.on('unlinkDir', path => addToSync(path, 'unlinkDir', element.repo))
			.on('error', error => reject('watcher ERROR: ', error))
			.on('ready', () => resolve(`	${element.repo}`));

			function addToSync(localPath, action, repo){
				changedFiles.push({localPath, repo, action});
				syncFilesTimer();
			}
	});
 }

/**
*/
function syncFilesTimer() {
	// clear last timeout and start a new one
	clearTimeout(currentTimer);
	currentTimer = setTimeout( () => {
		sftpUpload()
		.catch( err => console.log(`syncFilesTimer::${err}`) );
	}, 1000);
}

/**
 * uploads file to dev server, sets permissions, 
 */
async function sftpUpload() {
	// copy array and empty old one
	const uploadFiles = changedFiles.slice();
	changedFiles = [];

	return new Promise(async (resolve, reject) => {

		// for each file, format paths
		const modifiedUploadFiles = uploadFiles.map( file => {
			// create local/remote paths and get base path of file/folder
			const {localFilePath, absoluteRemotePath, localBasePath, absoluteLocalPath, remoteBasePath} = retrievePaths(file);
			// return new structure
			return {localFilePath, absoluteRemotePath, remoteBasePath, repo:file.repo, action:file.action, localBasePath, absoluteLocalPath};
		});
		
		try {
			const result = await syncObjects(modifiedUploadFiles);
			await processSyncedObjects(result);
		} catch(err){
			return reject(`sftpUpload::${err}`);
		}
	});
}

/**
 * catch all errors here
 */
process.on('unhandledRejection', reason => {throw reason});
process.on('uncaughtException', err => console.log('Caught exception: ' + err));