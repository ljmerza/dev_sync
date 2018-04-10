'use strict';

const watch = require('watch');
const path = require('path');
const fs = require('fs');
const Promise = require("bluebird");
const chokidar = require('chokidar');
// const memwatch = require('memwatch-next');

const connections_object = require("./modules/connections");
const formatting = require("./modules/formatting");
const sync_helpers = require("./modules/sync_helpers");
const logs = require("./modules/logs");
const config = require('./config');

require("./modules/console_commands");


let changed_files = []; // array of changed files than need to be uploaded

// create a default timeout to clear
let current_timer = setTimeout(()=>{},0);

// watch_repos();
logs.sync_logs_interval();



/**
 * format dirs to relative path of this file then create watcher
 */
function watch_repos() {
	console.log('watching the following directories:');

	Object.keys(config.local_paths)
	.map( repo => { return {dir: `../${config.local_paths[repo]}/`, repo} })
	.forEach( element => {

		chokidar.watch(path.join(__dirname, element.dir), {
			ignored: /\.git/,
			persistent: true,
			ignoreInitial: true,
		})
		.on('add', path => add_to_sync(path, 'add', element.repo))
		.on('change', path => add_to_sync(path, 'change', element.repo))
		.on('unlink', path => add_to_sync(path, 'unlink', element.repo))
		.on('addDir', path => add_to_sync(path, 'addDir', element.repo))
		.on('unlinkDir', path => add_to_sync(path, 'unlinkDir', element.repo))
		.on('error', error => console.log('watcher ERROR: ', error))
		.on('ready', () => console.log('	', element.dir));



		function add_to_sync(local_path, action, repo){
			changed_files.push({local_path, repo, action});
			sync_files_timer();
		}
	});
}

/**
*/
function sync_files_timer() {
	// clear last timeout and start a new one
	clearTimeout(current_timer);
	current_timer = setTimeout( () => {
		sftp_upload()
		.catch( err => console.log(`dev_sync::${err}`) );
	}, 1000);
}

/**
 * uploads file to dev server, sets permissions, 
 */
async function sftp_upload() {
	// copy array and empty old one
	const upload_files = changed_files.slice();
	changed_files = [];

	return new Promise(async (resolve, reject) => {

		// for each file, format paths
		const modified_upload_files = upload_files.map( file => {
			// create local/remote paths and get base path of file/folder
			const [local_path, remote_path] = formatting.format_paths(file);
			const base_path = ['addDir', 'unlinkDir'].includes(file.action) ? remote_path : path.dirname(remote_path);
			// return new structure
			return {local_path, remote_path, base_path, repo:file.repo, action:file.action};
		});
		
		try {
			await sync_helpers.sync_objects(modified_upload_files);
		} catch(err){
			return reject(`sftp_upload::${err}`);
		}
	});
}


/**
 * catch all errors here
 */
process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err);
});

/**
* detect memory leaks for debugging
*/
// memwatch.on('leak', (info) => {
//   console.error('Memory leak detected:\n', info);
// });
// memwatch.on('stats', (info) => {
//   console.error('Memory stats:\n', info);
// });

// // diff the heap after X ms
// let hd = new memwatch.HeapDiff();
// setTimeout( () => {
// 	const diff = hd.end();
// 	console.log('heap diff:\n', diff);
// }, 1000*60*5) 



