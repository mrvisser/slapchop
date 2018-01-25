
var _ = require('underscore');
var prompt = require('prompt');
var slapchop = require('../../index');
var util = require('util');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {
    var machinesToReboot = {};
    _.each(machines, function(machine, name) {
        machinesToReboot[name] = machine;
    });

    _promptReboot(_.keys(machinesToReboot), opts.yes, function(err, yes) {
        if (err) {
            return callback(err);
        } else if (!yes) {
            slapchop.util.log('slapchop', 'Aborting at user\'s request');
            return callback();                                                                         
        }

        slapchop.util.reboot(client, _.values(machinesToReboot), function(err) {
            if (err) {
                slapchop.util.logError('slapchop', 'Error shutting down machines for restart', err);
                return callback(err);
            }

            slapchop.util.monitor(client, _.keys(machinesToReboot), 'running', function(err) {
                if (err) {
                    slapchop.util.logError('slapchop', 'Error while waiting for machines to stop', err);
                    return callback(err);
                }

                slapchop.util.log('slapchop', 'All machines have been rebooted', 'green');

            });
        });
    });
};

var _promptReboot = function(machineNames, overrideYes, callback) {
    if (overrideYes || !machineNames || machineNames.length === 0) {
        return callback(null, true);
    }

    // Prompt user if they're sure they want reboot
    prompt.start();
    prompt.get({
        'name': 'reboot',
        'description': util.format('The following machines will be rebooted: %s. Continue? (y / n)', JSON.stringify(machineNames))
    }, function(err, result) {
        if (err) {
            slapchop.util.logError('slapchop', 'Error accepting input:', err);
            return callback(err);
        }

        return callback(null, (result.reboot === 'y'));
    });
};
