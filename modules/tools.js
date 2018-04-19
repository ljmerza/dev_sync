

/**
 * splits an array up into chunks
 * @param {integer} length
 * @return {Array<Array<any>>} an array of array chunks
 */
function chunk(arr, n) {
	return Array(Math.ceil(arr.length/n))
		.fill()
		.map((_,i) => arr.slice(i*n,i*n+n));
}

/**
 * takes an array and breaks it up into an array of arrays
 * @param {object} files
 * @param {number} numberOfChunks
 */
function chunkFiles({files, numberOfChunks=8}){
	const chunkLength = parseInt(files.length / numberOfChunks);

	// if we have less then chunkLength then just use one chunk else
	// split up all files to upload multiple files at once
	if(chunkLength == 0){
		return [files];
	}

	return chunk(files, chunkLength);
}

/**
 * async compatible for each looping
 */
async function asyncForEach(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array)
	}
}

module.exports = {chunk, chunkFiles, asyncForEach};