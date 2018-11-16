const config = require('./../config');
const { join, dirname } = require('path');

// what is the folder depth of the base path to all watched files?
const basePath = join(__dirname, '../..');


/**
 * formats local and remote file paths for sFTP
 * @param {object} changedFile
 */
function retrievePaths(changedFile) {

	// get config info for repo
	const localRepoPath = config.localPaths[changedFile.repo];
	const remoteRepoPath = config.remotePaths[changedFile.repo];

	// get local path data
	const absoluteLocalPath = changedFile.localPath;
	const localBasePath = dirname(changedFile.localPath);
	const localFilePath = changedFile.localPath.replace(basePath, '');
	
	// get remote path data
	const fileBasePath = join(basePath, localRepoPath.replace(/\//, '\\'));
	const repoFileBasePath = changedFile.localPath.replace(fileBasePath, '').replace(/\//g, '\\\\');
	const remoteFilePath = repoFileBasePath.replace(fileBasePath, '').replace(/\\/g, '/');

	const absoluteRemotePath = `${config.remoteBase}/${remoteRepoPath}${remoteFilePath}`;
	const remoteBasePath = ['addDir', 'unlinkDir'].includes(changedFile.action) ? absoluteRemotePath : dirname(absoluteRemotePath);
	
	return {localFilePath, absoluteRemotePath, localBasePath, absoluteLocalPath, remoteBasePath};
}

/**
 * formats the output from executing a command through ssh
 * @param {string} 
 */
function formatServerStdOut(data){
	data = `${data}`;
	data = data.replace(/(\r\n|\n|\r)/gm,"");
	return data;
}

/**
 * creates remote and local absolute paths when syncing an entire repo
 * @param {Array<string>} files
 * @param {string} absoluteRemotePath
 * @param {string} localPath
 * @param {string} repo
 */
function getAbsoluteRemoteAndLocalPaths({files, remoteBasePath, localPath, repo}){
	const localPathLength = localPath.split('/').length;

	return files.map(file => {
		let remotePath = file.split('\\').splice(localPathLength).join('/');

		const absoluteRemotePath = `${remoteBasePath}/${remotePath}`;
		const remoteBasePathFile = dirname(absoluteRemotePath);

		const absoluteLocalPath = _generateAbsoluteLocalPath({localFilePath:file});
		const localBasePath = dirname(absoluteLocalPath);			

		return {
			absoluteRemotePath, absoluteLocalPath, 
			localBasePath, repo, action: 'sync', 
			syncRepo:true, remoteBasePath:remoteBasePathFile,
			localFilePath: file.replace(/\\/g, '/').replace(/\.\.\//, '')
		};
	});
}

/**
 * strips the base path of the remote path to console it once synced
 * @param {string} remotePath
 */
function stripRemotePathForDisplay(remotePath){
	return remotePath.split('/').splice(3).join('/');
}

/**
 * 
 * @param {*} logFiles 
 */
function formatLogFiles(logFiles){
	return logFiles.map(file => {
		const relativeFilePath = file[0];
		const remoteFileName = file[1];
		const localFilePath = file[2];

		const absoluteRemotePath = `${config.remoteBase}/${relativeFilePath}/${remoteFileName}`;
		const remoteBasePath = `${config.remoteBase}/${relativeFilePath}`;
		const absoluteLocalPath = _generateAbsoluteLocalPath({localFilePath});

		return {absoluteLocalPath, absoluteRemotePath, localBasePath:localFilePath, remoteBasePath};
	});
}

/**
 * 
 * @param {*} param0 
 */
function _generateAbsoluteLocalPath({localFilePath}){
	return join(__dirname, '..',`${localFilePath}`)
		.replace(/\//g,'\\');
}

/**
 * 
 * @param {*} param0 
 */
function filterNodeAndGitFiles({files}){
	return files.filter(file => !/\\\.git\\|\\node_modules\\|\\tmp\\|\\bower_components\\/.test(file));
}

module.exports = {
	retrievePaths, filterNodeAndGitFiles,
	formatServerStdOut, getAbsoluteRemoteAndLocalPaths,
	stripRemotePathForDisplay, formatLogFiles
};
