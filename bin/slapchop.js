#!/usr/bin/env node

var _ = require('underscore');
var optimist = require('optimist');
var slapchop = require('../index');
var util = require('util');

///////////////////////
// COMMAND-LINE ARGS //
///////////////////////

var argv = optimist
            .usage('Usage: slapchop [<command> (default: "list")] [-i <include filter> [-i <include filter> ...]] [-x <include filter> [-x <include filter> ...]]')

            .alias('h', 'help')
            .describe('h', 'Show this help dialogue')

            .alias('d', 'directory')
            .describe('d', 'The directory that contains the environment files')
            .default('d', '.')

            .alias('i', 'include')
            .describe('i', 'Inclusion filters to apply to the machine names. Can be literal "-i db0" or regex "-i /db[0-2]/". Will be overridden by any exclusion filter.')

            .alias('x', 'exclude')
            .describe('x', 'Exclusion filters to apply to the machine names. Can be literal "-x db0" or regex "-x /db[0-2]/". Will override and inclusion filter.')

            .alias('y', 'yes')
            .describe('y', 'Answer yes to confirmation prompt (not available for destruction commands)')

            .alias('o', 'output')
            .describe('o', 'Directory for result output')

            .argv;

var commandName = argv._.shift();
var command = null;

if (argv.h) {
    optimist.showHelp();
    process.exit(0);
} else if (!commandName) {
    commandName = 'list';
}

process.on('uncaughtException', function(err) {
    slapchop.util.logError('slapchop', 'An uncaught exception was raised to the application', err);
    process.exit(1);
});

// Ensure the command exists
try {
    command = require(util.format('../lib/commands/%s', commandName));
} catch (ex) {
    throw new Error(util.format('Command "%s" not found', commandName));
}

// Ensure the command implements the execute method
if (!_.isFunction(command.execute)) {
    throw new Error(util.format('Command "%s" did not have an execute method', commandName));
}

// Compress the include and exclude filters into one array with ~ prefixes for "not"
var filters = [];
if (argv.i && _.isArray(argv.i)) {
    filters = argv.i;
} else if (argv.i) {
    filters = [argv.i];
}

if (argv.x && _.isArray(argv.x)) {
    filters = _.union(filters, _.map(argv.x, function(excludeFilter) { return '~' + excludeFilter; }));
} else if (argv.x) {
    filters.push('~' + argv.x);
}

var opts = {'yes': argv.y, 'output': argv.o};

slapchop.context.init(argv.d, filters, function(err, client, environment, templates, machines) {
    if (err) {
        throw err;
    } else if (_.isEmpty(machines)) {
        slapchop.util.logError('slapchop', 'No machines selected, aborting');
        process.exit(1);
    }

    command.execute(client, environment, templates, machines, opts, function(err) {
        if (err) {
            throw err;
        }

        slapchop.util.log('slapchop', 'Complete', 'green');
        return process.exit(0);
    });
});
