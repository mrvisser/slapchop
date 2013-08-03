
var _ = require('underscore');
var fs = require('fs');
var slapchop = require('../../index');
var util = require('util');

var execute = module.exports.execute = function(client, environment, templates, machines, opts, callback) {
    var output = 'fabfile/setup.py';

    var roledefs = {};
    var provisionGroups = [];
    _.each(machines, function(machine, name) {
        if (machine.remote) {
            // Tell the fabric scripts the machine roles
            roledefs[machine.template.name] = roledefs[machine.template.name] || [];
            roledefs[machine.template.name].push('root@' + machine.remote.primaryIp);

            // Add all machines except puppet to the provisioning groups. It is special
            if (machine.name !== 'puppet') {
                // Set up the ordered provisioning groups so we can order things as optimally as possible in fabric
                provisionGroups[machine.provisionGroup] = provisionGroups[machine.provisionGroup] || {'names': [], 'hosts': []};
                provisionGroups[machine.provisionGroup].names.push(machine.name);
                provisionGroups[machine.provisionGroup].hosts.push('root@' + machine.remote.primaryIp);
            }
        }
    });

    // If puppet was in a group on its own (which it normally would be), we can end up with a null
    // provision group. Just pluck out falsey groups as the index doesn't matter, just the order
    provisionGroups = _.compact(provisionGroups);

    var pythonTemplate = fs.readFileSync(__dirname + '/fabric-setup/setup.py.jst', {'encoding': 'utf-8'});
    var pythonData = {
        'roledefs': roledefs,
        'puppetInternalIp': machines['puppet'].remote.ips[1],
        'puppetHost': 'root@' + machines['puppet'].remote.primaryIp,
        'provisionGroups': provisionGroups
    };

    fs.writeFileSync(output, _.template(pythonTemplate, pythonData));
    return callback();
};
