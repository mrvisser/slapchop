
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
            // aws instances hang around for some time even when terminated
            if (machine.remote.Instances[0].State.Name != 'terminated') {
                // Tell the fabric scripts the machine roles
                roledefs[machine.template.name] = roledefs[machine.template.name] || [];
                roledefs[machine.template.name].push(machine.remote.Instances[0].PublicIpAddress);

                // Add all machines except puppet to the provisioning groups. It is special
//                if (machine.name !== 'puppet') {
                    // Set up the ordered provisioning groups so we can order things as optimally as possible in fabric
                provisionGroups[machine.provisionGroup] = provisionGroups[machine.provisionGroup] || {'names': [], 'hosts': []};
                provisionGroups[machine.provisionGroup].names.push(machine.name);
                provisionGroups[machine.provisionGroup].hosts.push(machine.remote.Instances[0].PublicIpAddress);
//                }
            }
        }
    });

    // If puppet was in a group on its own (which it normally would be), we can end up with a null
    // provision group. Just pluck out falsey groups as the index doesn't matter, just the order
    provisionGroups = _.compact(provisionGroups);

    var pythonTemplate = fs.readFileSync(__dirname + '/fabric-setup/setup.py.jst', {'encoding': 'utf-8'});
    var pythonData = {
        'roledefs': roledefs,
//        'puppetInternalIp': machines['puppet'].remote.Instances[0].PrivateIpAddress,
//        'puppetHost': machines['puppet'].remote.Instances[0].PublicIpAddress,
        'provisionGroups': provisionGroups
    };

    fs.writeFileSync(output, _.template(pythonTemplate, pythonData));
    return callback();
};
