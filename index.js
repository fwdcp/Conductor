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

var hl2sdk = path.resolve(argv.hl2sdk);
var metamod = path.resolve(argv.metamod);
var sourcemod = path.resolve(argv.sourcemod);

async.auto({
    'hl2sdk': function() {
        return NodeGit.Repository.open(hl2sdk).catch(function() {
            return Q.nfcall(fs.mkdirs, hl2sdk)
                .then(function() {
                    return Q.nfcall(fs.emptyDir, hl2sdk);
                })
                .then(function() {
                    return NodeGit.Clone('https://github.com/alliedmodders/hl2sdk.git', hl2sdk, {checkoutBranch: 'tf2'});
                });
        });
    },
    'metamod': function() {
        return NodeGit.Repository.open(metamod).catch(function() {
            return Q.nfcall(fs.mkdirs, metamod)
                .then(function() {
                    return Q.nfcall(fs.emptyDir, metamod);
                })
                .then(function() {
                    return NodeGit.Clone('https://github.com/alliedmodders/metamod-source.git', metamod, {checkoutBranch: argv.metamod-branch || 'master'});
                });
        });
    },
    'sourcemod': function() {
        return NodeGit.Repository.open(sourcemod).catch(function() {
            return Q.nfcall(fs.mkdirs, sourcemod)
                .then(function() {
                    return Q.nfcall(fs.emptyDir, sourcemod);
                })
                .then(function() {
                    return NodeGit.Clone('https://github.com/alliedmodders/sourcemod.git', sourcemod, {checkoutBranch: argv.sourcemod-branch || 'master'});
                });
        });
    },
    'metamod-build': ['hl2sdk', 'metamod', function(results) {
        console.log(arguments);
    }]
}).done();
