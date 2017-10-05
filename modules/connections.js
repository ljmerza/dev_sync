const Client = require('ssh2');
const fs = require('fs');
const config = require('./../config');

let ppk_file_path;
let ppk_file;


// try to get PPK file
if(config.ppk_file_name) {
	ppk_file_path = `C:\\Users\\${config.attuid}\\.ssh\\${config.ppk_file_name}.ppk`
} else {
	ppk_file_path = config.ppk_file_path || `C:\\Users\\${config.attuid}\\.ssh\\id_rsa.ppk`;
}
try {
	ppk_file = fs.readFileSync(ppk_file_path);
} catch(err) {
	throw Error(`No ppk file found: ${err}`);
}



/*
*	ssh_connection_promise()
* 		return a ssh connection promise
*/
function ssh_connection_promise() {
	return new Promise( (resolve, reject) => {
		// create ssh object
		let ssh_connection = new Client();

		// connect to server
		ssh_connection.connect({
			host: config.host,
			port: config.port,
			username: config.attuid,
			privateKey: ppk_file
		})
		ssh_connection.on('ready', () => {
			resolve(ssh_connection);
		})
	});
}


/*
*	sftp_connection_promise()
* 		return a sFTP connection promise
*/
function sftp_connection_promise() {
	return new Promise( (resolve, reject) => {
		ssh_connection_promise()
		.then( ssh_connection => {
			ssh_connection.sftp( (err, sftp_connection) => {
				if(err) { ssh_connection.end(); return reject(`sftp_connection_promise::${err}`); }

				// return connections object
				return resolve({
					sftp_connection,
					ssh_connection
				});

			});
		})
		.catch( err => { return reject(`sftp_connection_promise::${err}`) });
	});
}



module.exports = {
	ssh_connection_promise,
	sftp_connection_promise
};