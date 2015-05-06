#! /usr/bin/env node

var yargs = require('yargs');

var argv = yargs
    .describe('hl2sdk', 'path to the HL2SDK Git repository')
    .requiresArg('hl2sdk')
    .string('hl2sdk')
    .describe('metamod', 'path to the Metamod:Source Git repository')
    .requiresArg('metamod')
    .string('metamod')
    .implies('metamod', 'hl2sdk')
    .describe('sourcemod', 'path to the SourceMod Git repository')
    .requiresArg('sourcemod')
    .string('sourcemod')
    .implies('sourcemod', 'metamod')
    .help('h')
    .alias('h', 'help')
    .argv;
