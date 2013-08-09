
var _ = require('underscore');
var slapchop = require('../../index');
var util = require('util');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {
    _.each(machines, function(machine, name) {
        if (!machine.remote) {
            return;
        }

        var target = (opts.user) ? util.format('%s@%s', opts.user, machine.remote.primaryIp) : machine.remote.primaryIp;
        console.log(util.format('export %s_%s="%s"', environment.name, name.replace(/-/g, '_'), target));
    });

    return callback();
};
