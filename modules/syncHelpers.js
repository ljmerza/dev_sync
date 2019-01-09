const {createReadStream} = require('fs');
const path = require('path');

const recursive = require("recursive-readdir");
const Promise = require("bluebird");
const streamEqual = require('stream-equal');

const {
	checkSftpConnection, closeConnections,
	checkBothConnections, sftpConnectionPromise
} = require("./connections");

const {
	executeRemoteCommand, deleteRemoteFile,
	makeRemoteDirectory, deleteRemoteDirectory,
	getRemoteFileTree
} = require('./remoteCommands');

const { getAbsoluteRemoteAndLocalPaths, excludedLocalFolders } = require('./formatting');

const {createProgress, updateProgress} = require('./progress');
const {chunkFiles, asyncForEach} = require('./tools');


/**
 * syncs all files to server
 * @param {object} remotePath
 */
async function syncObjects(allFilesData) {
	return new Promise(async (resolve, reject) => {
		try {
			const result = await syncChunks(allFilesData, 8, syncObject, 'syncObjects', true);
			return resolve(result);
		} catch(error){
			return reject(`syncObjects::${error}`); 
		}
	});
}

/**
 * logs files processed
 * @param {object} allFilesData
 */
async function processSyncedObjects(result){
	// then log files synced
	if(result.length > 0) {
		const multiple = result.length == 1 ? '' : 's';
		console.log(`${result.length} object${multiple} processed:`);
		// if not from a repo sync then show all files synced
		if(result.length > 0 && !result[0].syncRepo){
			result.forEach(file => console.log(`	${file.action} -> ${file.file}`));
		}
	}
}

/**
 * deletes a remote folder or file
 * @param {string} remotePath
 */
async function deleteRemote(remotePath){
	return new Promise(async (resolve, reject) => {
		try {
			await executeRemoteCommand(`rm -rf ${remotePath}`);
			return resolve();
		} catch(err){
			return reject(`deleteRemote::${err}`);
		}
	});
}

/**
 * syncs an object to the remote server
 * @param {object} file
 * @param {ssh connection} connection
 */
async function syncObject({file, connections, fromName}) {
	return new Promise(async (resolve, reject) => {
		try {
			let response = '';

			switch(file.action){
				case 'change':
				case 'sync':
				case 'add':
					response = await syncLocalToRemote({file, connections, fromName: `${fromName}::syncObject`});
					break;
				case 'unlink':
					response = await deleteRemoteFile({remotePath:file.absoluteRemotePath, connections, fromName});
					break;
				case 'addDir':
					response = await makeRemoteDirectory(file.remoteBasePath, connections, fromName);
					break;
				case 'unlinkDir':
					response = await deleteRemoteDirectory(file.remoteBasePath, connections, fromName);
					break;
			}

			return resolve({file:response, action: file.action});
		} catch(error){
			return reject(`syncObject::${error}`);
		}
	});
	
}

/**
 * syncs a file to the remote server
 * @param {object} file
 * @param {ssh connection} connection
 */
async function syncLocalToRemote({file, connections, fromName='syncLocalToRemote'}){
	return new Promise(async (resolve, reject) => {
		let closeConnection = !connections;
		try {
			connections = await checkBothConnections(connections);
			await makeRemoteDirectory(file.remoteBasePath, connections);

			const result = await setRemoteFile({
				absoluteRemotePath: file.absoluteRemotePath, 
				absoluteLocalPath: file.absoluteLocalPath, 
				localFilePath: file.localFilePath, 
				connections, 
				fromName
			});

			return resolve(result);
		} catch(err) {
			if(closeConnection) closeConnections(connections);
			return reject(`syncLocalToRemote::${err}::${file.localPath}`);
		}
	});
}

/**
 * compares a local and remote file
 * @param {string} absoluteLocalPath 
 * @param {string} absoluteRemotePath 
 * @param {string} connections 
 * @return {boolean} are the files the same?
 */
async function needsSync({absoluteLocalPath, absoluteRemotePath, connections}){
	return new Promise(async (resolve, reject) => {
		let closeConnection = !connections;
		try {
			connections = await checkSftpConnection(connections);
			const isEqual = await areFileSteamsEqual({
				connections,
				absoluteLocalPath: absoluteLocalPath, 
				absoluteRemotePath: absoluteRemotePath, 
			});

			if(closeConnection) closeConnections(connections);
			return resolve(!isEqual);

		} catch(err) {
			if(closeConnection) closeConnections(connections);
			return reject(`needsSync::${err}`);
		}
	});
}

/**
 * upload a repo to the server
 * @param {string} localPath
 * @param {string} remoteBasePath
 * @param {string} repo
 */
async function transferRepo({localPath, remoteBasePath, repo}) {
	return new Promise( async (resolve, reject) => {
		try {

			// get local and remote files list
			console.log(`Getting ${repo} local file list at ${localPath}`);
			const localFiles = await getLocalFileTree({localPath});

			// format local files to get local and remote absolute paths
			const formattedFiles = getAbsoluteRemoteAndLocalPaths({ files: localFiles, remoteBasePath, localPath, repo});

			// find any remote files that need deleting
			console.log(`Getting ${repo} remote file list at ${remoteBasePath}`);
			const remoteFiles = await getRemoteFileTree({path:remoteBasePath});
			const absoluteRemoteFiles = formattedFiles.map(file => file.absoluteRemotePath);
			const remoteFilesToDelete = remoteFiles.filter(file => !absoluteRemoteFiles.includes(file));

			// if any files to delete then delete them now
			if(remoteFilesToDelete.length > 0){
				const plural = remoteFilesToDelete.length === 1 ? '' : 's';
				console.log(`Deleting ${remoteFilesToDelete.length} extra remote file${plural} from ${repo}...`);
				await bulkDeleteRemoteFiles({remoteFilesToDelete});
			}
			
			// filter out any files that already are synced
			console.log(`Comparing ${repo} files...`);
			const filesToSync = await findFilesToSync({formattedFiles});

			// checking if any files need to be synced
			if(filesToSync.length > 0){
				const plural = filesToSync.length === 1 ? '' : 's';
				console.log(`Syncing ${filesToSync.length} file${plural} to ${repo}:`);
				filesToSync.forEach(file => console.log(`	${file.localFilePath}`));

				const filedSynced = await syncObjects(filesToSync);
				return resolve(filedSynced);
			} else {
				console.log(`All ${repo} files already synced!`);
				return resolve();
			}
			
		} catch(err){
			return reject(`transferRepo::${err}`);
		}  
	});	
}

/**
 *
 * @param {Array<Object>} formattedFiles
 */
async function findFilesToSync({formattedFiles}){
	let filesToSync = [];
	let processedChunks = 0;

	return new Promise((resolve, reject) => {

		const fileChunks = chunkFiles({files:formattedFiles, numberOfChunks: 8});
		fileChunks.forEach(async chunkOfFiles => {
			let connections;
			try {
				connections = await sftpConnectionPromise('syncChunks');

				await asyncForEach(chunkOfFiles , async file => {
					const isEqual = await areFileSteamsEqual({
						connections,
						absoluteLocalPath:file.absoluteLocalPath, 
						absoluteRemotePath:file.absoluteRemotePath
					});

					if(!isEqual) filesToSync.push(file);
				});
				
				closeConnections(connections);
				if(++processedChunks === fileChunks.length){
					return resolve(filesToSync);
				};

			} catch(err){
				closeConnections(connections);
				return reject(`findFilesToSync::${err}`);
			}
		});
		
	});
}

/**
 *
 */
async function chunkOperation({files, operation, operationArgs={}}){
	let filesToSync = [];
	let processedChunks = 0;

	return new Promise((resolve, reject) => {
		try {
			const fileChunks = chunkFiles({files, numberOfChunks: 8});

			fileChunks.forEach(async chunkOfFiles => {
				let connections = await sftpConnectionPromise('chunkOperation');

				await asyncForEach(chunkOfFiles , async file => {
					await operation({file, connections, ...operationArgs});
				});
				
				closeConnections(connections);
				if(++processedChunks === fileChunks.length){
					return resolve(filesToSync);
				};
			});

		} catch(err){
			return reject(`chunkOperation::${err}`);
		}
	});
}

async function bulkDeleteRemoteFiles2({remoteFilesToDelete}){
	return await chunkOperation({files:remoteFilesToDelete, operation:deleteRemoteFile});
}

/**
 *
 * @param {Array<string>} remoteFilesToDelete
 */
async function bulkDeleteRemoteFiles({remoteFilesToDelete}){
	let filesToSync = [];
	let processedChunks = 0;

	return new Promise((resolve, reject) => {
		try {
			const fileChunks = chunkFiles({files:remoteFilesToDelete, numberOfChunks: 8});

			fileChunks.forEach(async chunkOfFiles => {
				let connections = await sftpConnectionPromise('bulkDeleteRemoteFiles');

				await asyncForEach(chunkOfFiles , async file => {
					await deleteRemoteFile({remotePath:file, connections, fromName:'bulkDeleteRemoteFiles'});

				});
				
				closeConnections(connections);
				if(++processedChunks === fileChunks.length){
					return resolve(filesToSync);
				};
			});

		} catch(err){
			return reject(`bulkDeleteRemoteFiles::${err}`);
		}
	});
}

/**
 *
 * @param {string} localPath
 * @param {string} remoteBasePath
 * @param {string} repo
 */
async function getLocalFileTree({localPath}){
	return new Promise((resolve, reject) => {
		recursive(localPath, [ignoreFunc], async (err, files) => {
			if(err) return reject(`getLocalFileTree::${err}`);
			return resolve(files);
		});
	})
}

/**
 * ignore local directories
 * @param {*} file 
 * @param {*} stats 
 */
function ignoreFunc(file, stats) {
	return stats.isDirectory() && (excludedLocalFolders.includes(path.basename(file)));
}

/**
 * takes two file streams and compares them
 */
async function areFileSteamsEqual({absoluteLocalPath, absoluteRemotePath, connections}){
	return new Promise(async (resolve, reject) => {
		let closeConnection = !connections;

		try {
			connections = await checkSftpConnection(connections, 'areFileSteamsEqual');

			const readStreamLocal = createReadStream(absoluteLocalPath);
			const readStreamRemote = connections.sftpConnection.createReadStream(absoluteRemotePath);

			streamEqual(readStreamLocal, readStreamRemote, (err, equal) => {
				if(closeConnection) closeConnections(connections);

				if(err) {
					err = `${err}`;
					if(/No such file/.test(err)) return resolve(false);
					return reject(`areFileSteamsEqual::${err}`);
				}

				return resolve(equal);
			});
		} catch(err){
			if(closeConnection) closeConnections(connections);
			return reject(`areFileSteamsEqual::${err}`)
		}
		
	});
}

/**
 * gets a remote file and syncs it to a local file
 */
async function getRemoteFile({absoluteRemotePath, absoluteLocalPath, localBasePath, connections}){
	return new Promise(async (resolve, reject) => {
		let closeConnection = !connections;
		try {

			connections = await checkSftpConnection(connections, 'getRemoteFile');
			connections.sftpConnection.fastGet(absoluteRemotePath, absoluteLocalPath, err => {
				if(err) return reject(`fastGet getRemoteFile::${err}`);
				if(closeConnection) closeConnections(connections);
				return resolve(`synced ${localBasePath} from remote`);
			});
		} catch(err){
			if(closeConnection) closeConnections(connections);
			return reject(`getRemoteFile::${err}`);
		}
	});
}

/**
 * gets a local file and syncs it to remote
 */
async function setRemoteFile({absoluteRemotePath, absoluteLocalPath, localFilePath, connections, fromName='setRemoteFile'}){
	return new Promise(async (resolve, reject) => {
		let closeConnection = !connections;

		try {
			connections = await checkSftpConnection(connections, 'setRemoteFile');
			connections.sftpConnection.fastPut(absoluteLocalPath, absoluteRemotePath, err => {
				if (err) return reject(`${fromName}::setRemoteFile::fastPut::${err}::${absoluteLocalPath}->${absoluteRemotePath}`);
				if(closeConnection) closeConnections(connections);
				return resolve(localFilePath);
			});

		} catch(err){
			if(closeConnection) closeConnections(connections);
			return reject(`setRemoteFile::${fromName}::${err}`);
		}
	});
}

/**
 * syncs a file from server to host
 * @param {Object} file contains absoluteRemotePath, absoluteLocalPath, remoteBasePath, and localBasePath properties
 * @param {Object} sftpConnection optional connection to use (will create/close its own if not given)
 */
async function syncRemoteToLocal({file, connections, fromName=''}) {
	return new Promise(async (resolve, reject) => {
		const {absoluteRemotePath, absoluteLocalPath, localBasePath, remoteBasePath} = file;

		let closeConnections = !connections;
		connections = await checkBothConnections(connections, 'syncRemoteToLocal');

		try {

			let syncedMessage = '';
			const needSync = await needsSync({absoluteLocalPath, absoluteRemotePath, connections});
			if(needSync) syncedMessage = await getRemoteFile({absoluteRemotePath, absoluteLocalPath, localBasePath, connections});

			if(closeConnections) await closeConnections(connections);
			return resolve(syncedMessage);

		} catch(err){
			if(closeConnections) await closeConnections(connections);
			return reject(`syncRemoteToLocal::${err}`);
		}	
	});
}

/**
 * breaks an array of files into chunks and syncs them from remote to local
 * @param {Array<Object>} files
 * @param {number} numberOfChunks
 * @param {Object} sftpConnection
 */
async function syncChunks(files, numberOfChunks, syncFunction, fromName, showProgress=false){
	return new Promise(async (resolve, reject) => {

		try {
			if(showProgress) createProgress(files.length);
			let syncResults = [];
			let filesUploaded = 0;
			let processedChunks = 0;

			const fileChunks = chunkFiles({files, numberOfChunks});

			fileChunks.forEach(async chunkOfFiles => {

				try {
					let connections = await sftpConnectionPromise('syncChunks');

					await asyncForEach(chunkOfFiles , async file => {
						let message = await syncFunction({file, connections, fromName});
						filesUploaded++;
						if(showProgress) updateProgress(file.localFilePath || file.localBasePath);
						syncResults.push(message);
					});
					
					closeConnections(connections);
					if(++processedChunks === fileChunks.length){
						return resolve(syncResults);
					};
					
				} catch(err) {
					closeConnections(connections);
					return reject(`fileChunks syncChunks::${err}`);
				}
				
			});

		} catch(err) {
			return reject(`syncChunks::${err}`);
		}
	});
}

module.exports = {
	syncObjects, processSyncedObjects, deleteRemote, 
	syncObject, syncLocalToRemote, needsSync, transferRepo, 
	findFilesToSync, chunkOperation, bulkDeleteRemoteFiles2, 
	bulkDeleteRemoteFiles, getLocalFileTree, areFileSteamsEqual, 
	getRemoteFile, setRemoteFile, syncRemoteToLocal, syncChunks
}