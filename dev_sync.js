const watch = require('watch');
const path = require('path');
const fs = require('fs');
const Promise = require("bluebird");

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

	// create a default timeout to clear
	let current_timer = setTimeout(() => {},0);

	// create folder watch
	watch.watchTree(element.dir, function (local_path, prev, curr) {

		// console.log('local_path: ', local_path);
		// console.log('prev, curr: ', prev);
		// console.log('curr: ', curr);

		// if initial sync then ignore
		if (typeof local_path == "object" && prev === null && curr === null) return;

		// if git file then ignore
		if ( local_path.match(/.git/) ) return;

		// if current file is null then its a delete else just push file change
		if(curr == null){
			changed_files.push({local_path:local_path, remote_path: '', repo:element.repo});
		} else {
			changed_files.push({local_path:local_path, remote_path: '', repo:element.repo});
		}
		

		// clear last timeout and start a new one
		clearTimeout(current_timer);
		current_timer = setTimeout( () => {
			sftp_upload()
			.catch( err => console.log(`dev_sync::${err}`) );
		}, 200);

	});

	console.log('	', element.dir);
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
			// if not a file (is a dir) then mark it as a dir
			const dir = fs.lstatSync(file.local_path).isDirectory();
			// get local and remote path
			const [local_path, remote_path] = formatting.format_paths(file);
			// if fir then set base path to 'file' path else set base path of file
			const base_path = dir ? remote_path : path.dirname(remote_path);
			// return new file structure
			return {local_path, remote_path, base_path, repo:file.repo, dir};
		});
	
		// sync files to remote
		try {
			const files = await sync_helpers.sync_files(modified_upload_files);
			// then log files synced
			if(files.length) console.log('files synced: ');
			files.forEach( file => console.log('	', file) )
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





