
var _ = require('underscore');
var colors = require('colors');
var fs = require('fs');
var slapchop = require('../index');
var util = require('util');

/**
 * Load and parse a JSON file from disk.
 */
var loadJson = module.exports.loadJson = function(path) {
    return JSON.parse(fs.readFileSync(path));
};

/**
 * Create the given array of machines
 */
var create = module.exports.create = function(client, machinesToCreate, callback, _failures) {
    if (machinesToCreate.length === 0) {
        return callback();
    }

    // Track machine creation failures and retry since the API can be flakey sometimes
    _failures = _failures || {};

    var machine = machinesToCreate.shift();

    // Log this creation attempt
    var msg = util.format('Sending creation request to %s', machine.name);
    if (_failures[machine.name]) {
        msg += util.format(' (Retry #%s)', _failures[machine.name]);
    }
    slapchop.util.log('slapchop', msg);

    var args = {'name': machine.name, 'dataset': machine.template.system.datasetUrn, 'package': machine.template.system['package']};
    console.log('Creating machine: %s', JSON.stringify(args, null, 4));

    client.createMachine(args, function(err, remoteMachine) {
        if (err) {
            slapchop.util.logError(machine.name, 'Error receiving creation request. Will try again', err);

            // Increment the failures for this machine and push it back on the stack to be retried
            _failures[machine.name] = (_failures[machine.name]) ? _failures[machine.name] + 1 : 1;
            machineArray.push(machine);

        } else {
            slapchop.util.log(machine.name, 'Successfully received creation request. Starting up.', 'green');
            machine.remote = remoteMachine;
        }

        create(client, machinesToCreate, callback, _failures);
    });
};

/**
 * Start the given array of machines
 */
var startup = module.exports.startup = function(client, machinesToStartup, callback, _failures, _i) {
    machinesToStartup = machinesToStartup || [];
    if (machinesToStartup.length === 0) {
        return callback();
    }

    _failures = _failures || {};
    _i = _i || 0;

    var machine = machinesToStartup.shift();

    // Log startup status for user
    var msg = util.format('Sending startup request to %s', machine.name);
    if (_failures[machine.name]) {
        msg += util.format(' (Retry #%s)', _failures[machine.name]);
    }
    slapchop.util.log('slapchop', msg);

    // Perform the startup
    client.startMachine(machine.remote.id, function(err) {
        if (err) {
            slapchop.util.logError(machine.name, 'Error receiving startup request. Will try again.', err);

            // Increment the failures for this machine and push it back on the stack to be retried
            _failures[machine.name] = (_failures[machine.name]) ? _failures[machine.name] + 1 : 1;
            machinesToStartup.push(machine);

        } else {
            slapchop.util.log(machine.name, 'Successfully received startup request.', 'green');
        }

        startup(client, machinesToStartup, callback, _failures, _i + 1);
    });
};

/**
 * Shutdown the given array of machines.
 */
var shutdown = module.exports.shutdown = function(client, machinesToStop, callback, _failures) {
    machinesToStop = machinesToStop || [];
    if (machinesToStop.length === 0) {
        return callback();
    }

    _failures = _failures || {};
    
    var machine = machinesToStop.shift();

    // Log shutdown status for user
    var msg = util.format('Sending shutdown request to %s', machine.name);
    if (_failures[machine.name]) {
        msg += util.format(' (Retry #%s)', _failures[machine.name]);
    }
    slapchop.util.log('slapchop', msg);

    client.stopMachine(machine.remote.id, function(err) {
        if (err) {
            slapchop.util.logError(machine.name, 'Error receiving shutdown request. Will try again.', err);

            // Increment the failures for this machine and push it back on the stack to be retried
            _failures[machine.name] = (_failures[machine.name]) ? _failures[machine.name] + 1 : 1;
            machinesToStop.push(machine);
        } else {
            slapchop.util.log(machine.name, 'Successfully received shutdown request. Powering down.', 'green');
        }

        shutdown(client, machinesToStop, callback, _failures);
    });
};

/**
 * Delete the given array of machines
 */
var destroy = module.exports.destroy = function(client, machinesToDestroy, callback, _failures, _i) {
    machinesToDestroy = machinesToDestroy || [];
    if (machinesToDestroy.length === 0) {
        return callback();
    }

    _failures = _failures || {};
    _i = _i || 0;

    var machine = machinesToDestroy.shift();

    // Log delete status for user
    var msg = util.format('Sending delete request to %s', machine.name);
    if (_failures[machine.name]) {
        msg += util.format(' (Retry #%s)', _failures[machine.name]);
    }
    slapchop.util.log('slapchop', msg);

    // Perform the delete
    client.deleteMachine(machine.remote.id, function(err) {
        if (err) {
            slapchop.util.logError(machine.name, 'Error receiving delete request. Will try again.', err);

            // Increment the failures for this machine and push it back on the stack to be retried
            _failures[machine.name] = (_failures[machine.name]) ? _failures[machine.name] + 1 : 1;
            machinesToDestroy.push(machine);

        } else {
            slapchop.util.log(machine.name, 'Successfully received delete request.', 'green');
        }

        destroy(client, machinesToDestroy, callback, _failures, _i + 1);
    });
};

/**
 * Monitor a set of machines until they change into the specified status.
 */
var monitor = module.exports.monitor = function(client, names, status, callback, _inStatus, _i) {
    if (status === 'deleted') {
        return _monitorDeleted(client, names, callback);
    }

    _inStatus = _inStatus || {};
    _i = _i || 0;

    if (_i === 0) {
        log('slapchop', 'Waiting for ' + names.length + ' machine(s) to enter "' + status + '" state');
    }

    client.listMachines(function(err, machines) {
        if (err) {
            log('slapchop', 'Error polling for machine status. Skipping and continuing to poll any way.', 'yellow');
            return setTimeout(monitor, 1000, client, names, status, callback, _inStatus, _i);
        }

        console.log('Listed: %s', JSON.stringify(machines, null, 4));

        // Detect state changes in relevant machines
        var hadNodeNotInStatus = false;
        _.each(machines, function(machine) {
            if (_.contains(names, machine.name)) {
                if (machine.state !== status) {
                    hadNodeNotInStatus = true;
                } else if (machine.state === status && !_inStatus[machine.name]) {
                    log(machine.name, 'In status ' + status.white, 'green');
                    _inStatus[machine.name] = true;
                }
            }
        });

        if (hadNodeNotInStatus) {
            if (_i !== 0 && _i % 5 === 0) {
                log('slapchop', 'Still waiting for ' + (names.length - _.keys(_inStatus).length) + ' machines to enter "' + status + '" state');
            }

            return setTimeout(monitor, 1000, client, names, status, callback, _inStatus, _i + 1);
        } else {
            return callback();
        }
    });
};

/**
 * Log a generic message with a color.
 */
var log = module.exports.log = function(name, content, color) {
    if (!content) {
        return;
    }

    color = color || 'grey';
    var lines = content.split('\n');
    _.each(lines, function(line) {
        console.log('['[color] + name.white + '] '[color] + line[color]);
    });
};

/**
 * Log an error to the console
 */
var logError = module.exports.logError = function(name, content, err) {
    log(name, content, 'red');
    if (err) {
        log(name, err.message, 'red');
        if (err.stack) {
            log(name, err.stack, 'red');
        }
    }
};

var _monitorDeleted = function(client, names, callback, _deleted, _i) {
    _deleted = _deleted || [];
    _i = _i || 0;

    if (_i === 0) {
        log('slapchop', 'Waiting for ' + names.length + ' machines to become deleted');
    }

    client.listMachines(function(err, machines) {
        if (err) {
            return callback(err);
        }

        var toDelete = names;
        var existing = [];
        _.each(machines, function(machine) {
            existing.push(machine.name);
        });

        var remaining = _.intersection(toDelete, existing);
        var deleted = _.difference(toDelete, existing);

        _.each(deleted, function(machineName) {
            if (!_.contains(_deleted, machineName)) {
                slapchop.util.log(machineName, 'I am deleted', 'green');
                _deleted.push(machineName);
            }
        });

        if (remaining.length > 0) {
            if (_i !== 0 && _i % 5 === 0) {
                log('slapchop', 'Still waiting for ' + remaining.length + ' machines to be deleted');
            }

            return setTimeout(_monitorDeleted, 1000, client, names, callback, _deleted, _i + 1);
        } else {
            return callback();
        }
    });
};