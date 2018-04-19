const watch = require('watch');
const path = require('path');
const fs = require('fs');
const Promise = require("bluebird");
const chokidar = require('chokidar');

const {formatPaths} = require("./modules/formatting");
const {syncObjects} = require("./modules/syncHelpers");
const logs = require("./modules/logs");
const config = require('./config');

require("./modules/consoleCommands");

// array of changed files than need to be uploaded
let changedFiles = [];

// create a default timeout to clear
let currentTimer = setTimeout(()=>{},0);

// watchRepos();
logs.syncLogsInterval();



/**
 * format dirs to relative path of this file then create watcher
 */
function watchRepos() {
	console.log('watching the following directories:');

	Object.keys(config.localPaths)
	.map( repo => { return {dir: `../${config.localPaths[repo]}/`, repo} })
	.forEach( element => {

		chokidar.watch(path.join(__dirname, element.dir), {
			ignored: /\.git|node_modules|bower_components/,
			persistent: true,
			ignoreInitial: true,
		})
		.on('add', path => addToSync(path, 'add', element.repo))
		.on('change', path => addToSync(path, 'change', element.repo))
		.on('unlink', path => addToSync(path, 'unlink', element.repo))
		.on('addDir', path => addToSync(path, 'addDir', element.repo))
		.on('unlinkDir', path => addToSync(path, 'unlinkDir', element.repo))
		.on('error', error => console.log('watcher ERROR: ', error))
		.on('ready', () => console.log('	', element.dir));

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
			const [localPath, remotePath] = formatPaths(file);
			const basePath = ['addDir', 'unlinkDir'].includes(file.action) ? remotePath : path.dirname(remotePath);
			// return new structure
			return {localPath, remotePath, basePath, repo:file.repo, action:file.action};
		});
		
		try {
			await syncObjects(modifiedUploadFiles);
		} catch(err){
			return reject(`sftpUpload::${err}`);
		}
	});
}

/**
 * catch all errors here
 */
process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err);
});