const ssh2_promise = require('ssh2-promise');
const fs = require('fs');
const config = require('./../config');

let ppk_file;

// try to get PPK file
try {
	ppk_file = fs.readFileSync(config.ppk_file_path);
} catch(err) {
	throw Error(`No ppk file found: ${err}`);
}

/*
*	ssh_connection()
* 		return a ssh connection
*/
async function ssh_connection() {
	return new Promise( async (resolve, reject) => {
		// create ssh object
		let ssh_connection = new ssh2_promise({
			host: config.host,
			port: config.port,
			username: config.attuid,
			privateKey: ppk_file
		});

		// connect to server
		let connection;
		try {
			connection = await ssh_connection.connect();
			return resolve(connection);
		} catch(err){
			return reject(`ssh_connection::${err}`);
		}
	});
}

/*
*	sftp_connection()
* 		return a sFTP connection
*/
async function sftp_connection() {
	return new Promise( async (resolve, reject) => {
		let sftp_connection;

		try {
			ssh_connection = await ssh_connection();
			const sftp_connection = await ssh_connection.sftp();
			return resolve({sftp_connection, ssh_connection});
		} catch(err) {
			// if we already created ssh connection then end it
			if(ssh_connection) ssh_connection.close();  
			return reject(`sftp_connection::${err}`);
		}
	});
}

module.exports = {ssh_connection, sftp_connection};