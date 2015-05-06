#! /usr/bin/env node

var NodeGit = require("nodegit");
var yargs = require('yargs');

var argv = yargs
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

NodeGit.Repository.open(argv.hl2sdk).done();
