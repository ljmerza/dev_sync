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
function Client(from_name='Client'){
	return _override_connection(new SSH2(), false, from_name);
}

/*
*	ssh_connection_promise()
* 		return a ssh connection promise
*/
function ssh_connection_promise(from_name='ssh_connection_promise') {
	return new Promise( (resolve, reject) => {
		// create ssh object
		let ssh_connection = new Client(from_name);

		// connect to server
		ssh_connection.connect({
			host: config.host,
			port: config.port,
			username: config.attuid,
			privateKey: ppk_file
		});

		ssh_connection.on('ready', () => {
			resolve({ssh_connection});
		});

		ssh_connection.on('error', error => {
			reject(error);
		});
	});
}

/**
 *
 */
async function check_sftp_connection(connections, from_name='check_sftp_connection'){
	return new Promise(async (resolve, reject) => {
		try {
			if(!connections || !connections.sftp_connection) connections = await sftp_connection_promise(`${from_name}::check_sftp_connection`);
			return resolve(connections);
		} catch(err){
			return reject(`check_sftp_connection::${err}`);
		}
	})
}

/**
 *
 */
async function check_ssh_connection(connections, from_name='check_ssh_connection'){
	return new Promise(async (resolve, reject) => {
		try {
			if(!connections || !connections.ssh_connection) connections = await ssh_connection_promise(`${from_name}::check_ssh_connection`);
			return resolve(connections);
		} catch(err){
			return reject(`check_ssh_connection::${err}`);
		}
	})
}

/**
 *
 */
async function check_both_connections(connections, from_name='check_both_connections'){
	const ssh_connection = await check_ssh_connection(connections.ssh_connection, `${from_name}::check_both_connections`);
	const sftp_connection = await check_sftp_connection(connections.sftp_connection, `${from_name}::check_both_connections`);
	return {ssh_connection, sftp_connection};
}


/*
*	sftp_connection_promise()
* 		return a sFTP connection promise
*/
async function sftp_connection_promise(from_name='sftp_connection_promise') {
	return new Promise(async (resolve, reject) => {
		let connections;
		try {
			connections = await ssh_connection_promise(`${from_name}::sftp_connection_promise`);
			connections.ssh_connection.sftp( (err, sftp_connection) => {
				if(err) return reject(`sftp_connection_promise::${err}`);

				connections.sftp_connection = _override_connection(sftp_connection, true, from_name);
				return resolve(connections);
			});
		}catch(err){
			close_connections(connections);
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
function _override_connection(connection, is_sftp=false, from_name='_override_connection'){

	// create symbol and save on connections array
	const symbol = Symbol();
	connection.symbol = symbol;

	// make sure we don't have more than 5 connections
	if(connections.length > 5) {
		connection.end();
		throw 'Too many connections!';
	}

	connections.push({symbol, connection});
	connection.is_sftp = is_sftp;
	connection.from_name = from_name;
	console.log(`open connection for ${is_sftp ? 'SFTP' : 'SSH'} from ${from_name}...`);

	// save old end function
	const end_connection = connection.end;

	// override end function
	connection.end = function(){
		console.log(`close connection for ${connection.is_sftp ? 'SFTP' : 'SSH'} from ${connection.from_name} ...`);

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
	close_connections,
	check_ssh_connection,
	check_sftp_connection,
	check_both_connections
};