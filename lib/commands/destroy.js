// ##### NOTE this file needs cleaning up
var _ = require('underscore');
var prompt = require('prompt');
var slapchop = require('../../index');
var util = require('util');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {

    // Filter down to just machines that have remote instances
    var machinesToDestroy = {};
    var machinesToStop = {};
    _.each(machines, function(machine, name) {
        if (machine.remote) {
            machinesToDestroy[name] = machine;
//            if (machine.remote.state === 'running') {
//                machinesToStop[name] = machine;
//            }
        }
    });

    prompt.start();
    prompt.get({
        'name': 'destroy',
        'description': 'The following machines will be irrecoverably destroyed: ' + JSON.stringify(_.keys(machinesToDestroy)) + '. Continue? (y / n)'
    }, function(err, result) {
        if (err) {
            slapchop.util.logError('slapchop', 'Error accepting input:', err);
            return callback(err);
        } else if (result.destroy !== 'y') {
            slapchop.util.log('slapchop', 'Aborting destroy process at user\' request');
            return callback();
        }

//  commented these out as no need to shutdown and then terminate, it can be done in one step
//        slapchop.util.shutdown(client, _.values(machinesToStop), function(err) {
//            if (err) {
//                slapchop.util.logError('slapchop', 'Error shutting down machines', err);
//                return callback(err);
//            }

//            slapchop.util.monitor(client, _.keys(machinesToDestroy), 'stopped', function(err) {
//                if (err) {
//                    slapchop.util.logError('slapchop', 'Error waiting for machines to shut down', err);
//                    return callback(err);
//                }

                slapchop.util.destroy(client, _.values(machinesToDestroy), function(err) {
                    if (err) {
                        slapchop.util.logError('slapchop', 'Error destroying machines', err);
                        return callback(err);
                    }

                    slapchop.util.monitor(client, _.keys(machines), 'terminated', function(err) {
                        if (err) {
                            slapchop.util.logError('slapchop', 'Error waiting for machines to be deleted', err);
                            return callback(err);
                        }

                        // terminated instances interfere and changing their name helps
                        slapchop.util.updatename(client, _.values(machinesToDestroy), function(err) {
                            if (err) {
                                slapchop.util.logError('slapchop', 'Error changing terminated instance name', err);
                                return callback(err);
                            }
                            slapchop.util.log('slapchop', 'All machines have been destroyed', 'green');
                            return callback();
                        });
                    });
                });
//            });
//        });
    });
};
