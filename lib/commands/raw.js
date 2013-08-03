
var _ = require('underscore');
var slapchop = require('../../index');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {
    _.each(machines, function(machine, name) {
        slapchop.util.log(name, JSON.stringify(machine, null, 4));
    });

    return callback();
};
