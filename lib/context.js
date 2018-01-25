
// ##### NOTE this file needs much tidying
var _ = require('underscore');
var extend = require('extend');
var fs = require('fs');
var prompt = require('prompt');
//var smartdc = require('smartdc');
//var smartdcCommon = require('smartdc/lib/cli_common');
// replacing the above
var aws = require('aws-sdk');
//var awsCommon = require('aws-sdk/lib/cli_common'); // i have no idea yet
// 
var util = require('util');

var slapchop = require('../index');

var client = null;
var environment = null;
var templates = null;
var machines = null;

/**
 * Initialize the slapchop context
 */
var init = module.exports.init = function(dir, filters, callback) {
    _parseEnvironment(dir, function(err, _environment) {
        if (err) {
            return callback(err);
        }

        environment = _environment;

        var color = (environment.name.indexOf('prod') === 0) ? 'red' : null;

        slapchop.util.log('slapchop', util.format('Environment: %s', environment.name.white), color);
        slapchop.util.log('slapchop', util.format('Account:     %s', environment.account.white), color);
        slapchop.util.log('slapchop', util.format('Data Center: %s', environment.datacenter.white), color);
        slapchop.util.log('slapchop', util.format('SSH key:     %s', environment.keyname.white), color);
        slapchop.util.log('slapchop', ' ', color);

        _parseTemplates(dir, function(err, _templates) {
            if (err) {
                return callback(err);
            }

            templates = _templates;

            _expandLocalMachineDefinitions(environment, templates, function(err, _machines) {
                if (err) {
                    return callback(err);
                }

                _filterMachines(_machines, filters, function(err, _machines) {
                    if (err) {
                        return callback(err);
                    }

                    machines = _machines;

                    _applyProvisionGroupsToMachines(environment, machines, function(err) {
                        if (err) {
                            return callback(err);
                        }

                        _createClient(environment.account, environment.datacenter, function(err, _client) {
                            if (err) {
                                return callback(err);
                            }

                            client = _client;

                            slapchop.util.log('slapchop', 'Fetching remote machine information');
                            _applyRemoteMachineDefinitions(client, machines, function(err) {
                                if (err) {
                                    return callback(err);
                                }

                                return callback(null, client, environment, templates, machines);
                            });
                        });
                    });
                });
            });
        });
    });
};

var _parseEnvironment = function(dir, callback) {
    try {
        return callback(null, slapchop.util.loadJson(util.format('%s/environment.json', dir)));
    } catch (err) {
        return callback(err);
    }
};

var _parseTemplates = function(dir, callback) {
    try {
        var templates = slapchop.util.loadJson(util.format('%s/templates.json', dir));

        // Apply the name to each template
        _.each(templates, function(template, name) {
            template.name = name;
        });

        return callback(null, templates);
    } catch (err) {
        return callback(err);
    }
};

var _expandLocalMachineDefinitions = function(environment, templates, callback) {
    var nodes = {};

    _.each(environment.nodes, function(spec, type) {
        // Determine the names of the nodes based on the type of the spec
        var names = [];
        if (_.isArray(spec)) {
            names = spec;
        } else if (_.isNumber(spec)) {
            for (var i = 0; i < spec; i++) {
                names.push(util.format('%s%s', type, i));
            }
        } else if (_.isString(spec)) {
            names.push(spec);
        }

        _.each(names, function(name) {
            nodes[name] = {'name': name, 'template': extend(true, {}, templates[type])};
        });
    });

    return callback(null, nodes);
};

/*!
 * Categorize the machines into provision groups based on the provisionGroup specificiation
 * in the environment file
 */
var _applyProvisionGroupsToMachines = function(environment, machines, callback) {

    // Tag each machine with the provision group
    _.each(environment.provisionGroups, function(provisionGroup, provisionGroupIndex) {
        _.each(provisionGroup, function(filter) {
            if (filter.indexOf('~') === 0) {
                throw new Error('Invalid filter expression in provision group ' + provisionGroupIndex + ', cannot use negation filters');
            }

            filter = _parseFilter(filter);
            _.each(machines, function(machine, name) {
                if (!_.isNumber(machine.provisionGroup)) {
                    if (_.isRegExp(filter.val) && filter.val.test(name)) {
                        machine.provisionGroup = provisionGroupIndex;
                    } else if (_.isString(filter.val) && filter.val === name) {
                        machine.provisionGroup = provisionGroupIndex;
                    }
                }
            });
        });
    });

    // Throw an error if any machines did not belong to provision groups
    _.each(machines, function(machine, name) {
        if (!_.isNumber(machine.provisionGroup)) {
            throw new Error('Machine "' + name + '" did not belong to a provision group. Please check the provisionGroup expressions in the environment configuration.');
        }
    });

    return callback();
};

var _filterMachines = function(machines, filters, callback) {
    if (!filters) {
        return callback(null, machines);
    } else if (!_.isArray(filters)) {
        filters = [filters];
    } else if (filters.length === 0) {
        return callback(null, machines);
    }

    filters = _.map(filters, function(filter) { return _parseFilter(filter); });

    // Split the filters into includes and excludes
    var includes = _.where(filters, {'not': false});
    var excludes = _.where(filters, {'not': true});

    var filteredMachines = {};

    // First filter the filters down to those that are included
    _.each(machines, function(machine, name) {
        if (includes && includes.length > 0) {
            _.each(includes, function(includeFilter) {
                if (_.isRegExp(includeFilter.val) && includeFilter.val.test(name)) {
                    // Test RegExp
                    filteredMachines[name] = machine;
                } else if (!_.isRegExp(includeFilter.val) && includeFilter.val === name) {
                    // Test literal match
                    filteredMachines[name] = machine;
                }
            });
        } else {
            // If there are no inclusion filters, we assume all are included and we are only excluding
            filteredMachines[name] = machine;
        }
    });

    // Now remove those that are excluded
    _.each(excludes, function(excludeFilter) {
        _.each(filteredMachines, function(machine, name) {
            if (_.isRegExp(excludeFilter.val) && excludeFilter.val.test(name)) {
                // Test RegExp
                delete filteredMachines[name];
            } else if (!_.isRegExp(excludeFilter.val) && excludeFilter.val === name) {
                // Test literal match
                delete filteredMachines[name];
            }
        });
    });

    return callback(null, filteredMachines);
};

var _parseFilter = function(filter) {
    var not = false;
    var val = null;

    if (filter[0] === '~') {
        not = true;
        filter = filter.slice(1);
    }

    if (filter[0] === '/' && filter[filter.length -1] === '/') {
        // RegExp
        filter = filter.slice(1, -1);
        val = new RegExp(filter);
    } else {
        // Literal
        val = filter;
    }

    return {'not': not, 'val': val};
};

var _createClient = function(account, datacenter, callback) {
    if (client) {
        return callback(client);
    }

/*    var processArgvBefore = process.argv;
    process.argv = process.argv.slice(0, 2);

    process.argv.push('-a');
    process.argv.push(account);

    process.argv.push('-u');
    process.argv.push(util.format('https://%s.api.joyentcloud.com', datacenter));

    var options = {'account': String, 'url': String, 'keyId': String};
    var shortOptions = {'a': ['--account'], 'u': ['--url'], 'k': ['--keyId']};

    smartdcCommon.parseArguments(options, shortOptions, function(parsed) {
        process.argv = processArgvBefore;
        callback(null, smartdcCommon.newClient(parsed));
    });
*/

    // check the required environment variables are available
    var _awsenvvarsok = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_DEFAULT_REGION;
    if (!_awsenvvarsok) {
// for the moment I decided agaist this as other errs in this file are handled differently
//      return callback(new Error('AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY and AWS_DEFAULT_REGION must all be set in your environment, quitting.'));
      throw new Error('AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY and AWS_DEFAULT_REGION must all be set in your environment, quitting.');
    }

    // required config for aws api
    aws.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_DEFAULT_REGION
    });

    // create the client
    var ec2 = new aws.EC2();
    callback(null, ec2);

};

/*
var _applyRemoteMachineDefinitions = function(client, machines, callback) {
    client.listMachines(function(err, remoteMachines) {
        if (err) {
            return callback(err);
        }

        _.each(remoteMachines, function(remoteMachine) {

            // Delete the ssh pubkeys from the output because it's really verbose
            delete remoteMachine.metadata;

            var localMachine = machines[remoteMachine.name];
            if (localMachine) {
                localMachine.remote = remoteMachine;
            }
        });

        return callback();
    });
};
*/

var _applyRemoteMachineDefinitions = function(client, machines, callback) {

    // var params = { };
    var params = { Filters: [ { Name: 'tag:Name', Values: _.pluck(machines, 'name') } ] };

    client.describeInstances(params, function(err, remoteMachines) {
        if (err) {
            return callback(err);
        }

        _.each(remoteMachines.Reservations, function(remoteMachine) {
            // There should only be one Name key and so I just use the first one
            var localMachine = machines[_.where(remoteMachine.Instances[0].Tags, { Key: 'Name' })[0].Value];
            localMachine.remote = remoteMachine;
        });
        return callback();
    });
};

