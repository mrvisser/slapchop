
var _ = require('underscore');
var slapchop = require('../../index');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {
    _.each(machines, function(machine, name) {
        if (machine.remote) {
            var primaryIp = machine.remote.Instances[0].PublicIpAddress;
            var secondaryIp = machine.remote.Instances[0].PrivateIpAddress;
            slapchop.util.log(name, 'I am in state "' + machine.remote.Instances[0].State.Name + '" with IP ' + primaryIp + ' (' + secondaryIp + ')', 'green');
        } else {
            slapchop.util.log(name, 'I have not been bootstrapped', 'yellow');
        }
    });

    return callback();
};
