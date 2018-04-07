const SSH2 = require('ssh2');
const fs = require('fs');
const config = require('./../config');


let ppk_file;

// try to get PPK file
try {
	ppk_file = fs.readFileSync(config.ppk_file_path);
} catch(err) {
	throw Error(`No ppk file found: ${err}`);
}

// keeps track of all connections for exiting application
connections = [];

/*
*/
function Client(){
	return _override_connection( new SSH2() );
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
		});

		ssh_connection.on('ready', () => {
			resolve(ssh_connection);
		});

		ssh_connection.on('error', error => {
			reject(error);
		});
	});
}


/*
*	sftp_connection_promise()
* 		return a sFTP connection promise
*/
async function sftp_connection_promise() {
	return new Promise(async (resolve, reject) => {
		let ssh_connection;
		try {
			ssh_connection = await ssh_connection_promise();
			ssh_connection.sftp( (err, sftp_connection) => {
				if(err) { return reject(`sftp_connection_promise::sftp::${err}`); }

				sftp_connection = _override_connection(sftp_connection);
				return resolve({ sftp_connection, ssh_connection });
			});
		}catch(err){
			if(ssh_connection) ssh_connection.end();
			return reject(`sftp_connection_promise::${err}`);
		}
	});
}

/*
*	_override_connection(connection)
*		adds a symbol id to a connection object and pushes
*		to global connections array to keep track of open connections
*		overrides the end function to update the open connections array
*/
function _override_connection(connection){

	// create symbol and save on connections array
	const symbol = Symbol();
	connection.symbol = symbol;
	connections.push({symbol, connection});
	// console.log('open connection...');

	// save old end function
	const end_connection = connection.end;

	// override end function
	connection.end = function(){
		// console.log('close connection...');

		// call end to connection 
		end_connection.apply(this);

		// filter out connection from array
		connections = connections.filter(connects => {
			return connection.symbol != connects.symbol
		});
	}

	// return the modified connection object
	return connection;
}

/**
 * ends any passed in connections
 */
async function close_connections(connection){

	if(connection && connection.ssh_connection) connection.ssh_connection.end();
	if(connection && connection.sftp_connection) connection.sftp_connection.end();
	if(connection && connection.end) connection.end();

} 

module.exports = {
	ssh_connection_promise, 
	sftp_connection_promise, 
	connections,
	close_connections
};