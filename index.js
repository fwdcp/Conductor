#! /usr/bin/env node

var async = require('async-q');
var chalk = require('chalk');
var extend = require('extend');
var path = require('path');
var yargs = require('yargs');

var helpers = require('./helpers');

var argv = yargs
    .usage('$0 <command> <server-path>')
    .command('install', 'install a server')
    .command('update', 'update a server')
    .command('run', 'run a server')
    .command('run-updated', 'run a server after updating it')
    .default('steamcmd', './steamcmd')
    .describe('steamcmd', 'path to the SteamCMD installation location')
    .requiresArg('steamcmd')
    .string('steamcmd')
    .default('hl2sdk', './hl2sdk-tf2')
    .describe('hl2sdk', 'path to the HL2SDK Git repository')
    .requiresArg('hl2sdk')
    .string('hl2sdk')
    .default('metamod', './metamod-source')
    .describe('metamod', 'path to the Metamod:Source Git repository')
    .requiresArg('metamod')
    .string('metamod')
    .default('metamod-commit', '1.10-dev')
    .describe('metamod-commit', 'commit of Metamod:Source to build')
    .string('metamod-commit')
    .default('sourcemod', './sourcemod')
    .describe('sourcemod', 'path to the SourceMod Git repository')
    .requiresArg('sourcemod')
    .string('sourcemod')
    .default('sourcemod-commit', '1.7-dev')
    .describe('sourcemod-commit', 'commit of SourceMod to build')
    .string('sourcemod-commit')
    .config('c')
    .alias('c', 'config')
    .describe('verbose', 'print more information')
    .alias('v', 'verbose')
    .count('verbose')
    .help('h')
    .alias('h', 'help')
    .version('0.1.0')
    .argv;

var tasks = {};

var command = argv._[0];

if (command !== 'run') {
    extend(tasks, {
        'srcds': function() {
            console.log(chalk.cyan('Downloading the dedicated server for TF2...'));
            return helpers.steamcmdUpdate('SRCDS', path.resolve(argv.steamcmd), 232250, 'anonymous', '');
        },
        'hl2sdk': function() {
            console.log(chalk.cyan('Downloading the HL2SDK for TF2...'));
            return helpers.checkoutRepo('HL2SDK', path.resolve(argv.hl2sdk), 'https://github.com/alliedmodders/hl2sdk.git', 'tf2');
        },
        'metamod': function() {
            console.log(chalk.cyan('Downloading the Metamod:Source source...'));
            return helpers.checkoutRepo('Metamod:Source', path.resolve(argv.metamod), 'https://github.com/alliedmodders/metamod-source.git', argv.metamodCommit);
        },
        'sourcemod': function() {
            console.log(chalk.cyan('Downloading the SourceMod source...'));
            return helpers.checkoutRepo('SourceMod', path.resolve(argv.sourcemod), 'https://github.com/alliedmodders/sourcemod.git', argv.sourcemodCommit);
        },
        'metamod-build': ['hl2sdk', 'metamod', function(results) {
            console.log(chalk.magenta('Building Metamod:Source with AMBuild...'));
            return helpers.ambuild('Metamod:Source', path.resolve(argv.metamod), ['--sdks=tf2'], {'HL2SDKTF2': path.resolve(argv.hl2sdk)});
        }],
        'sourcemod-build': ['hl2sdk', 'metamod', 'sourcemod', function(results) {
            console.log(chalk.magenta('Building SourceMod with AMBuild...'));
            return helpers.ambuild('SourceMod', path.resolve(argv.sourcemod), ['--sdks=tf2', '--no-mysql'], {'HL2SDKTF2': path.resolve(argv.hl2sdk), 'MMSOURCE_DEV': path.resolve(argv.metamod)});
        }]
    });
}

if (command === 'install') {
    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when installing:'));
            console.log(chalk.bgRed(err.trace));
        }
    }).done();
}
else if (command === 'update') {
    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when updating:'));
            console.log(chalk.bgRed(err.trace));
        }
    }).done();
}
else if (command === 'run') {
    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when updating:'));
            console.log(chalk.bgRed(err.trace));
        }
    }).done();
}
else if (command === 'run-updated') {
    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when updating:'));
            console.log(chalk.bgRed(err.trace));
        }
    }).done();
}
else {
    yargs.showHelp();
}
