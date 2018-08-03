const SSH2 = require('ssh2');
const fs = require('fs');

const config = require('./../config');
const {asyncForEach} = require('./tools');

let ppkFile;
const debug = false;

// try to get PPK file
try {
	ppkFile = fs.readFileSync(config.ppkFilePath);
} catch(err) {
	throw Error(`No ppk file found: ${err}`);
}

// keeps track of all connections for exiting application
connections = [];

/**
 * return a ssh connection promise
 */
async function sshConnectionPromise(fromName='sshConnectionPromise') {
	return new Promise(async (resolve, reject) => {
		// create ssh object
		let sshConnection = await overrideConnection(new SSH2(), false, fromName);

		// connect to server
		sshConnection.connect({
			host: config.host,
			port: config.port,
			username: config.attuid,
			privateKey: ppkFile
		});

		sshConnection.on('ready', () => {
			resolve({sshConnection});
		});

		sshConnection.on('error', error => {
			reject(error);
		});
	});
}

/**
 *
 */
async function checkSftpConnection(connections, fromName='checkSftpConnection'){
	return new Promise(async (resolve, reject) => {
		try {
			if(!connections || !connections.sftpConnection) {
				connections = await sftpConnectionPromise(`${fromName}::checkSftpConnection`);
			}
			return resolve(connections);
		} catch(err){
			return reject(`checkSftpConnection::${err}`);
		}
	})
}

/**
 *
 */
async function checkSshConnection(connections, fromName='checkSshConnection'){
	return new Promise(async (resolve, reject) => {
		try {
			if(!connections || !connections.sshConnection) {
				connections = await sshConnectionPromise(`${fromName}::checkSshConnection`);
			}
			return resolve(connections);
		} catch(err){
			return reject(`checkSshConnection::${err}`);
		}
	})
}

/**
 *
 */
async function checkBothConnections(connections, fromName='checkBothConnections'){
	const {sshConnection} = await checkSshConnection(connections, `${fromName}::checkBothConnections`);
	const {sftpConnection} = await checkSftpConnection(connections, `${fromName}::checkBothConnections`);
	return {sshConnection, sftpConnection};
}


/*
*	sftpConnectionPromise()
* 		return a sFTP connection promise
*/
async function sftpConnectionPromise(fromName='sftpConnectionPromise') {
	return new Promise(async (resolve, reject) => {
		let connections;
		try {
			connections = await sshConnectionPromise(`${fromName}::sftpConnectionPromise`);
			connections.sshConnection.sftp(async (err, sftpConnection) => {
				if(err) return reject(`sftpConnectionPromise::${err}`);
				connections.sftpConnection = await overrideConnection(sftpConnection, true, fromName);
				return resolve(connections);
			});
		} catch(err){
			closeConnections(connections);
			return reject(`sftpConnectionPromise::${err}`);
		}
	});
}

/*
* adds a symbol id to a connection object and pushes
* to global connections array to keep track of open connections
* overrides the end function to update the open connections array
*/
async function overrideConnection(connection, isSftp=false, fromName='overrideConnection'){
	return new Promise(async (resolve, reject) => {
		// create symbol and save on connections array
		const symbol = Symbol();
		connection.symbol = symbol;
		connections.push({symbol, connection});
		
		// make sure we don't have more than 5 connections
		if(debug && connections.length > 5) {
			console.log('Too Many Connections!');
			await killAllConnections();
		}

		// save internal properties and log what we are doing
		connection.isSftp = isSftp;
		connection.fromName = fromName;
		if(debug) console.log(`open connection for ${isSftp ? 'SFTP' : 'SSH'} from ${fromName}`);

		// override end function
		const endConnection = connection.end;
		connection.end = async function(){
			if(debug) console.log(`close connection for ${connection.isSftp ? 'SFTP' : 'SSH'} from ${connection.fromName}`);

			// call end to connection 
			endConnection.apply(this);
			// filter out connection from array
			connections = connections.filter(connects => connection.symbol !== connects.symbol);
		}

		// return the modified connection object
		return resolve(connection);
	});
}

/**
 * ends any passed in connections
 */
async function closeConnections(connection){
	if(connection && connection.sshConnection) connection.sshConnection.end();
	if(connection && connection.sftpConnection) connection.sftpConnection.end();
	if(connection && connection.end) connection.end();
} 

/**
 * kills all open connections (that are tracked)
 */
async function killAllConnections(){
	console.log('killing all connections!');
	await asyncForEach(connections, async connObject =>{
		await connObject.connection.end();
		console.log('killed connection!');
	});
}

 module.exports = {
 	sshConnectionPromise, checkSftpConnection,
	checkSshConnection, checkBothConnections,
	sftpConnectionPromise, overrideConnection,
	closeConnections, killAllConnections
 };