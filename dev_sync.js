'use strict';

const watch = require('watch');
const path = require('path');
const fs = require('fs');
const Promise = require("bluebird");
const chokidar = require('chokidar');

const connections_object = require("./modules/connections");
const formatting = require("./modules/formatting");
const sync_helpers = require("./modules/sync_helpers");
const config = require('./config');

require("./modules/logs");
require("./modules/console_commands");


let changed_files = []; // array of changed files than need to be uploaded

console.log('watching the following directories:');

// format dirs to relative path of this file then create watcher
Object.keys(config.local_paths)
.map( repo => { return {dir: `../${config.local_paths[repo]}/`, repo} })
.forEach( element => {

	var watcher = chokidar.watch(path.join(__dirname, element.dir), {
		ignored: /(^|[\/\\])\../,
		persistent: true
	});
	var log = console.log.bind(console);

	watcher
 //  	.on('add', path => {
 //  		changed_files.push({local_path:path, remote_path: '', repo:element.repo, action: 'add'});
 //  		sync_files_timer();
	// })
	.on('change', path => {
		changed_files.push({local_path:path, remote_path: '', repo:element.repo, action: 'change'});
		sync_files_timer();
	})
	.on('unlink', path => {
		changed_files.push({local_path:path, remote_path: '', repo:element.repo, action: 'unlink'});
		sync_files_timer();
	})
	.on('addDir', path => {
		changed_files.push({local_path:path, remote_path: '', repo:element.repo, action: 'addDir'});
		sync_files_timer();
	})
	.on('unlinkDir', path => {
		changed_files.push({local_path:path, remote_path: '', repo:element.repo, action: 'unlinkDir'});
		sync_files_timer();
	})
	.on('error', error => {
		console.log('watcher ERROR: ', error);
	})
	.on('ready', () => {
		console.log('	', element.dir);
	})

	// create a default timeout to clear
	let current_timer = setTimeout(()=>{},0);

	function sync_files_timer() {
		// clear last timeout and start a new one
		clearTimeout(current_timer);
		current_timer = setTimeout( () => {
			sftp_upload()
			.catch( err => console.log(`dev_sync::${err}`) );
		}, 1000);
	}
	

});



/*
*	function sftp_upload()
* 		uploads file to dev server, sets permissions, 
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
			const file_objects = await sync_helpers.sync_objects(modified_upload_files);
			// then log files synced
			if(file_objects.length > 0) console.log(`${file_objects.length} objects synced`);
		} catch(err){
			return reject(`sftp_upload::${err}`);
		}
	});
}


/*
* catch all errors here
*/
process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err);
});





