
const keypress = require('keypress');
const Promise = require("bluebird");
const clear = require("cli-clear");

const config = require('./../config');

const {killAllConnections} = require("./connections");
const {resetLogs} = require('./logs');
const {restartApache, executeRemoteCommand, restartHypnotoad} = require('./remoteCommands');
const {transferRepo} = require('./syncHelpers');

// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

let collectedKeys = '';
process.stdin.on('keypress', logKeyPress);

/**
 * 
 * @param {object} ch 
 * @param {object} key
 */
async function logKeyPress(ch, key) {

	// kill process if send SIGTERM
	if (key && key.ctrl && key.name == 'c') {
		await killAllConnections();
		return process.exit();
	}

	// if spacebar then add else trim then add to key presses
	if(ch && key && key.name == 'space') collectedKeys += ch;
	else if(ch) collectedKeys += ch.trim();
	else return;

	// if we hit return then lets see if we have a match
	if(key && key.name === 'return') {

		let localPath = '';
		let remotePath = '';
		let hypnotoad = '';
		let repoName = '';
		let command = '';

		// reset all key presses
		const keyPresses = collectedKeys;
		collectedKeys = '';
		if(!keyPresses) return;

		if ( keyPresses.match(/^killall$/i) ) {
			await killAllConnections();
			return;


		// repos
		} else if ( config.localPaths[keyPresses] ) {
			localPath = `../${config.localPaths[keyPresses]}`;
			remotePath = `${config.remoteBase}/${config.remotePaths[keyPresses]}`;
			repoName = keyPresses;

		// udember and udapi
		} else if ( keyPresses.match(/^udember$/i) ) {
			localPath = `../${config.localPaths.ud_ember}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.ud_ember}`;
			repoName = 'ud_ember';
		} else if ( keyPresses.match(/^udapi$/i) ) {
			localPath = `../${config.localPaths.ud_api}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.ud_api}`;
			repoName = 'ud_api';

		// API repos
		} else if ( keyPresses.match(/^teamdb(_| )?api$/i) ) {
			localPath = `../${config.localPaths.teamdbapi}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.teamdbapi}`;
			repoName = 'teamdbapi';

		} else if ( keyPresses.match(/^wam(_| )?api$/i) ) {
			localPath = `../${config.localPaths.wam_api}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.wam_api}`;
			repoName = 'wam_api';

		} else if ( keyPresses.match(/^upm(_| )?api$/i) ) {
			localPath = `../${config.localPaths.upm_api}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.upm_api}`;
			repoName = 'upm_api';

		} else if ( keyPresses.match(/^aqe(_| )?api$/i) ) {
			localPath = `../${config.localPaths.aqe_api}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.aqe_api}`;
			repoName = 'aqe_api';

		} else if ( keyPresses.match(/^ud(_| )?api$/i) ) {
			localPath = `../${config.localPaths.ud_api}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.ud_api}`;
			repoName = 'UD_api';

		} else if ( keyPresses.match(/^upm(_| )?api$/i) ) {
			localPath = `../${config.localPaths.upm_api}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.upm_api}`;
			repoName = 'upm_api';
			
		} else if ( keyPresses.match(/^modules$/i) ) {
			localPath = `../${config.localPaths.modules}`;
			remotePath = `${config.remoteBase}/${config.remotePaths.modules}`;
			repoName = 'modules';

		// hypnotoads
		} else if ( keyPresses.match(/^(hyp|hypno|hypnotoad|h)$/i) ) {
			hypnotoad = `${config.remoteBase}/${config.hypnotoadPaths.ud_api}`;
			repoName = 'UD_api';

		} else if ( keyPresses.match(/^(thyp|thypno|thypnotoad)$/i) ) {
			hypnotoad = `${config.remoteBase}/${config.hypnotoadPaths.teamdbapi}`; 
			repoName = 'teamdb'; 
			
		} else if ( keyPresses.match(/^(tthyp|tthypno|tthypnotoad)$/i) ) {
			hypnotoad = `${config.remoteBase}/${config.hypnotoadPaths.template_api}`; 
			repoName = 'template_api'; 

		} else if ( keyPresses.match(/^(ahyp|ahypno|ahypnotoad)$/i) ) {
			hypnotoad = `${config.remoteBase}/${config.hypnotoadPaths.aqe_api}`;
			repoName = 'AQE';

		} else if ( keyPresses.match(/^(whyp|whypno|whypnotoad)$/i) ) {
			hypnotoad = `${config.remoteBase}/${config.hypnotoadPaths.wam_api}`;
			repoName = 'WAM';

		} else if ( keyPresses.match(/^(uhyp|uhypno|uhypnotoad)$/i) ) {
			hypnotoad = `${config.remoteBase}/${config.hypnotoadPaths.utm_api}`;
			repoName = 'UTM';

		} else if ( keyPresses.match(/^(phyp|phypno|phypnotoad)$/i) ) {
			hypnotoad = `${config.remoteBase}/${config.hypnotoadPaths.upm_api}`;
			repoName = 'UPM';

		// apache
		} else if ( keyPresses.match(/^(m|apache|pach)$/i) ) {
			restartApache({fromName:'consoleCommands'})
			.catch( message => console.log(message) );
			return;

		// apache and hypnotoad
		} else if ( keyPresses.match(/^(hm|mh)$/i) ) {
			hypnotoad = `${config.remoteBase}/${config.hypnotoadPaths.ud_api}`;
			repoName = 'UD_api';
			restartApache({fromName:'consoleCommands'})
			.catch( message => console.log(message) );

		// reset modules folder
		} else if ( keyPresses === 'cmod' ) {
			command = `find ${config.remoteBase}/${config.remotePaths.modules} -type f -exec rm {} +`;
			repoName = 'modules';

		// custom command
		} else if ( keyPresses.match(/^cmd [a-zA-Z0-9_.-]+/i) ) {
			command = keyPresses.slice(4,keyPresses.length);
			message = `custom command: ${command}`;

		// help
		} else if ( keyPresses.match(/^help$/i) ) {
			console.log(help); 
			return;

		// clear console
		} else if ( keyPresses.match(/^clear|c$/i) ) {
			clear();
			return;

		}

		await runCommandGiven(localPath, repoName, remotePath, repoName, command, hypnotoad, keyPresses);
	}
}

/**
 * 
 * @param {string} localPath 
 * @param {string} repoName
 * @param {string} remotePath
 * @param {string} repoName
 * @param {string} command
 * @param {string} hypnotoad
 * @param {string} keyPresses
 */
async function runCommandGiven(localPath, repoName, remotePath, repoName, command, hypnotoad, keyPresses){
	let message = '';

	try {
		// sync repo
		if (localPath) {
			console.log(`syncing ${repoName}...`);
			await transferRepo({ localPath, remoteBasePath: remotePath, repo: repoName });

		} else if (command) {
			// custom commands, deleting folders, restarting repos
			if (repoName.match('custom command')) console.log(repoName);
			else if (repoName.match('modules')) console.log(`deleting ${repoName} folder...`);
			else console.log(`restarting ${config.repoName}...`);
			message = await executeRemoteCommand(command, null, 'consoleCommands');
			if (repoName.match('modules')) console.log(`deleted ${repoName} folder`);

		} else if (hypnotoad) {
			message = await restartHypnotoad({ path: hypnotoad, repoName, fromName: 'consoleCommands' });

		} else if (keyPresses === 'logs') {
			message = await resetLogs('consoleCommands');

		} else {
			console.log('Incorrect command type `help` to see options');
		}

		// finally log message from command execution
		if (message) console.log(message);

	} catch (err) {
		console.log(`consoleCommands::${err}`);
	}
}

// resume processes after watching input
process.stdin.setRawMode(true);
process.stdin.resume();

// keep track of all key presses since last enter button pressed
let keyPresses = '';



const help = `
sync repo to server by typing the repo name and pressing enter. Supported repos:
		ud, ud_api, wam,aqe, tqi, modules, taskamster, teamdb, 
		teamdapi, wamapi, aqeapi, upm, upmapi, templates, 
		udember (build files only)

restart hypnotoad with *hyp:
		hyp - udapi, thyp - teamdb, 
		ahyp - aqe, phyp - upm, whyp - wam

reset logs with 'logs' command (no quotes)
restart apache with 'apache', 'm', or 'pach'
restart ud_api hypnotoad with 'h' 
or apache and hypnotoad with 'mh' or 'hm'

you can also send a coustom command with 'cmd command'
example 'cmd ls' without quotes will return the dir list
`;