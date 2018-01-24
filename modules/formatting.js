const config = require('./../config');
const path = require('path');

// what is the folder depth of the base path to all watched files?
const base_path_depth = path.join(__dirname, '../..').split('\\').length-1;

/**
 * formats a local file path for remote path
 * @param {string} local_path
 * @param {integer} slice_number
 * @param {string} repo
 */
function format_remote_path(local_path, slice_number, repo) {

	// change capitalization of UD if needed
	if(local_path.match(/\\ud_api\\/)){
		local_path = local_path.replace('ud_api', 'UD_api');
	} else if(local_path.match(/\\ud\\/)){
		local_path = local_path.replace('\\ud\\', '\\UD\\');
	}
	

	// get remote path from local path
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
 * formats local and remote file paths for sFTP
 * @param {object} changed_file
 */
module.exports.format_paths = function(changed_file) {

	// get path and repo name
	let repo = changed_file.repo;
	let local_path = changed_file.local_path;
	let remote_path;
	let file_path_strip = 1; // how many folders to strip from file path from beginning

	// these repos require the object path to be stripped to concat with the base path
	if(['modules', 'external_modules', 'dev_scripts'].includes(repo))
		file_path_strip = 2;
	else if( ['aqe', 'wam', 'teamdb', 'upm', 'tqi', 'ud_ember', 'teamdbapi', 'aqe_cron', 'ud_cron'].includes(repo) )
		file_path_strip = 3;
	else if(['ud'].includes(repo)) 
		file_path_strip = 4;
	else if(['wam_cron'].includes(repo)) 
		file_path_strip = 5;

	// create remote path
	remote_path = format_remote_path(local_path, file_path_strip, repo);

	// return local/remote paths generated
	return [local_path, remote_path];
}


/**
 * makes sure file paths have proper folder structure for Windows/UNIX
 * @param {Array<object>} all_files_data
 */
module.exports.format_files = function(all_files_data) {
	return all_files_data.map( file => {
		file.remote_path = file.remote_path.replace(/\\/g, '/');
		file.local_path = file.local_path.replace(/\//g, '\\');
		file.base_path = file.base_path.replace(/\\/g, '/');
		return file;
	});
}

/**
 * formats the output from executing a command through ssh
 * @param {string} 
 */
module.exports.formatServerStdOut = function(data){
	data = `- ${data}`;
	data = data.replace(/(\r\n|\n|\r)/gm,"");
	return data;
}

/**
 * creates remote and local paths when syncing an entire repo
 * @param {object} files
 * @param {Array} local_path_folders
 * @param {string} original_local_path
 * @param {string} original_remote_path
 * @param {string} repo
 */
module.exports.transferRepoFormatPaths = function({files, local_path_folders, original_local_path, original_remote_path, repo}){

	// format local/remote file paths
	return files.map(file => {

		// create local/remote file absolute paths
		let remote_path = file.split('\\').splice(local_path_folders.length).join('\\');
		let local_path =  path.join(__dirname, '..',`${original_local_path}\\${remote_path}`).replace(/\\/g,"/");
		remote_path = `${original_remote_path}/${remote_path}`;
		let base_path = path.dirname(remote_path);			

		return {remote_path, local_path, base_path, repo, action: 'sync', sync_repo:true};
	});
}