const Promise = require("bluebird");
const ProgressBar = require('progress');

let barObject;

/**
 * creates a gauge animation
 */
function createProgress(numberOfFiles){
	barObject = new ProgressBar(':bar :percent :token1', { 
		total: numberOfFiles,
		clear: true,
		complete: '#',
		width: 20
	});
}

/**
 * updates pulse animation
 * @param {string} fileName
 */
function updateProgress(fileName){
	if(!barObject) Promise.reject(new Error('updateProgress::cannot update progress bar without creating it first'));
	barObject.tick({token1: fileName});
}

module.exports = {createProgress, updateProgress};