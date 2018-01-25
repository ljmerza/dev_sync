const SSH2 = require('ssh2');
const fs = require('fs');
const config = require('./../config');
connections = []; // keeps track of all connections for exiting application

// try to get PPK file
let ppk_file;
try {
	ppk_file = fs.readFileSync(config.ppk_file_path);
} catch(err) {
	throw Error(`No ppk file found: ${err}`);
}

/*
 * overrides the Client constructor to add global
 * tracking of open connections to the server
 * @returns a new ssh2 connection object
 */
function Client(){
	return _override_connection( new SSH2() );
}

/*
 * creates a ssh connection
 * @returns {Promise<object|string>} a promise with the sftp object if
 * connection successful else an error string
 */
function ssh_connection() {
	return new Promise(resolve => {
		
		const ssh_connection = new Client()
		.connect({
			host: config.host,
			port: config.port,
			username: config.attuid,
			privateKey: ppk_file
		}).on('ready', () => {
			resolve(ssh_connection);
		});
	});
}


/**
 * creates a ssh and sftp connenction to the server
 * @returns {Promise<object|string>} a promise with the sftp object if
 * connection successful else an error string 
*/
async function sftp_connection() {
	return new Promise(async (resolve, reject) => {
		let ssh_connection;
		
		try {
			ssh_connection = await ssh_connection();
			ssh_connection.sftp( (err, sftp_connection) => {
				if(err) { throw Error(`sftp_connection::sftp::${err}`); }

				// override sftp object to add global tracking of connection
				sftp_connection = _override_connection(sftp_connection);
				return resolve({ sftp_connection, ssh_connection });
			});

		}catch(err){
			if(ssh_connection) ssh_connection.end();
			return reject(`sftp_connection::${err}`);
		}
	});
}

/*
* adds a symbol id to a connection object and pushes
* to global connections array to keep track of open connections
* overrides the end function to update the open connections array
 * @param {object} connection the ssh2 connection object to modify
*/
function _override_connection(connection){
	_add_connection_to_global(connnection);
	return _override_close_connection(connection);
}

/**
 * creates a Symbol object to add to the connection object
 * which are both stored in the global connections array
 * @param {object} connection the ssh2 connection object to add to the global array
 */
function _add_connection_to_global(connection){
	const symbol = Symbol();
	connection.symbol = symbol;
	connections.push({symbol, connection});
}

/**
 * overrides a connection object's end() method
 * so when closing a connection to the server we can
 * remove it from the global connections Array
 * @param {object} connection the ssh2 connection object to modify
 * @returns {object} the modified ssh2 connection object
 */
function _override_close_connection(connection){
	// save old end function
	const end_connection = connection.end;

	// override end function
	connection.end = function(){

		// call end to connection 
		end_connection.apply(this);

		// filter out connection from array
		connections = connections.filter(connects => connection.symbol != connects.symbol);
	}

	// return the modified connection object
	return connection;
}


module.exports = {ssh_connection, sftp_connection, connections};