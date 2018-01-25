
var _ = require('underscore');
var prompt = require('prompt');
var slapchop = require('../../index');
var util = require('util');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {
    
    // Collect all machines with no remote machine info, they need to be created
    var machinesToCreate = {};
    _.each(machines, function(machine, name) {
        if (!machine.remote || machine.remote.Instances[0].State.Name === 'terminated') {
            machinesToCreate[name] = machine;
        }
    });

    _promptCreate(_.keys(machinesToCreate), opts.yes, function(err, yes) {
        if (err) {
            return callback(err);
        } else if (!yes) {
            slapchop.util.log('slapchop', 'Aborting at user\'s request');
            return callback();
        }

        slapchop.util.create(client, _.values(machinesToCreate), environment.keyname, function(err) {
            if (err) {
                slapchop.util.logError('slapchop', 'Error creating machines', err);
                return callback(err);
            }

            if (_.values(machinesToCreate).length === 0) {
                slapchop.util.log('slapchop', 'All machines were already created', 'green');
            }

            slapchop.util.monitor(client, _.keys(machines), 'running', function(err) {
                if (err) {
                    slapchop.util.logError('slapchop', 'Error waiting for machines to enter "running" state', err);
                    return callback(err);
                }

                slapchop.util.log('slapchop', 'Machines are now available');
                return callback();
            });
        });
    });
};

var _promptCreate = function(machineNames, overrideYes, callback) {
    if (!machineNames || machineNames.length === 0) {
        return callback(null, true);
    } else if (overrideYes) {
        return callback(null, true);
    }

    // Prompt user to create machines
    prompt.start();
    prompt.get({
        'name': 'create',
        'description': util.format('The following machines will be created: %s. Continue? (y / n)', JSON.stringify(machineNames))
    }, function(err, result) {
        if (err) {
            slapchop.util.logError('slapchop', 'Error accepting input:', err);
            return callback(err);
        }

        return callback(null, (result.create === 'y'));
    });
};
