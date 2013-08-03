
var _ = require('underscore');
var prompt = require('prompt');
var slapchop = require('../../index');
var util = require('util');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {
    
    // Collect all machines with no remote machine info, they need to be created
    var machinesToShutdown = {};
    var machinesToStartup = {};
    _.each(machines, function(machine, name) {
        if (machine.remote && machine.remote.state === 'running') {
            machinesToShutdown[name] = machine;
            machinesToStartup[name] = machine;
        } else if (machine.remote && machine.remote.state === 'stopped') {
            machinesToStartup[name] = machine;
        } else {
            slapchop.util.log('slapchop', 'Machine "' + machine.name + '" is in an unknown state and cannot be restarted', 'yellow');
        }
    });

    _promptShutdown(_.keys(machinesToShutdown), opts.yes, function(err, yes) {
        if (err) {
            return callback(err);
        } else if (!yes) {
            slapchop.util.log('slapchop', 'Aborting at user\'s request');
            return callback();
        }

        slapchop.util.shutdown(client, _.values(machinesToShutdown), function(err) {
            if (err) {
                slapchop.util.logError('slapchop', 'Error shutting down machines for restart', err);
                return callback(err);
            }

            slapchop.util.monitor(client, _.keys(machinesToStartup), 'stopped', function(err) {
                if (err) {
                    slapchop.util.logError('slapchop', 'Error while waiting for machines to stop', err);
                    return callback(err);
                }

                slapchop.util.startup(client, _.values(machinesToStartup), function(err) {
                    if (err) {
                        slapchop.util.logError('slapchop', 'Error starting up machines', err);
                        return callback(err);
                    }

                    slapchop.util.monitor(client, _.keys(machinesToStartup), 'running', function(err) {
                        if (err) {
                            slapchop.util.logError('slapchop', 'Error while waiting for machines to startup', err);
                            return callback(err);
                        }

                        slapchop.util.log('slapchop', 'All machines have been rebooted', 'green');
                    });
                }); 
            });
        });
    });
};

var _promptShutdown = function(machineNames, overrideYes, callback) {
    if (!machineNames || machineNames.length === 0) {
        return callback(null, true);
    } else if (overrideYes) {
        return callback(null, true);
    }

    // Prompt user to shutdown
    prompt.start();
    prompt.get({
        'name': 'shutdown',
        'description': util.format('The following machines will be shutdown: %s. Continue? (y / n)', JSON.stringify(machineNames))
    }, function(err, result) {
        if (err) {
            slapchop.util.logError('slapchop', 'Error accepting input:', err);
            return callback(err);
        }

        return callback(null, (result.shutdown === 'y'));
    });
};
