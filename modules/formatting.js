const config = require('./../config');
const { join, dirname } = require('path');

// what is the folder depth of the base path to all watched files?
const basePathDepth = join(__dirname, '../..').split('\\').length-1;

/**
 * formats a local file path for remote path
 * @param {string} localPath
 * @param {integer} sliceNumber
 * @param {string} repo
 */
function formatRemotePath({localPath, sliceNumber, repo}) {

	// change capitalization of UD if needed
	if(localPath.match(/\\ud_api\\/)){
		localPath = localPath.replace('ud_api', 'UD_api');
	} else if(localPath.match(/\\ud\\/)){
		localPath = localPath.replace('\\ud\\', '\\UD\\');
	}
	

	// get remote path from local path
	const remotePath = localPath.split('\\').slice(sliceNumber+basePathDepth).join('/');

	// return full remote path based on repo type
	if(repo.match(/cron/)){
		return `${config.remoteBase}/crons/${repo}/${remotePath}`;

	} else if (['modules', 'external_modules', 'dev_scripts'].includes(repo)) {
		// if modules repo
		return `${config.remoteBase}/includes/${remotePath}`;

	} else if (repo === 'ud_ember') {
		// if modules repo
		return `${config.remoteBase}/www/UD_ember/${remotePath}`;

	} else if (repo === 'teamdbapi') {
		// if modules repo
		return `${config.remoteBase}/www/teamdbapi/${remotePath}`;

	} else {
		// else any other repo
		return `${config.remoteBase}/www/${remotePath}`;
	}	
}

/**
 * formats local and remote file paths for sFTP
 * @param {object} changedFile
 */
function formatPaths(changedFile) {

	 // how many folders to strip from file path from beginning
	let sliceNumber = 1;

	// these repos require the object path to be stripped to concat with the base path
	if(['modules', 'external_modules', 'dev_scripts'].includes(changedFile.repo))
		sliceNumber = 2;
	else if( ['aqe', 'wam', 'teamdb', 'upm', 'tqi', 'ud_ember', 'udember', 'teamdbapi', 'aqe_cron', 'ud_cron'].includes(changedFile.repo) )
		sliceNumber = 3;
	else if(['ud'].includes(changedFile.repo))
		sliceNumber = 4;
	else if(['wam_cron'].includes(changedFile.repo))
		sliceNumber = 5;

	const remotePath = formatRemotePath({localPath:changedFile.localPath, sliceNumber, repo:changedFile.repo});
	return [changedFile.localPath, remotePath];
}


/**
 * makes sure file paths have proper folder structure for Windows/UNIX
 * @param {Array<object>} allFilesData
 */
function formatFiles(allFilesData) {
	return allFilesData.map( file => {
		file.remotePath = file.remotePath.replace(/\\/g, '/');
		file.localPath = file.localPath.replace(/\//g, '\\');
		file.basePath = file.basePath.replace(/\\/g, '/');
		return file;
	});
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
 * creates remote and local absoluate paths when syncing an entire repo
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

function _generateAbsoluteLocalPath({localFilePath}){
	return join(__dirname, '..',`${localFilePath}`)
		.replace(/\//g,'\\');
}


function filterNodeAndGitFiles({files}){
	return files.filter(file => !/\\\.git\\|\\node_modules\\|\\tmp\\|\\bower_components\\/.test(file));
}

module.exports = {
	formatPaths, formatFiles, filterNodeAndGitFiles,
	formatServerStdOut, getAbsoluteRemoteAndLocalPaths,
	stripRemotePathForDisplay, formatLogFiles
};
