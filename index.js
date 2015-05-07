#! /usr/bin/env node

var async = require('async-q');
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
                    return NodeGit.Branch.create(repo, branchName, commit, true, NodeGit.Signature.default(repo));
                }).then(function() {
                    branch.setUpstream(branchName, 'origin');
                    return NodeGit.Branch.lookup(repo, branchName, NodeGit.Branch.BRANCH.LOCAL);
                });
            });
        }).then(function() {
            repo.checkoutBranch(branchName);
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
        return checkoutBranchOfRepo(path.resolve(argv.hl2sdk), 'https://github.com/alliedmodders/hl2sdk.git', 'tf2')
    },
    'metamod': function() {
        return checkoutBranchOfRepo(path.resolve(argv.metamod), 'https://github.com/alliedmodders/metamod-source.git', argv.metamodBranch || 'master')
    },
    'sourcemod': function() {
        return checkoutBranchOfRepo(path.resolve(argv.sourcemod), 'https://github.com/alliedmodders/sourcemod.git', argv.sourcemodBranch || 'master')
    },
    'metamod-build': ['hl2sdk', 'metamod', function(results) {
        console.log(arguments);
    }]
}).done();
