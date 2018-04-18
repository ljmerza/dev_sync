const Promise = require("bluebird");
const ProgressBar = require('progress');

let bar_object;

/**
 * creates a gauge animation
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
	if(!bar_object) Promise.reject(new Error('update_progress::canot update progress bar without creating it first'))
	bar_object.tick({token1: file_name});
}

module.exports = {create_progress, update_progress};