const connections_object = require("./connections");
const formatting = require('./formatting');
const remote_commands = require('./remote_commands');

const recursive = require("recursive-readdir");
const Promise = require("bluebird");
const path = require('path');
const Gauge = require("gauge");


let number_of_files = 0;
let number_files_uploaded = 0;
let gauge;

/*
*	function sync_files(all_files_data)
* 		syncs all files to server
*/
function sync_files(all_files_data) {

	gauge = new Gauge();

	// make sure all file paths are correct format for Windows/UNIX
	all_files_data = formatting.format_files(all_files_data);
	let synced_files_promises = [];

	// set loader config
	number_of_files = all_files_data.length;
	number_files_uploaded = 0;

	return new Promise( (resolve, reject) => {

		remote_commands.mkdirs(all_files_data)
		.then( () => {
			// get connections
			connections_object.sftp_connection_promise()
			.then( connection => {

				// for each file -> sync it
				for(let i=0; i<number_of_files;i++){

					// if local object is a file then upload else its a dir so skip
					if( ! all_files_data[i].dir ){
						synced_files_promises.push( sync_file(connection, all_files_data[i]) );
					}
				}

				// once all files are synced -> update permissions
				Promise.all(synced_files_promises)
				.then( files => {
					gauge.hide();

					connection.ssh_connection.end();
					connection.sftp_connection.end();
					// update file permissions and reset logs
					remote_commands.update_permissions(all_files_data);
					return resolve(files);
				})
				.catch( err => { 
					gauge.hide()
					return reject(`sync_files::${err}`); 
				});
			})
			.catch( err => { return reject(`sync_files::${err}`); });
		});
	})
}

/**
*	function delete_remote(remote_path)
*		deletes a remote folder or file
*/
function delete_remote(remote_path){
	return new Promise( (resolve, reject) => {
		remote_commands.execute_remote_command(`rm -rf ${remote_path}`)
			.then( () => { return resolve(); })
			.catch( err => { return reject(`delete_remote::${err}`); });
	});
}


/*
*	function sync_file(connection, file_data)
* 		syncs a file to server
*/
function sync_file(connection, file_data) {
	console.log('file_data: ', file_data);
	return new Promise( (resolve, reject) => {
		// create remote folder path if does not exist
		connection.sftp_connection.fastPut(file_data.local_path, file_data.remote_path, err => {
			if(err) { 
				// if error is it doesn't exist locally then it's a delete
				if(err.code == 'ENOENT'){
					delete_remote(file_data.remote_path)
					.then( () => {
						number_files_uploaded++;
						gauge.show(`uploaded ${file_data.local_path}`, number_files_uploaded/number_of_files);
						gauge.pulse(file_data.remote_path);
						return resolve(file_data.remote_path); 
					})
					.catch( err => { return reject(`sync_file::${err}`); });

				} else {
					// else something actually went wrong so reject
					return reject(`sync_file::${err}`); 
				}
			} else {
				number_files_uploaded++;
				gauge.show(`uploaded ${file_data.local_path}`, number_files_uploaded/number_of_files);
				gauge.pulse(file_data.remote_path);
				return resolve(file_data.remote_path);
			}
			
		});
	});
}


/*
*	function transfer_repo(local_path, remote_path, repo) 
* 		upload a repo to the server
*/
function transfer_repo(local_path, remote_path, repo) {

	let local_path_folders = local_path.split('/');
	let files_to_upload = [];

  return new Promise( (resolve, reject) => {
    // get all file path in local folder given
    recursive(local_path, function (err, files) {
      if(err) { return reject(`transfer_repo::recursive::err: ${err}`); }
      

      // for each file upload to remote server
      for(let i=0;i<files.length;i++){

        // create local/remote file absolute paths
        let file_remote_path = files[i].split('\\').splice(local_path_folders.length).join('\\');
        let file_local_path = `${local_path}\\${file_remote_path}`
        file_remote_path = `${remote_path}/${file_remote_path}`;
        let base_path = path.dirname(file_remote_path);


        // if is a git file then ignore it
        if(file_local_path.match(/\.git/)){
          continue;
        }

        files_to_upload.push({remote_path:file_remote_path, local_path:file_local_path, base_path, repo})
      }

      // delete remote repo first
      remote_commands.delete_remote_repo(remote_path)
      .then( () => {

        // then sync files to server
        sync_files(files_to_upload)
        .then( () => {
          return resolve(`Uploaded ${files_to_upload.length} files for ${repo}`);
        })
        .catch( err => { return reject(`transfer_repo::${err}`); });

      })
      .catch( err => { return reject(`transfer_repo::${err}`); });

      
    });
  });	
}

module.exports = {
	sync_files,
	transfer_repo
};