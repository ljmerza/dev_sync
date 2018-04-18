

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
 * @param {number} number_of_chunks
 */
function chunk_files({files, number_of_chunks=8}){

	const chunk_length = parseInt(files.length / number_of_chunks);

	// if we have less then chunk_size then just use one chunk else
	// split up all files to upload multiple files at once
	let file_chunks;
	if(chunk_length == 0){
		file_chunks = [files];
	} else {
		file_chunks = chunk(files, chunk_length);
	}

	return [file_chunks, file_chunks.length, 0]
}

/**
 * async compatible for each looping
 */
async function async_for_each(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array)
	}
}

module.exports = {chunk, chunk_files, async_for_each};
