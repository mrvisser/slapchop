
var _ = require('underscore');
var slapchop = require('../../index');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {
    _.each(machines, function(machine, name) {
        if (machine.remote) {
            slapchop.util.log(name, 'I am in state "' + machine.remote.state + '" with IP ' + machine.remote.primaryIp, 'green');
        } else {
            slapchop.util.log(name, 'I have not been bootstrapped', 'yellow');
        }
    });

    return callback();
};
