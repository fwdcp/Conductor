#! /usr/bin/env node

var async = require('async-q');
var chalk = require('chalk');
var child_process = require('child_process');
var path = require('path');
var Q = require('q');
var underscore = require('underscore');
var winston = require('winston');
var yargs = require('yargs');

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

if (argv.verbose == 0) {
    winston.level = 'info';
}
else if (argv.verbose == 1) {
    winston.level = 'verbose';
}
else if (argv.verbose == 2) {
    winston.level = 'debug';
}
else if (argv.verbose == 3) {
    winston.level = 'silly';
}

var helpers = require('./helpers')(winston);

var tasks = {};

var command = argv._[0];
var serverPath = path.resolve(argv._[1]);

var tasks = {
    'srcds-download': function() {
        winston.info(chalk.cyan('Downloading the SRCDS for TF2...'));
        return helpers.steamcmdUpdate('SRCDS download', path.resolve(argv.steamcmd), 232250, 'anonymous', '')
            .then(function() {
                winston.info(chalk.cyan('SRCDS for TF2 downloaded.'));
            });
    },
    'hl2sdk-download': function() {
        winston.info(chalk.cyan('Downloading the HL2SDK for TF2...'));
        return helpers.checkoutRepo('HL2SDK download', path.resolve(argv.hl2sdk), 'https://github.com/alliedmodders/hl2sdk.git', 'tf2')
            .then(function() {
                winston.info(chalk.cyan('HL2SDK for TF2 downloaded.'));
            });
    },
    'metamod-download': function() {
        winston.info(chalk.cyan('Downloading the Metamod:Source source...'));
        return helpers.checkoutRepo('MM:S download', path.resolve(argv.metamod), 'https://github.com/alliedmodders/metamod-source.git', argv.metamodCheckout)
            .then(function() {
                winston.info(chalk.cyan('Metamod:Source source downloaded.'));
            });
    },
    'sourcemod-download': function() {
        winston.info(chalk.cyan('Downloading the SourceMod source...'));
        return helpers.checkoutRepo('SM download', path.resolve(argv.sourcemod), 'https://github.com/alliedmodders/sourcemod.git', argv.sourcemodCheckout)
            .then(function() {
                winston.info(chalk.cyan('SourceMod source downloaded.'));
            });
    },
    'metamod-build': ['hl2sdk-download', 'metamod-download', function() {
        winston.info(chalk.magenta('Building Metamod:Source with AMBuild...'));
        return helpers.ambuild('MM:S build', path.resolve(argv.metamod), ['--sdks=tf2'], {'HL2SDKTF2': path.resolve(argv.hl2sdk)})
            .then(function() {
                winston.info(chalk.magenta('Metamod:Source built.'));
            });
    }],
    'sourcemod-build': ['hl2sdk-download', 'metamod-download', 'sourcemod-download', function() {
        winston.info(chalk.magenta('Building SourceMod with AMBuild...'));
        return helpers.ambuild('SM build', path.resolve(argv.sourcemod), ['--sdks=tf2', '--no-mysql'], {'HL2SDKTF2': path.resolve(argv.hl2sdk), 'MMSOURCE_DEV': path.resolve(argv.metamod)})
            .then(function() {
                winston.info(chalk.magenta('SourceMod built.'));
            });
    }],
    'srcds-link': ['srcds-download', function() {
        winston.info(chalk.gray('Linking SRCDS files...'));
        return helpers.mirrorLink('SRCDS link', path.join(path.resolve(argv.steamcmd), 'steamapps', 'common', 'Team Fortress 2 Dedicated Server'), serverPath, true, true)
            .then(function() {
                winston.info(chalk.gray('SRCDS files linked.'));
            });
    }],
    'metamod-install': ['metamod-build', 'srcds-link', function() {
        winston.info(chalk.gray('Copying Metamod:Source package...'));
        return helpers.mirror('MM:S install', path.join(path.resolve(argv.metamod), 'build', 'package'), path.join(serverPath, 'tf'), true, false)
            .then(function() {
                winston.info(chalk.gray('Metamod:Source package copied.'));
            });
    }],
    'sourcemod-install': ['sourcemod-build', 'srcds-link', function() {
        winston.info(chalk.gray('Copying SourceMod package...'));
        return helpers.mirror('SM install', path.join(path.resolve(argv.sourcemod), 'build', 'package'), path.join(serverPath, 'tf'), true, false)
            .then(function() {
                winston.info(chalk.gray('SourceMod package copied.'));
            });
    }],
    'metamod-update': ['metamod-build', 'srcds-link', function() {
        winston.info(chalk.gray('Copying Metamod:Source core files...'));
        return helpers.mirror('MM:S update', path.join(path.resolve(argv.metamod), 'build', 'package', 'addons', 'metamod', 'bin'), path.join(serverPath, 'tf', 'addons', 'metamod', 'bin'), true, false)
            .then(function() {
                winston.info(chalk.gray('Metamod:Source core files copied.'));
            });
    }],
    'sourcemod-update': ['sourcemod-build', 'srcds-link', function() {
        winston.info(chalk.gray('Copying SourceMod core files...'));
        return Promise.all([
                helpers.mirror('SM binary update', path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'bin'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'bin'), true, false),
                helpers.mirror('SM extension update', path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'extensions'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'extensions'), true, false),
                helpers.mirror('SM gamedata update', path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'gamedata'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'gamedata'), true, false),
                helpers.mirror('SM plugin update', path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'plugins'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'plugins'), false, true),
                helpers.mirror('SM disabled plugin update', path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'plugins'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'plugins', 'disabled'), false, true),
                helpers.mirror('SM script update', path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'scripting'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'scripting'), true, false),
                helpers.mirror('SM translation update', path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'translations'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'translations'), true, false)
            ]).then(function() {
                winston.info(chalk.gray('SourceMod core files copied.'));
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

    winston.info(chalk.bgGreen('Running server!'));

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
                winston.error(chalk.bgRed('Error encountered when installing:'));
                winston.error(chalk.bgRed(err.trace || err));
            }
        })
        .done();
}
else if (command === 'update') {
    async
        .auto(underscore.pick(tasks, 'srcds-download', 'hl2sdk-download', 'metamod-download', 'sourcemod-download', 'metamod-build', 'sourcemod-build', 'srcds-link', 'metamod-update', 'sourcemod-update'))
        .catch(function(err) {
            if (err) {
                winston.error(chalk.bgRed('Error encountered when updating:'));
                winston.error(chalk.bgRed(err.trace || err));
            }
        })
        .done();
}
else if (command === 'run') {
    runServer()
        .catch(function(err) {
            if (err) {
                winston.error(chalk.bgRed('Error encountered when running:'));
                winston.error(chalk.bgRed(err.trace || err));
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
                winston.error(chalk.bgRed('Error encountered when running:'));
                winston.error(chalk.bgRed(err.trace || err));
            }
        })
        .done();
}
else {
    yargs.showHelp();
}
