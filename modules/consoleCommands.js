
const keypress = require('keypress');
const Promise = require("bluebird");
const clear = require("cli-clear");
const chalk = require('chalk');

const config = require('./../config');

const {killAllConnections} = require("./connections");
const {resetLogs} = require('./logs');
const {restartApache, executeRemoteCommand, restartHypnotoad} = require('./remoteCommands');
const {transferRepo} = require('./syncHelpers');

// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

const localReposWatched = Object.keys(config.repos).map(repo => repo.toLowerCase());
const remoteReposWatched = Object.keys(config.repos).map(repo => repo.toLowerCase());

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

	// we are done if the key isn't the return key
	if(!key || key.name !== 'return') {
		return;
	}

	let localPath = '';
	let remotePath = '';
	let hypnotoad = '';
	let repoName = '';
	let command = '';

	// reset all key presses
	const keyPresses = collectedKeys.toLowerCase();
	collectedKeys = '';
	if(!keyPresses) return;

	console.log(chalk.green(`Running command: ${keyPresses}`));

	if ( keyPresses.match(/^killall$/i) ) {
		await killAllConnections();
		return;

	// repos
	} else if ( localReposWatched.includes(keyPresses) ) {
		const repoConfig = (config.repos[keyPresses] || {});
		localPath = `../${repoConfig.local}`;
		remotePath = `${config.remoteBase}/${repoConfig.remote}`;
		repoName = keyPresses;

	// udember and udapi
	} else if ( keyPresses.match(/^udember$/ig) ) {
		localPath = `../${config.repos.ud_ember.local}`;
		remotePath = `${config.remoteBase}/${config.repos.ud_ember.remote}`;
		repoName = 'ud_ember';
	} else if ( keyPresses.match(/^udapi$/ig) ) {
		localPath = `../${config.repos.ud_api.local}`;
		remotePath = `${config.remoteBase}/${config.repos.ud_api.remote}`;
		repoName = 'ud_api';

	// API repos
	} else if ( keyPresses.match(/^teamdb(_| )?api$/ig) ) {
		localPath = `../${config.repos.teamdbapi.local}`;
		remotePath = `${config.remoteBase}/${config.repos.teamdbapi.remote}`;
		repoName = 'teamdbapi';

	} else if ( keyPresses.match(/^wam(_| )?api$/ig) ) {
		localPath = `../${config.repos.wam_api.local}`;
		remotePath = `${config.remoteBase}/${config.repos.wam_api.remote}`;
		repoName = 'wam_api';

	} else if ( keyPresses.match(/^upm(_| )?api$/ig) ) {
		localPath = `../${config.repos.upm_api.local}`;
		remotePath = `${config.remoteBase}/${config.repos.upm_api.remote}`;
		repoName = 'upm_api';

	} else if ( keyPresses.match(/^aqe(_| )?api$/ig) ) {
		localPath = `../${config.repos.aqe_api.local}`;
		remotePath = `${config.remoteBase}/${config.repos.aqe_api.remote}`;
		repoName = 'aqe_api';

	} else if ( keyPresses.match(/^ud(_| )?api$/ig) ) {
		localPath = `../${config.repos.ud_api.local}`;
		remotePath = `${config.remoteBase}/${config.repos.ud_api.remote}`;
		repoName = 'UD_api';

	} else if ( keyPresses.match(/^upm(_| )?api$/ig) ) {
		localPath = `../${config.repos.upm_api.local}`;
		remotePath = `${config.remoteBase}/${config.repos.upm_api.remote}`;
		repoName = 'upm_api';
		
	} else if ( keyPresses.match(/^modules$/ig) ) {
		localPath = `../${config.repos.modules.local}`;
		remotePath = `${config.remoteBase}/${config.repos.modules.remote}`;
		repoName = 'modules';

	// hypnotoads
	} else if ( keyPresses.match(/^(hyp|hypno|hypnotoad|h)$/ig) ) {
		hypnotoad = `${config.remoteBase}/${config.repos.ud_api.hypnotoad}`;
		repoName = 'UD_api';

	} else if ( keyPresses.match(/^(thyp|thypno|thypnotoad)$/ig) ) {
		hypnotoad = `${config.remoteBase}/${config.repos.teamdbapi.hypnotoad}`; 
		repoName = 'teamdb'; 
		
	} else if ( keyPresses.match(/^(tthyp|tthypno|tthypnotoad)$/ig) ) {
		hypnotoad = `${config.remoteBase}/${config.repos.template_api.hypnotoad}`; 
		repoName = 'template_api'; 

	} else if ( keyPresses.match(/^(ahyp|ahypno|ahypnotoad)$/ig) ) {
		hypnotoad = `${config.remoteBase}/${config.repos.aqe_api.hypnotoad}`;
		repoName = 'AQE';

	} else if ( keyPresses.match(/^(whyp|whypno|whypnotoad)$/ig) ) {
		hypnotoad = `${config.remoteBase}/${config.repos.wam_api.hypnotoad}`;
		repoName = 'WAM';

	} else if ( keyPresses.match(/^(uhyp|uhypno|uhypnotoad)$/ig) ) {
		hypnotoad = `${config.remoteBase}/${config.repos.utm_api.hypnotoad}`;
		repoName = 'UTM';

	} else if ( keyPresses.match(/^(phyp|phypno|phypnotoad)$/ig) ) {
		hypnotoad = `${config.remoteBase}/${config.repos.upm_api.hypnotoad}`;
		repoName = 'UPM';

	// apache
	} else if ( keyPresses.match(/^(m|apache|pach)$/ig) ) {
		restartApache({fromName:'consoleCommands'})
		.catch( message => console.log(message) );
		return;

	// apache and hypnotoad
	} else if ( keyPresses.match(/^(hm|mh)$/ig) ) {
		hypnotoad = `${config.remoteBase}/${config.repos.ud_api.hypnotoad}`;
		repoName = 'UD_api';
		restartApache({fromName:'consoleCommands'})
		.catch( message => console.log(message) );

	// reset modules folder
	} else if ( keyPresses.match(/^cmod$/ig) ) {
		command = `find ${config.remoteBase}/${config.repos.modules.remote} -type f -exec rm {} +`;
		repoName = 'modules';

	// custom command
	} else if ( keyPresses.match(/^cmd [a-zA-Z0-9_.-]+/ig) ) {
		command = keyPresses.slice(4,keyPresses.length);
		message = `custom command: ${command}`;

	// help
	} else if ( keyPresses.match(/^help$/ig) ) {
		console.log(help); 
		return;

	// clear console
	} else if ( keyPresses.match(/^clear|c$/ig) ) {
		clear();
		return;

	}

	await runCommandGiven(localPath, repoName, remotePath, command, hypnotoad, keyPresses);
}

/**
 * 
 * @param {string} localPath 
 * @param {string} repoName
 * @param {string} remotePath
 * @param {string} command
 * @param {string} hypnotoad
 * @param {string} keyPresses
 */
async function runCommandGiven(localPath, repoName, remotePath, command, hypnotoad, keyPresses){
	let message = '';

	try {
		// sync repo
		if (localPath) {
			console.log(chalk.green(`syncing ${repoName}...`));
			await transferRepo({ localPath, remoteBasePath: remotePath, repo: repoName });

		} else if (command) {
			// custom commands, deleting folders, restarting repos
			if (repoName.match('custom command')) console.log(chalk.green(repoName));
			else if (repoName.match('modules')) console.log(chalk.red(`deleting ${repoName} folder...`));
			else console.log(chalk.yellow(`restarting ${config.repoName}...`));
			message = await executeRemoteCommand(command, null, 'consoleCommands');
			if (repoName.match('modules')) console.log(chalk.red(`deleted ${repoName} folder`));

		} else if (hypnotoad) {
			message = await restartHypnotoad({ path: hypnotoad, repoName, fromName: 'consoleCommands' });

		} else if (keyPresses === 'logs') {
			message = await resetLogs('consoleCommands');

		} else {
			console.log(chalk.red('Incorrect command type `help` to see options'));
		}

		// finally log message from command execution
		if (message) console.log(message);

	} catch (err) {
		console.log(chalk.red(`consoleCommands::${err}`));
	}
}

// resume processes after watching input
process.stdin.setRawMode(true);
process.stdin.resume();

// keep track of all key presses since last enter button pressed
let keyPresses = '';

const watchingPaths = Object.keys(config.repos)
	.map(repo => `	${repo}: ../${config.repos[repo]}`)
	.join(`\n`);

const help = `
sync repo to server by typing the repo name and pressing enter. Supported repos:
${watchingPaths}

restart hypnotoad with *hyp:
		hyp - udapi, thyp - teamdb, tthyp - template_api,
		ahyp - aqe, phyp - upm, whyp - wam

reset logs with 'logs' command (no quotes)
restart apache with 'apache', 'm', or 'pach'
restart ud_api hypnotoad with 'h' 
or apache and hypnotoad with 'mh' or 'hm'

you can also send a coustom command with 'cmd command'
example 'cmd ls' without quotes will return the dir list
`;