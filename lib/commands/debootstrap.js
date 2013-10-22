
var _ = require('underscore');
var prompt = require('prompt');
var slapchop = require('../../index');
var util = require('util');

var execute = module.exports.execute = function(environment, templates, machines, opts, callback) {
    slapchop.azure.helper.listEnvironment(environment, function(err, affinityGroups, networkConfig, storageAccounts, cloudServices, disks) {
        var deleteAffinityGroup = _.findWhere(affinityGroups, {'Name': slapchop.azure.util.getAffinityGroupName(environment)});
        var deleteVirtualNetwork = _.findWhere(networkConfig.VirtualNetworkConfiguration.VirtualNetworkSites, {'Name': slapchop.azure.util.getVirtualNetworkName(environment)});
        var deleteStorageAccount = _.findWhere(storageAccounts, {'ServiceName': slapchop.azure.util.getStorageAccountName(environment)});

        slapchop.azure.helper.ensureMachinesDestroyed(environment, cloudServices, disks, _.keys(machines), function(err) {
            if (err) {
                return callback(err);
            }

            // Delete the virtual network if it exists
            slapchop.util.invokeIfNecessary(deleteVirtualNetwork, _deleteVirtualNetwork, environment, networkConfig, function(err) {
                if (err) {
                    return callback(err);
                }

                return callback();
            });
        });
    });
};

var _deleteAffinityGroup = function(environment, callback) {
    var affinityGroupName = slapchop.azure.util.getAffinityGroupName(environment);
    slapchop.util.log('slapchop', util.format('Deleting affinity group: %s', affinityGroupName.white));
    slapchop.azure.client.deleteAffinityGroup(affinityGroupName, function(err) {
        if (err) {
            return callback(err);
        }

        slapchop.util.log('slapchop', util.format('Successfully deleted affinity group: %s', affinityGroupName.white), 'green');
        return callback();
    });
};

var _deleteVirtualNetwork = function(environment, currentNetworkConfig, callback) {
    var virtualNetworkName = slapchop.azure.util.getVirtualNetworkName(environment);
    _removeVirtualNetwork(currentNetworkConfig, environment);

    slapchop.util.log('slapchop', util.format('Deleting virtual network: %s', virtualNetworkName.white));
    slapchop.azure.client.setNetworkConfig(currentNetworkConfig, function(err, response) {
        if (err) {
            return callback(err);
        }

        slapchop.util.log('slapchop', util.format('Successfully deleted virtual network: %s', virtualNetworkName.white), 'green');
        return callback();
    });
};

var _deleteStorageAccount = function(environment, callback) {
    var affinityGroupName = slapchop.azure.util.getAffinityGroupName(environment);
    var storageAccountName = slapchop.azure.util.getStorageAccountName(environment);

    slapchop.util.log('slapchop', util.format('Deleting storage account: %s', storageAccountName.white));
    slapchop.azure.client.deleteStorageAccount(storageAccountName, function(err) {
        if (err) {
            return callback(err);
        }

        slapchop.util.log('slapchop', util.format('Successfully deleted storage account: %s', storageAccountName.white), 'green');
        return callback();
    });
};

var _removeVirtualNetwork = function(networkConfig, environment) {
    networkConfig.VirtualNetworkConfiguration.VirtualNetworkSites = _.filter(networkConfig.VirtualNetworkConfiguration.VirtualNetworkSites, function(virtualNetworkSite) {
        return (virtualNetworkSite.Name !== slapchop.azure.util.getVirtualNetworkName(environment));
    });
};
