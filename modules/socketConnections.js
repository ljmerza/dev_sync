let io = require('socket.io').listen(8000);


let sockets = [];
let socketId = 0;

io.on('connection', socket => { 

	// tell client what socket id they are
	socket.emit('socketId', socketId++);

	// app will identify itself and give id that it was given
	socket.on('identify', message => {
        console.log(`connected to ${message.name} with id ${message.id}`);
        // push new socket onto array
		sockets.push({name: message.name, id: message.id, socket});
    });

    // which app are we dis/connecting to?
    socket.on('reloaded', message => {
        console.log(`disconnected to ${message.name} with id ${message.id}`);
        // filter out disconnected socket id/name
        sockets = sockets.filter( app => { app.id !== message.id });
    });
});



/**
 * reloads all applications of a particular name connected to a socket
 */
module.exports.findReloadSockets = function(changedFiles) {
	let restartAppNames = [];

	return new Promise( (resolve, reject) => {

		// if we want to live reload browser and sockets exists then send signal to reload
		if(sockets.length){

			changedFiles.forEach( changedFile => {

				// normalize all repo names to lower case
				changedFile.repo = changedFile.repo.toLowerCase();

				// get all names of apps then had files changes
				if( !restartAppNames.includes(changedFile.repo) ){
					restartAppNames.push(changedFile.repo);
				}
			});

			// try to reload all apps then need it then return when done
			reloadApps(restartAppNames)
			.then( () => { return resolve(); })
			.catch( err => { return reject(`findReloadSockets::${err}`); });
			
		} else {
			// we are done so break connection and return
			return resolve();
		}
	});
}

/**
 * 
 */
module.exports.reloadApps = function(restartAppNames) {
	return new Promise( resolve => {
		// reload all other apps
		restartAppNames.forEach( appName => {

			// if modules or ud_api repo then restart all apps
		    if(['modules', 'ud_api'].includes(appName)){
		    	reloadAllSockets();
		    } else {
		    	reloadAppSockets(appName).then( () => { return resolve(); });
		    }				
		});
	});
}

/**
 * reloads all applications of a particular name connected to a socket
 */
module.exports.reloadAppSockets = function(appName) {
	let appSockets = sockets.filter( app =>  app.name.toLowerCase() === appName.toLowerCase() );

	return new Promise( resolve => {
		appSockets.forEach( app => {
			app.socket.emit('reload', `restarting ${app.name} with socket id ${app.id}`);
		});
		return resolve();
	});
}

/**
 * reloads all applications of a particular name connected to a socket
 */
module.exports.reloadAllSockets = function() {

	let appSockets = sockets.filter( app =>  app.name === appName );

	return new Promise( resolve => {
		appSockets.forEach( app => {
			app.socket.emit('reload', `restarting ${app.name} with socket id ${app.id}`);
		});
		return resolve();
	});
}