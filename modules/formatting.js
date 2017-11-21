const config = require('./../config');

/******************************************************************
*	format_remote_path(local_path, slice_number, repo)
* 		formats a local file path for remote path
******************************************************************/
function format_remote_path(local_path, slice_number, repo) {

	// change capitalization of UD if needed
	if(local_path.match(/\\ud_api\\/)){
		local_path = local_path.replace('ud_api', 'UD_api');
	} else if(local_path.match(/\\ud\\/)){
		local_path = local_path.replace('\\ud\\', '\\UD\\');
	}

	// get remote path from local path
	const remote_path = local_path.split('\\').slice(slice_number).join('/');

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


/******************************************************************
*	format_paths(changed_files, hypnotoad)
* 		formats local and remote file paths for sFTP
******************************************************************/
module.exports.format_paths = function(changed_file) {

	// get path and repo name
	let repo = changed_file.repo;
	let local_path = changed_file.local_path;
	let remote_path;

	// create remote path
	if('ud' === repo) remote_path = format_remote_path(local_path, 4, repo);
	else if('wam_cron' === repo) remote_path = format_remote_path(local_path, 5, repo);
	else if('aqe_cron' === repo) remote_path = format_remote_path(local_path, 3, repo);
	else if(['modules', 'external_modules', 'dev_scripts'].includes(repo)) remote_path = format_remote_path(local_path, 2, repo);
	
	else if( ['ud_api', 'aqe_api', 'wam_api', 'teamdb_ember'].includes(repo) ) { 
		remote_path = format_remote_path(local_path, 1, repo);	
	} else if( ['aqe', 'wam', 'teamdb', 'upm', 'tqi', 'ud_ember', 'teamdbapi'].includes(repo) ) { 
		remote_path = format_remote_path(local_path, 3, repo);
	}

	// return local/remote paths generated
	return [local_path, remote_path];
}


/*
*	format_files(all_files_data)
* 		makes sure file paths have proper folder structure for Windows/UNIX
*/
module.exports.format_files = function(all_files_data) {
	return all_files_data.map( file => {
		return {
			remote_path: file.remote_path.replace(/\\/g, '/'),
			local_path: file.local_path.replace(/\/|\\/g, '\\'),
			base_path: file.base_path.replace(/\\/g, '/'),
			repo: file.repo
		};
	});
}


module.exports.formatServerStdOut = function(data){
	data = `- ${data}`;
	data = data.replace(/(\r\n|\n|\r)/gm,"");
	return data;
}