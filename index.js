#! /usr/bin/env node

var async = require('async-q');
var fs = require('fs-extra');
var NodeGit = require('nodegit');
var Q = require('q');
var yargs = require('yargs');

var argv = yargs
    .usage('$0 <command> <server-path>')
    .command('install', 'install a server')
    .command('update', 'update a server')
    .command('run', 'run a server')
    .command('run-updated', 'run a server after updating it')
    .default('hl2sdk', './hl2sdk')
    .describe('hl2sdk', 'path to the HL2SDK Git repository')
    .requiresArg('hl2sdk')
    .string('hl2sdk')
    .default('metamod', './metamod')
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

async.auto({
    'hl2sdk': function() {
        return NodeGit.Repository.open(argv.hl2sdk).catch(function() {
            return Q.nfcall(fs.mkdirs, argv.hl2sdk)
                .then(function() {
                    return Q.nfcall(fs.emptyDir, argv.hl2sdk);
                })
                .then(function() {
                    return NodeGit.Clone('https://github.com/alliedmodders/hl2sdk.git', argv.hl2sdk);
                });
        });
    },
    'metamod': function() {
        return NodeGit.Repository.open(argv.metamod).catch(function() {
            return Q.nfcall(fs.mkdirs, argv.metamod)
                .then(function() {
                    return Q.nfcall(fs.emptyDir, argv.metamod);
                })
                .then(function() {
                    return NodeGit.Clone('https://github.com/alliedmodders/metamod-source.git', argv.hl2sdk);
                });
        });
    },
    'sourcemod': function() {
        return NodeGit.Repository.open(argv.sourcemod).catch(function() {
            return Q.nfcall(fs.mkdirs, argv.sourcemod)
                .then(function() {
                    return Q.nfcall(fs.emptyDir, argv.sourcemod);
                })
                .then(function() {
                    return NodeGit.Clone('https://github.com/alliedmodders/sourcemod.git', argv.hl2sdk);
                });
        });
    }
});
