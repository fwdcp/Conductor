#! /usr/bin/env node

var async = require('async-q');
var chalk = require('chalk');
var child_process = require('child_process');
var path = require('path');
var Q = require('q');
var underscore = require('underscore');
var yargs = require('yargs');

var helpers = require('./helpers');

var argv = yargs
    .usage('$0 <command> <server-path>')
    .demand(2)
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
    .describe('metamod-checkout', 'commit of Metamod:Source to checkout and build')
    .string('metamod-checkout')
    .default('sourcemod', './sourcemod')
    .describe('sourcemod', 'path to the SourceMod Git repository')
    .requiresArg('sourcemod')
    .string('sourcemod')
    .describe('sourcemod-checkout', 'commit of SourceMod to checkout and build')
    .string('sourcemod-checkout')
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
var serverPath = path.resolve(argv._[1]);

var tasks = {
    'srcds-download': function() {
        console.log(chalk.cyan('Downloading the SRCDS for TF2...'));
        return helpers.steamcmdUpdate(path.resolve(argv.steamcmd), 232250, 'anonymous', '')
            .then(function() {
                console.log(chalk.cyan('SRCDS for TF2 downloaded.'));
            });
    },
    'hl2sdk-download': function() {
        console.log(chalk.cyan('Downloading the HL2SDK for TF2...'));
        return helpers.checkoutRepo(path.resolve(argv.hl2sdk), 'https://github.com/alliedmodders/hl2sdk.git', 'tf2')
            .then(function() {
                console.log(chalk.cyan('HL2SDK for TF2 downloaded.'));
            });
    },
    'metamod-download': function() {
        console.log(chalk.cyan('Downloading the Metamod:Source source...'));
        return helpers.checkoutRepo(path.resolve(argv.metamod), 'https://github.com/alliedmodders/metamod-source.git', argv.metamodCheckout)
            .then(function() {
                console.log(chalk.cyan('Metamod:Source source downloaded.'));
            });
    },
    'sourcemod-download': function() {
        console.log(chalk.cyan('Downloading the SourceMod source...'));
        return helpers.checkoutRepo(path.resolve(argv.sourcemod), 'https://github.com/alliedmodders/sourcemod.git', argv.sourcemodCheckout)
            .then(function() {
                console.log(chalk.cyan('SourceMod source downloaded.'));
            });
    },
    'metamod-build': ['hl2sdk-download', 'metamod-download', function() {
        console.log(chalk.magenta('Building Metamod:Source with AMBuild...'));
        return helpers.ambuild(path.resolve(argv.metamod), ['--sdks=tf2'], {'HL2SDKTF2': path.resolve(argv.hl2sdk)})
            .then(function() {
                console.log(chalk.magenta('Metamod:Source built.'));
            });
    }],
    'sourcemod-build': ['hl2sdk-download', 'metamod-download', 'sourcemod-download', function() {
        console.log(chalk.magenta('Building SourceMod with AMBuild...'));
        return helpers.ambuild(path.resolve(argv.sourcemod), ['--sdks=tf2', '--no-mysql'], {'HL2SDKTF2': path.resolve(argv.hl2sdk), 'MMSOURCE_DEV': path.resolve(argv.metamod)})
            .then(function() {
                console.log(chalk.magenta('SourceMod built.'));
            });
    }],
    'srcds-link': ['srcds-download', function() {
        console.log(chalk.gray('Linking SRCDS files...'));
        return helpers.mirrorLink(path.join(path.resolve(argv.steamcmd), 'steamapps', 'common', 'Team Fortress 2 Dedicated Server'), serverPath, true, true)
            .then(function() {
                console.log(chalk.gray('SRCDS files linked.'));
            });
    }],
    'metamod-install': ['metamod-build', 'srcds-link', function() {
        console.log(chalk.gray('Copying Metamod:Source package...'));
        return helpers.mirror(path.join(path.resolve(argv.metamod), 'build', 'package'), path.join(serverPath, 'tf'), true, false)
            .then(function() {
                console.log(chalk.gray('Metamod:Source package copied.'));
            });
    }],
    'sourcemod-install': ['sourcemod-build', function() {
        console.log(chalk.gray('Copying SourceMod package...'));
        return helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package'), path.join(serverPath, 'tf'), true, false)
            .then(function() {
                console.log(chalk.gray('SourceMod package copied.'));
            });
    }],
    'metamod-update': ['metamod-build', 'srcds-link', function() {
        console.log(chalk.gray('Copying Metamod:Source core files...'));
        return helpers.mirror(path.join(path.resolve(argv.metamod), 'build', 'package', 'addons', 'metamod', 'bin'), path.join(serverPath, 'tf', 'addons', 'metamod', 'bin'), true, false)
            .then(function() {
                console.log(chalk.gray('Metamod:Source core files copied.'));
            });
    }],
    'sourcemod-update': ['sourcemod-build', function() {
        console.log(chalk.gray('Copying SourceMod core files...'));
        return Promise.all([
                helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'bin'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'bin'), true, false),
                helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'extensions'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'extensions'), true, false),
                helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'gamedata'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'gamedata'), true, false),
                helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'plugins'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'plugins'), false, true),
                helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'plugins'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'plugins', 'disabled'), false, true),
                helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'scripting'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'scripting'), true, false),
                helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'translations'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'translations'), true, false)
            ]).then(function() {
                console.log(chalk.gray('SourceMod core files copied.'));
            });
    }]
};

function runServer() {
    var deferred = Q.defer();

    var game = child_process.spawn('./srcds_run', [
        '-game', 'tf'
    ].concat(argv._.slice(2)), {
        cwd: serverPath
    });

    console.log(chalk.bgGreen('Running server!'));

    game.stderr.pipe(process.stderr);

    game.on('exit', function(code, signal) {
        if (signal) {
            deferred.reject(new Error('Game was killed with signal: ' + signal));
        }
        else if (code) {
            deferred.reject(new Error('Game exited with code: ' + code));
        }
        else {
            deferred.resolve();
        }
    });

    return deferred.promise;
}

if (command === 'install') {
    async
        .auto(underscore.pick(tasks, 'srcds-download', 'hl2sdk-download', 'metamod-download', 'sourcemod-download', 'metamod-build', 'sourcemod-build', 'srcds-link', 'metamod-install', 'sourcemod-install'))
        .catch(function(err) {
            if (err) {
                console.log(chalk.bgRed('Error encountered when installing:'));
                console.log(chalk.bgRed(err.trace || err));
            }
        })
        .done();
}
else if (command === 'update') {
    async
        .auto(underscore.pick(tasks, 'srcds-download', 'hl2sdk-download', 'metamod-download', 'sourcemod-download', 'metamod-build', 'sourcemod-build', 'srcds-link', 'metamod-update', 'sourcemod-update'))
        .catch(function(err) {
            if (err) {
                console.log(chalk.bgRed('Error encountered when updating:'));
                console.log(chalk.bgRed(err.trace || err));
            }
        })
        .done();
}
else if (command === 'run') {
    runServer()
        .catch(function(err) {
            if (err) {
                console.log(chalk.bgRed('Error encountered when running:'));
                console.log(chalk.bgRed(err.trace || err));
            }
        })
        .done();
}
else if (command === 'run-updated') {
    async
        .auto(underscore.pick(tasks, 'srcds-download', 'hl2sdk-download', 'metamod-download', 'metamod-build', 'sourcemod-build', 'srcds-link', 'metamod-update', 'sourcemod-update'))
        .then(runServer)
        .catch(function(err) {
            if (err) {
                console.log(chalk.bgRed('Error encountered when running:'));
                console.log(chalk.bgRed(err.trace || err));
            }
        })
        .done();
}
else {
    yargs.showHelp();
}
