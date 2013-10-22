
var _ = require('underscore');
var prompt = require('prompt');
var slapchop = require('../../index');
var util = require('util');

var execute = module.exports.execute = function(environment, templates, machines, opts, callback) {
    slapchop.azure.helper.listEnvironment(environment, function(err, affinityGroups, networkConfig, storageAccounts, cloudServices) {
        if (err) {
            return callback(err);
        }

        var createAffinityGroup = (!_.findWhere(affinityGroups, {'Name': slapchop.azure.util.getAffinityGroupName(environment)}));
        var createVirtualNetwork = (!_.findWhere(networkConfig.VirtualNetworkConfiguration.VirtualNetworkSites, {'Name': slapchop.azure.util.getVirtualNetworkName(environment)}));
        var createStorageAccount = (!_.findWhere(storageAccounts, {'ServiceName': slapchop.azure.util.getStorageAccountName(environment)}));

        // Create the affinity group if necessary
        slapchop.util.invokeIfNecessary(createAffinityGroup, _createAffinityGroup, environment, function(err) {
            if (err) {
                return callback(err);
            }

            // Create the virtual network if necessary
            slapchop.util.invokeIfNecessary(createVirtualNetwork, _createVirtualNetwork, environment, networkConfig, function(err) {
                if (err) {
                    return callback(err);
                }

                // Create the storage account if necessary
                slapchop.util.invokeIfNecessary(createStorageAccount, _createStorageAccount, environment, function(err) {
                    if (err) {
                        return callback(err);
                    }

                    var calledBack = false;
                    var inProgress = [];
                    var finished = [];

                    slapchop.azure.helper.ensureMachinesCreated(environment, cloudServices, _.values(machines), function(erred) {
                        return callback();
                    });
                });
            });
        });
    });
};

var _createAffinityGroup = function(environment, callback) {
    var affinityGroupName = slapchop.azure.util.getAffinityGroupName(environment);
    slapchop.util.log('slapchop', util.format('Creating affinity group: %s', affinityGroupName.white));
    slapchop.azure.client.createAffinityGroup(affinityGroupName, {'Location': environment.location}, function(err) {
        if (err) {
            return callback(err);
        }

        slapchop.util.log('slapchop', util.format('Successfully created affinity group: %s', affinityGroupName.white), 'green');
        return callback();
    });
};

var _createVirtualNetwork = function(environment, currentNetworkConfig, callback) {
    var virtualNetworkName = slapchop.azure.util.getVirtualNetworkName(environment);
    slapchop.util.log('slapchop', util.format('Creating virtual network: %s', virtualNetworkName.white));

    // Add the network config to the current network config
    _addVirtualNetwork(currentNetworkConfig, environment);
    slapchop.azure.client.setNetworkConfig(currentNetworkConfig, function(err, response) {
        if (err) {
            return callback(err);
        }

        slapchop.util.log('slapchop', util.format('Successfully created virtual network: %s', virtualNetworkName.white), 'green');
        return callback();
    });
};

var _createStorageAccount = function(environment, callback) {
    var affinityGroupName = slapchop.azure.util.getAffinityGroupName(environment);
    var storageAccountName = slapchop.azure.util.getStorageAccountName(environment);
    slapchop.util.log('slapchop', util.format('Creating storage account: %s', storageAccountName.white));
    slapchop.azure.client.createStorageAccount(storageAccountName, {'AffinityGroup': affinityGroupName}, function(err) {
        if (err) {
            return callback(err);
        }

        slapchop.util.log('slapchop', util.format('Successfully created storage account: %s', storageAccountName.white), 'green');
        return callback();
    });
};

var _addVirtualNetwork = function(networkConfig, environment) {
    networkConfig.VirtualNetworkConfiguration.VirtualNetworkSites.push({
        "AddressSpace": [environment.network.addressCidr],
        "Subnets": [{
            "AddressPrefix": environment.network.subnetCidr,
            "Name": "Subnet-1"
        }],
        "DnsServersRef": [],
        "Name": slapchop.azure.util.getVirtualNetworkName(environment),
        "AffinityGroup": slapchop.azure.util.getAffinityGroupName(environment)
    });
};

