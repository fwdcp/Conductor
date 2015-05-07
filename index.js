#! /usr/bin/env node

var async = require('async-q');
var child_process = require('child_process');
var fs = require('fs-extra');
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

function checkoutBranchOfRepo(path, url, branchName) {
    return NodeGit.Repository.open(path).then(function(repo) {
        return NodeGit.Remote.lookup(repo, 'origin').catch(function() {
            return NodeGit.Remote.create(repo, 'origin', url);
        }).then(function(remote) {
            return remote.fetch(null, repo.defaultSignature(), null);
        }).then(function() {
            return NodeGit.Branch.lookup(repo, branchName, NodeGit.Branch.BRANCH.LOCAL).then(function() {
                return repo.mergeBranches(branchName, 'origin/' + branchName);
            }, function() {
                return repo.getBranchCommit('origin/' + branchName).then(function(commit) {
                    return repo.createBranch(branchName, commit, 0, repo.defaultSignature());
                }).then(function(branch) {
                    NodeGit.Branch.setUpstream(branch, 'origin/' + branchName);
                    return NodeGit.Branch.lookup(repo, branchName, NodeGit.Branch.BRANCH.LOCAL);
                });
            });
        }).then(function() {
            return repo.getStatusExt().then(function(statuses) {
                if (statuses.length == 0) {
                    return repo.checkoutBranch(branchName, {checkoutStrategy: NodeGit.Checkout.STRATEGY.FORCE});
                }
            });
        }).then(function() {
            return repo;
        });
    }, function() {
        return Q.nfcall(fs.mkdirs, path)
            .then(function() {
                return Q.nfcall(fs.emptyDir, path);
            })
            .then(function() {
                return NodeGit.Clone(url, path, {checkoutBranch: branchName});
            });
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
        var metamodPath = path.resolve(argv.metamod);
        var env = {};
        Object.assign(env, process.env);
        env['HL2SDKTF2'] = path.resolve(argv.hl2sdk);

        fs.mkdirs(path.join(metamodPath, 'build'), function(err) {
            if (err) {
                throw err;
            }

            var configure = child_process.spawn('python', [
                path.join(metamodPath, 'configure.py'),
                '--sdks=tf2'
            ], {
                cwd: path.join(metamodPath, 'build'),
                env: env
            });

            configure.stdout.pipe(process.stdout);

            configure.on('exit', function(code, signal) {
                console.log(code, signal);
            });
        });
    }]
}).done();
