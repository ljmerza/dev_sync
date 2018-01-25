const config = require('./../config');
const path = require('path');

// what is the folder depth of the base path to all watched files?
const base_path_depth = path.join(__dirname, '../..').split('\\').length-1;

/**
 * formats a remote path to it's full remote path based on the repo
 * @param {string} local_path
 * @param {integer} slice_number
 * @param {string} repo
 */
function _format_remote_path(local_path, repo, slice_number) {

	// change capitalization of UD if needed for remote path
	if(local_path.match(/\\ud_api\\/)){
		local_path = local_path.replace('ud_api', 'UD_api');
	} else if(local_path.match(/\\ud\\/)){
		local_path = local_path.replace('\\ud\\', '\\UD\\');
	}
	
	// get partial remote path from local path
	const remote_path = local_path.split('\\').slice(slice_number+base_path_depth).join('/');

	// return full remote path based on repo type
	if(repo.match(/cron/)){
		return `${config.remote_base}/crons/${repo}/${remote_path}`;

	} else if (['modules', 'external_modules', 'dev_scripts'].includes(repo)) {
		// if modules repo
		return `${config.remote_base}/includes/${remote_path}`;

	} else if (repo === 'ud_ember') {
		// if modules repo
		return `${config.remote_base}/www/UD_ember/UD/${remote_path}`;

	} else if (repo === 'teamdbapi') {
		// if modules repo
		return `${config.remote_base}/www/teamdbapi/${remote_path}`;

	} else {
		// else any other repo
		return `${config.remote_base}/www/${remote_path}`;
	}	
}

/**
 * formats local and remote file paths for a repo
 * @param {object} changed_file
 * @returns {string} modified remote path
 */
module.exports.format_remote_path = function(changed_file) {
	// create remote path
	const file_path_strip = get_path_strip_number(changed_file.repo);
	return _format_remote_path(changed_file.local_path, changed_file.repo, file_path_strip);
}

/**
 * gets the depth that needs to be stripped from a path
 * to concat the base and remote path to get the full remote path
 * @params {string} the name of the repo
 * @returns {integer} the depth to be stripped fromt the path
 */
function get_path_strip_number(repo){
	if(['modules', 'external_modules', 'dev_scripts'].includes(repo))
		return 2;
	else if( ['aqe', 'wam', 'teamdb', 'upm', 'tqi', 'ud_ember', 'teamdbapi', 'aqe_cron', 'ud_cron'].includes(repo) )
		return 3;
	else if(['ud'].includes(repo)) 
		return 4;
	else if(['wam_cron'].includes(repo)) 
		return 5;
	else
		return 1;
}


/**
 * makes sure file paths have proper folder structure for Windows/UNIX
 * @param {Array<object>} all_files array of files with remote, base, local paths
 * @returns {Array<object>} array of objects with unix/windows modified paths
 */
module.exports.format_files = function(all_files) {
	return all_files.map( file => {
		file.remote_path = file.remote_path.replace(/\\/g, '/');
		file.local_path = file.local_path.replace(/\//g, '\\');
		file.base_path = file.base_path.replace(/\\/g, '/');
		return file;
	});
}

/**
 * formats the output from executing a command through ssh
 * @param {string} data the data string to be formatted
 */
module.exports.format_output = function(data){
	data = `- ${data}`;
	data = data.replace(/(\r\n|\n|\r)/gm,"");
	return data;
}

/**
 * creates remote, local, and base paths when syncing an entire repo
 * @param {Array<string>} files the files to modify paths of
 * @param {string} local_path the unmodified local path of the repo
 * @param {string} remote_path the unmodified remote path of the repo
 * @returns an Array of files with modified remote, local, and base paths
 */
module.exports.format_repo_paths = function(files, local_path, remote_path){
	// get the folder depth of the local path
	let depth_local_path = local_path.split('/').length;

	// format local/remote file paths
	return files.map(file => {
		// get base of remote path
		let base_remote_path = file.split('\\').splice(depth_local_path).join('\\');

		// make local and remote paths
		local_path =  path.join(__dirname, '..',`${local_path}\\${base_remote_path}`).replace(/\\/g,"/");
		remote_path = `${remote_path}/${base_remote_path}`;

		// finally make base path
		let base_path = path.dirname(remote_path);			

		return {remote_path, local_path, base_path};
	});
}