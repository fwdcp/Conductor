#! /usr/bin/env node

var async = require('async-q');
var chalk = require('chalk');
var child_process = require('child_process');
var extend = require('extend');
var path = require('path');
var Q = require('q');
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
var serverPath = path.resolve(argv._[1]);

if (command !== 'run') {
    extend(tasks, {
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
            return helpers.checkoutRepo(path.resolve(argv.metamod), 'https://github.com/alliedmodders/metamod-source.git', argv.metamodCommit)
                .then(function() {
                    console.log(chalk.cyan('Metamod:Source source downloaded.'));
                });
        },
        'sourcemod-download': function() {
            console.log(chalk.cyan('Downloading the SourceMod source...'));
            return helpers.checkoutRepo(path.resolve(argv.sourcemod), 'https://github.com/alliedmodders/sourcemod.git', argv.sourcemodCommit)
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
        }]
    });
}

if (command === 'install') {
    extend(tasks, {
        'srcds-link': ['srcds-download', function() {
            console.log(chalk.gray('Linking SRCDS files...'));
            return helpers.mirror(path.join(path.resolve(argv.steamcmd), 'steamapps', 'common', 'Team Fortress 2 Dedicated Server'), serverPath, true, true)
                .then(function() {
                    console.log(chalk.gray('SRCDS files linked.'));
                });
        }],
        'metamod-copy': ['metamod-build', 'srcds-link', function() {
            console.log(chalk.gray('Copying Metamod:Source package...'));
            return helpers.mirror(path.join(path.resolve(argv.metamod), 'build', 'package'), path.join(serverPath, 'tf'), false, true)
                .then(function() {
                    console.log(chalk.gray('Metamod:Source package copied.'));
                });
        }],
        'sourcemod-copy': ['sourcemod-build', 'metamod-copy', function() {
            console.log(chalk.gray('Copying SourceMod package...'));
            return helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package'), path.join(serverPath, 'tf'), false, true)
                .then(function() {
                    console.log(chalk.gray('SourceMod package copied.'));
                });
        }]
    });

    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when installing:'));
            console.log(chalk.bgRed(err.trace || err));
        }
    }).done();
}
else if (command === 'update') {
    extend(tasks, {
        'srcds-link': ['srcds-download', function() {
            console.log(chalk.gray('Linking SRCDS files...'));
            return helpers.mirror(path.join(path.resolve(argv.steamcmd), 'steamapps', 'common', 'Team Fortress 2 Dedicated Server'), serverPath, true, true)
                .then(function() {
                    console.log(chalk.gray('SRCDS files linked.'));
                });
        }],
        'metamod-copy': ['metamod-build', 'srcds-link', function() {
            console.log(chalk.gray('Copying Metamod:Source core files...'));
            return helpers.mirror(path.join(path.resolve(argv.metamod), 'build', 'package', 'addons', 'metamod', 'bin'), path.join(serverPath, 'tf', 'addons', 'metamod', 'bin'), false, false)
                .then(function() {
                    console.log(chalk.gray('Metamod:Source core files copied.'));
                });
        }],
        'sourcemod-copy': ['sourcemod-build', 'metamod-copy', function() {
            console.log(chalk.gray('Copying SourceMod core files...'));
            return Promise.all([
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'bin'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'bin'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'extensions'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'extensions'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'gamedata'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'gamedata'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'plugins'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'plugins'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'scripting'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'scripting'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'translations'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'translations'), false, true)
                ]).then(function() {
                    console.log(chalk.gray('SourceMod core files copied.'));
                });
        }]
    });

    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when updating:'));
            console.log(chalk.bgRed(err.trace || err));
        }
    }).done();
}
else if (command === 'run') {
    Q.fcall(function() {
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
    })
        .catch(function(err) {
            if (err) {
                console.log(chalk.bgRed('Error encountered when running:'));
                console.log(chalk.bgRed(err.trace || err));
            }
        })
        .done();
}
else if (command === 'run-updated') {
    extend(tasks, {
        'srcds-link': ['srcds-download', function() {
            console.log(chalk.gray('Linking SRCDS files...'));
            return helpers.mirror(path.join(path.resolve(argv.steamcmd), 'steamapps', 'common', 'Team Fortress 2 Dedicated Server'), serverPath, true, true)
                .then(function() {
                    console.log(chalk.gray('SRCDS files linked.'));
                });
        }],
        'metamod-copy': ['metamod-build', 'srcds-link', function() {
            console.log(chalk.gray('Copying Metamod:Source core files...'));
            return helpers.mirror(path.join(path.resolve(argv.metamod), 'build', 'package', 'addons', 'metamod', 'bin'), path.join(serverPath, 'tf', 'addons', 'metamod', 'bin'), false, false)
                .then(function() {
                    console.log(chalk.gray('Metamod:Source core files copied.'));
                });
        }],
        'sourcemod-copy': ['sourcemod-build', 'metamod-copy', function() {
            console.log(chalk.gray('Copying SourceMod core files...'));
            return Promise.all([
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'bin'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'bin'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'extensions'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'extensions'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'gamedata'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'gamedata'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'plugins'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'plugins'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'scripting'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'scripting'), false, true),
                    helpers.mirror(path.join(path.resolve(argv.sourcemod), 'build', 'package', 'addons', 'sourcemod', 'translations'), path.join(serverPath, 'tf', 'addons', 'sourcemod', 'translations'), false, true)
                ]).then(function() {
                    console.log(chalk.gray('SourceMod core files copied.'));
                });
        }]
    });

    async.auto(tasks)
        .catch(function(err) {
            if (err) {
                console.log(chalk.bgRed('Error encountered when updating and running:'));
                console.log(chalk.bgRed(err.trace || err));
            }
        })
        .then(function() {
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
        })
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
