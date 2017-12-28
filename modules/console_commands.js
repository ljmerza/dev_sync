
const keypress = require('keypress');
const Promise = require("bluebird");

const config = require('./../config');
const connections_object = require("./connections");
const logs = require('./logs');
const remote_commands = require('./remote_commands');
const sync_helpers = require('./sync_helpers');

// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

let collected_keys = '';

// listen for the "keypress" event
process.stdin.on('keypress', async function (ch, key) {

  // kill process if send SIGTERM
  if (key && key.ctrl && key.name == 'c') {
    process.exit();
  }

  // if spacebar then add else trim then add to key presses
  if(ch && key && key.name == 'space'){
    collected_keys += ch;
  } else {
    collected_keys += ch.trim();
  }

  // if we hit return then lets see if we have a match
  if(key && key.name === 'return') {

    let local_path;
    let remote_path;
    let hypnotoad;
    let repo_name;
    let command;

    // reset all key presses
    const key_presses = collected_keys;
    collected_keys = '';

    // repos
    if ( config.local_paths[key_presses] ) {
      local_path = `../${config.local_paths[key_presses]}`;
      remote_path = `${config.remote_base}/${config.remote_paths[key_presses]}`;
      repo_name = key_presses;

    // API repos
  	} else if ( key_presses.match(/^teamdb(_| )?api$/i) ) {
      local_path = `../${config.local_paths.teamdb_api}`;
      remote_path = `${config.remote_base}/${config.remote_paths.teamdbapi}`;
      repo_name = 'teamdbapi';

    } else if ( key_presses.match(/^wam(_| )?api$/i) ) {
      local_path = `../${config.local_paths.wam_api}`;
      remote_path = `${config.remote_base}/${config.remote_paths.wam_api}`;
      repo_name = 'wam_api';

    } else if ( key_presses.match(/^upm(_| )?api$/i) ) {
      local_path = `../${config.local_paths.upm_api}`;
      remote_path = `${config.remote_base}/${config.remote_paths.upm_api}`;
      repo_name = 'upm_api';

    } else if ( key_presses.match(/^aqe(_| )?api$/i) ) {
      local_path = `../${config.local_paths.aqe_api}`;
      remote_path = `${config.remote_base}/${config.remote_paths.aqe_api}`;
      repo_name = 'aqe_api';

    } else if ( key_presses.match(/^ud(_| )?api$/i) ) {
      local_path = `../${config.local_paths.ud_api}`;
      remote_path = `${config.remote_base}/${config.remote_paths.ud_api}`;
      repo_name = 'UD_api';

    } else if ( key_presses.match(/^upm(_| )?api$/i) ) {
      local_path = `../${config.local_paths.upm_api}`;
      remote_path = `${config.remote_base}/${config.remote_paths.upm_api}`;
      repo_name = 'upm_api';


    // hypnotoads
    } else if ( key_presses.match(/^(hyp|hypno|hypnotoad|h)$/i) ) {
      hypnotoad = `${config.remote_base}/${config.hypnotoad_paths.ud_api}`;
      repo_name = 'UD_api';

    } else if ( key_presses.match(/^(thyp|thypno|thypnotoad)$/i) ) {
      hypnotoad = `${config.remote_base}/${config.hypnotoad_paths.teamdbapi}`; 
      repo_name = 'teamdb'; 

    } else if ( key_presses.match(/^(ahyp|ahypno|ahypnotoad)$/i) ) {
      hypnotoad = `${config.remote_base}/${config.hypnotoad_paths.aqe_api}`;
      repo_name = 'AQE';

    } else if ( key_presses.match(/^(whyp|whypno|whypnotoad)$/i) ) {
      hypnotoad = `${config.remote_base}/${config.hypnotoad_paths.wam_api}`;
      repo_name = 'WAM';

    } else if ( key_presses.match(/^(uhyp|uhypno|uhypnotoad)$/i) ) {
      hypnotoad = `${config.remote_base}/${config.hypnotoad_paths.utm_api}`;
      repo_name = 'UTM';

    } else if ( key_presses.match(/^(phyp|phypno|phypnotoad)$/i) ) {
      hypnotoad = `${config.remote_base}/${config.hypnotoad_paths.upm_api}`;
      repo_name = 'UPM';



    // apache
    } else if ( key_presses.match(/^(m|apache|pach)$/i) ) {
      remote_commands.restart_apache();
      return;

    // apache and hypnotoad
    } else if ( key_presses.match(/^(hm|mh)$/i) ) {
      hypnotoad = `${config.remote_base}/${config.hypnotoad_paths.ud_api}`;
      repo_name = 'UD_api';
      remote_commands.restart_apache();



    // reset modules folder
    } else if ( key_presses === 'cmod' ) {
      command = `find ${config.remote_base}/${config.remote_paths.modules} -type f -exec rm {} +`;
      repo_name = 'modules';



    // custom command
    } else if ( key_presses.match(/^cmd [a-zA-Z0-9_.-]+/i) ) {
      command = key_presses.slice(4,key_presses.length);
      repo_name = `custom command: ${command}`;
    }




    // sync repo
    if(local_path) {
      console.log(`syncing ${repo_name}...`);
      sync_helpers.transfer_repo(local_path, remote_path, repo_name)
      .then( message => console.log(message) )
      .catch( message => console.log(message) );

    // run command
    } else if(command) {
      if( repo_name.match('custom command') ){
        console.log(repo_name);
      } else if( repo_name.match('modules') ) {
        console.log(`deleting ${repo_name} folder...`);
      } else{
        console.log(`restarting ${config.repo_name}...`);
      }
      remote_commands.execute_remote_command(command)
      .catch( message => console.log(message) );

    // restart hypnotoad
    } else if (hypnotoad) {
      remote_commands.restart_hypnotoad(hypnotoad, repo_name);

    // reset logs

    } else if ( key_presses === 'logs' ) {
      const message = await logs.reset_logs();
      console.log(message);

    // else show help
    } else {
      console.log(`
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
      `);
    }
  }
});

// resume processes after watching input
process.stdin.setRawMode(true);
process.stdin.resume();

// keep track of all key presses since last enter button pressed
let key_presses = '';




