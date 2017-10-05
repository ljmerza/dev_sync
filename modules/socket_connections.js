var io = require('socket.io').listen(8000);

/***************************************************************** 
* websockets for live reloading
*****************************************************************/


let sockets = [];
let socket_id = 0;

io.on('connection', socket => { 

	// tell client what socket id they are
	socket.emit('socket_id', socket_id++);

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



/******************************************************************************
*	find_reload_sockets(changed_files)
* 		reloads all applications of a particular name connected to a socket
* *****************************************************************************/
function find_reload_sockets(changed_files) {
	let restart_app_names = [];

	return new Promise( (resolve, reject) => {

		// if we want to live reload browser and sockets exists then send signal to reload
		if(sockets.length){

			changed_files.forEach( changed_file => {

				// normalize all repo names to lower case
				changed_file.repo = changed_file.repo.toLowerCase();

				// get all names of apps then had files changes
				if( !restart_app_names.includes(changed_file.repo) ){
					restart_app_names.push(changed_file.repo);
				}
			});

			// try to reload all apps then need it then return when done
			reload_apps(restart_app_names)
			.then( () => { return resolve(); })
			.catch( err => { return reject(`find_reload_sockets::${err}`); });
			
		} else {
			// we are done so break connection and return
			return resolve();
		}
	});
}

/******************************************************************************
*	function reload_apps(restart_app_names)
* 
* *****************************************************************************/
function reload_apps(restart_app_names) {
	return new Promise( resolve => {
		// reload all other apps
		restart_app_names.forEach( app_name => {

			// if modules or ud_api repo then restart all apps
		    if(['modules', 'ud_api'].includes(app_name)){
		    	reload_all_sockets();
		    } else {
		    	reload_app_sockets(app_name).then( () => { return resolve(); });
		    }				
		});
	});
}

/******************************************************************************
*	reload_app_sockets(app_name)
* 		reloads all applications of a particular name connected to a socket
* *****************************************************************************/
function reload_app_sockets(app_name) {
	let app_sockets = sockets.filter( app =>  app.name.toLowerCase() === app_name.toLowerCase() );

	return new Promise( resolve => {
		app_sockets.forEach( app => {
			app.socket.emit('reload', `restarting ${app.name} with socket id ${app.id}`);
		});
		return resolve();
	});
}

/******************************************************************************
*	reload_all_sockets()
* 		reloads all applications of a particular name connected to a socket
* *****************************************************************************/
function reload_all_sockets() {

	let app_sockets = sockets.filter( app =>  app.name === app_name );

	return new Promise( resolve => {
		app_sockets.forEach( app => {
			app.socket.emit('reload', `restarting ${app.name} with socket id ${app.id}`);
		});
		return resolve();
	});
}




module.exports = find_reload_sockets;
