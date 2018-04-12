const ProgressBar = require('progress');

/**
 * creates a gauge animation
 * @param {object} object_data
 */
function create_progress(number_of_files){
	bar_object = new ProgressBar(':bar :percent :token1', { 
		total: number_of_files,
		clear: true,
		complete: '#',
		width: 20
	});
}

/**
 * updates pulse animation
 * @param {object} object_data
 */
function update_progress(file_name){
	bar_object.tick({token1: file_name});
}

module.exports = { update_progress, create_progress };