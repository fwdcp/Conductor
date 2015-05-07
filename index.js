#! /usr/bin/env node

var async = require('async-q');
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
    .default('hl2sdk', './hl2sdk-tf2')
    .describe('hl2sdk', 'path to the HL2SDK Git repository')
    .requiresArg('hl2sdk')
    .string('hl2sdk')
    .default('metamod', './metamod-source')
    .describe('metamod', 'path to the Metamod:Source Git repository')
    .requiresArg('metamod')
    .string('metamod')
    .implies('metamod', 'hl2sdk')
    .default('metamod-branch', '1.10-dev')
    .describe('metamod-branch', 'branch of Metamod:Source to build')
    .requiresArg('metamod-branch')
    .string('metamod-branch')
    .default('sourcemod', './sourcemod')
    .describe('sourcemod', 'path to the SourceMod Git repository')
    .requiresArg('sourcemod')
    .string('sourcemod')
    .implies('sourcemod', 'metamod')
    .default('sourcemod-branch', '1.7-dev')
    .describe('sourcemod-branch', 'branch of SourceMod to build')
    .requiresArg('sourcemod-branch')
    .string('sourcemod-branch')
    .config('c')
    .alias('c', 'config')
    .help('h')
    .alias('h', 'help')
    .argv;

function checkoutBranchOfRepo(repoPath, url, branchName) {
    return NodeGit.Repository.open(repoPath)
        .then(function(repo) {
            return NodeGit.Remote.lookup(repo, 'origin').catch(function() {
                return NodeGit.Remote.create(repo, 'origin', url);
            })
                .then(function(remote) {
                    return remote.fetch(null, repo.defaultSignature(), null);
                })
                .then(function() {
                    return NodeGit.Branch.lookup(repo, branchName, NodeGit.Branch.BRANCH.LOCAL)
                        .then(function() {
                            return repo.mergeBranches(branchName, 'origin/' + branchName);
                        }, function() {
                            return repo.getBranchCommit('origin/' + branchName).then(function(commit) {
                                return repo.createBranch(branchName, commit, 0, repo.defaultSignature());
                            }).then(function(branch) {
                                NodeGit.Branch.setUpstream(branch, 'origin/' + branchName);
                                return NodeGit.Branch.lookup(repo, branchName, NodeGit.Branch.BRANCH.LOCAL);
                            });
                        });
                })
                .then(function() {
                    return repo.getStatusExt().then(function(statuses) {
                        if (statuses.length == 0) {
                            return repo.checkoutBranch(branchName, {checkoutStrategy: NodeGit.Checkout.STRATEGY.FORCE});
                        }
                    });
                })
                .then(function() {
                    return NodeGit.Submodule.reloadAll(repo, 1);
                })
                .then(function() {
                    return Q.nfcall(fs.readFile, path.join(repoPath, '.gitmodules'), 'utf-8')
                        .then(function(data) {
                            var submoduleConfig = ini.parse(data);

                            return Promise.all(Object.keys(submoduleConfig).map(function(sectionName) {
                                var match = /submodule \"(.+)\"/.match(sectionName);

                                if (match && match[1]) {
                                    return NodeGit.Submodule.lookup(repo, match[1]).then(function(submodule) {
                                        return submodule.update(1, null);
                                    });
                                }
                            }));
                        }, function() {
                            return;
                        });
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
                    return NodeGit.Clone(url, repoPath, {checkoutBranch: branchName});
                });
        });
}

function ambuild(repo, extraArgs, extraEnv) {
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

            configure.stdout.pipe(process.stdout);
            configure.stderr.pipe(process.stderr);

            configure.on('exit', function(code, signal) {
                if (signal || code) {
                    deferred.reject(new Error(signal || code));
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

            build.stdout.pipe(process.stdout);
            build.stderr.pipe(process.stderr);

            build.on('exit', function(code, signal) {
                if (signal || code) {
                    deferred.reject(new Error(signal || code));
                }
                else {
                    deferred.resolve();
                }
            });

            return deferred.promise;
        });
}

async.auto({
    'hl2sdk': function() {
        return checkoutBranchOfRepo(path.resolve(argv.hl2sdk), 'https://github.com/alliedmodders/hl2sdk.git', 'tf2');
    },
    'metamod': function() {
        return checkoutBranchOfRepo(path.resolve(argv.metamod), 'https://github.com/alliedmodders/metamod-source.git', argv.metamodBranch || 'master');
    },
    'sourcemod': function() {
        return checkoutBranchOfRepo(path.resolve(argv.sourcemod), 'https://github.com/alliedmodders/sourcemod.git', argv.sourcemodBranch || 'master');
    },
    'metamod-build': ['hl2sdk', 'metamod', function(results) {
        return ambuild(path.resolve(argv.metamod), ['--sdks=tf2'], {'HL2SDKTF2': path.resolve(argv.hl2sdk)});
    }],
    'sourcemod-build': ['hl2sdk', 'metamod', 'sourcemod', function(results) {
        return ambuild(path.resolve(argv.sourcemod), ['--sdks=tf2', '--no-mysql'], {'HL2SDKTF2': path.resolve(argv.hl2sdk), 'MMSOURCE_DEV': path.resolve(argv.metamod)});
    }]
}).done();
