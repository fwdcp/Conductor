#! /usr/bin/env node

var async = require('async-q');
var chalk = require('chalk');
var child_process = require('child_process');
var extend = require('extend');
var fs = require('fs-extra');
var ini = require('ini');
var NodeGit = require('nodegit');
var path = require('path');
var Q = require('q');
var yargs = require('yargs');

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

function checkoutRepo(name, repoPath, url, refName) {
    return NodeGit.Repository.open(repoPath)
        .then(function(repo) {
            return NodeGit.Remote.lookup(repo, 'origin').catch(function() {
                return NodeGit.Remote.create(repo, 'origin', url);
            })
                .then(function(remote) {
                    return remote.fetch(null, repo.defaultSignature(), null);
                })
                .then(function() {
                    return repo;
                });
        }, function() {
            return Q.nfcall(fs.mkdirs, repoPath)
                .then(function() {
                    return Q.nfcall(fs.emptyDir, repoPath);
                })
                .then(function() {
                    return NodeGit.Clone(url, repoPath);
                });
        })
        .then(function(repo) {
            if (refName) {
                return repo.getStatusExt()
                    .then(function(statuses) {
                        if (statuses.length !== 0) {
                            throw new Error('Uncommitted changes prevent checking out new version.');
                        }
                    })
                    .then(function() {
                        return repo.getReference(refName)
                            .catch(function() {
                                return repo.getReference('origin/' + refName);
                            })
                            .then(function(ref) {
                                return NodeGit.Checkout.tree(repo, ref, {checkoutStrategy: NodeGit.Checkout.STRATEGY.FORCE});
                            });
                    })
                    .then(function() {
                        return repo;
                    });
            }
        })
        .then(function(repo) {
            return NodeGit.Submodule.reloadAll(repo, 1)
                .then(function() {
                    return Q.nfcall(fs.readFile, path.join(repoPath, '.gitmodules'), 'utf-8')
                        .then(function(data) {
                            var submoduleConfig = ini.parse(data);

                            return Promise.all(Object.keys(submoduleConfig).map(function(sectionName) {
                                var match = /submodule \"(.+)\"/.exec(sectionName);

                                if (match && match[1]) {
                                    return NodeGit.Submodule.lookup(repo, match[1]).then(function(submodule) {
                                        return submodule.update(1, null);
                                    });
                                }
                            }));
                        }, function() {
                            return;
                        });
                });
        })
        .catch(function(err) {
            if (err) {
                throw new Error('When downloading ' + name + ': ' + err);
            }
        });
}

function steamcmdUpdate(name, steamcmd, appid, username, password) {
    return Q.fcall(function() {
        var deferred = Q.defer();

        var update = child_process.spawn('./steamcmd.sh', [
            '+login', username, password,
            '+app_update', appid, 'validate',
            '+quit'
        ], {
            cwd: steamcmd
        });

        if (argv.verbose >= 2) {
            update.stdout.pipe(process.stdout);
        }
        if (argv.verbose >= 1) {
            update.stderr.pipe(process.stderr);
        }

        update.on('exit', function(code, signal) {
            if (signal) {
                deferred.reject(new Error('SteamCMD was killed with signal: ' + signal));
            }
            else if (code) {
                deferred.reject(new Error('SteamCMD exited with code: ' + code));
            }
            else {
                deferred.resolve();
            }
        });

        return deferred.promise;
    })
    .catch(function(err) {
        if (err) {
            throw new Error('When updating ' + name + ': ' + err);
        }
    });
}

function ambuild(name, repo, extraArgs, extraEnv) {
    var env = {}
    extend(env, process.env, extraEnv);

    return Q.nfcall(fs.mkdirs, path.join(repo, 'build'))
        .then(function() {
            var deferred = Q.defer();

            var configure = child_process.spawn('python', [
                path.join(repo, 'configure.py')
            ].concat(extraArgs), {
                cwd: path.join(repo, 'build'),
                env: env
            });

            if (argv.verbose >= 2) {
                configure.stdout.pipe(process.stdout);
            }
            if (argv.verbose >= 1) {
                configure.stderr.pipe(process.stderr);
            }

            configure.on('exit', function(code, signal) {
                if (signal) {
                    deferred.reject(new Error('Configure script was killed with signal: ' + signal));
                }
                else if (code) {
                    deferred.reject(new Error('Configure script exited with code: ' + code));
                }
                else {
                    deferred.resolve();
                }
            });

            return deferred.promise;
        })
        .then(function() {
            var deferred = Q.defer();

            var build = child_process.spawn('ambuild', {
                cwd: path.join(repo, 'build')
            });

            if (argv.verbose >= 2) {
                build.stdout.pipe(process.stdout);
            }
            if (argv.verbose >= 1) {
                build.stderr.pipe(process.stderr);
            }

            build.on('exit', function(code, signal) {
                if (signal) {
                    deferred.reject(new Error('Build process was killed with signal: ' + signal));
                }
                else if (code) {
                    deferred.reject(new Error('Build process exited with code: ' + code));
                }
                else {
                    deferred.resolve();
                }
            });

            return deferred.promise;
        })
        .catch(function(err) {
            if (err) {
                throw new Error('When building ' + name + ': ' + err);
            }
        });
}

var tasks = {};

var command = argv._[0];

if (command !== 'run') {
    extend(tasks, {
        'srcds': function() {
            console.log(chalk.cyan('Downloading the dedicated server for TF2...'));
            return steamcmdUpdate('SRCDS', path.resolve(argv.steamcmd), 232250, 'anonymous', '');
        },
        'hl2sdk': function() {
            console.log(chalk.cyan('Downloading the HL2SDK for TF2...'));
            return checkoutRepo('HL2SDK', path.resolve(argv.hl2sdk), 'https://github.com/alliedmodders/hl2sdk.git', 'tf2');
        },
        'metamod': function() {
            console.log(chalk.cyan('Downloading the Metamod:Source source...'));
            return checkoutRepo('Metamod:Source', path.resolve(argv.metamod), 'https://github.com/alliedmodders/metamod-source.git', argv.metamodCommit);
        },
        'sourcemod': function() {
            console.log(chalk.cyan('Downloading the SourceMod source...'));
            return checkoutRepo('SourceMod', path.resolve(argv.sourcemod), 'https://github.com/alliedmodders/sourcemod.git', argv.sourcemodCommit);
        },
        'metamod-build': ['hl2sdk', 'metamod', function(results) {
            console.log(chalk.magenta('Building Metamod:Source with AMBuild...'));
            return ambuild('Metamod:Source', path.resolve(argv.metamod), ['--sdks=tf2'], {'HL2SDKTF2': path.resolve(argv.hl2sdk)});
        }],
        'sourcemod-build': ['hl2sdk', 'metamod', 'sourcemod', function(results) {
            console.log(chalk.magenta('Building SourceMod with AMBuild...'));
            return ambuild('SourceMod', path.resolve(argv.sourcemod), ['--sdks=tf2', '--no-mysql'], {'HL2SDKTF2': path.resolve(argv.hl2sdk), 'MMSOURCE_DEV': path.resolve(argv.metamod)});
        }]
    });
}

if (command === 'install') {
    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when installing:'));
            console.log(chalk.bgRed(err));
        }
    }).done();
}
else if (command === 'update') {
    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when updating:'));
            console.log(chalk.bgRed(err));
        }
    }).done();
}
else if (command === 'run') {
    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when updating:'));
            console.log(chalk.bgRed(err));
        }
    }).done();
}
else if (command === 'run-updated') {
    async.auto(tasks).catch(function(err) {
        if (err) {
            console.log(chalk.bgRed('Error encountered when updating:'));
            console.log(chalk.bgRed(err));
        }
    }).done();
}
else {
    yargs.showHelp();
}
