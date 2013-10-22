
var _ = require('underscore');
var azure = require('azure');
var slapchop = require('../../index');
var util = require('util');

var listEnvironment = module.exports.listEnvironment = function(environment, callback) {
    var affinityGroups = null;
    var networkConfig = null;
    var cloudServices = null;
    var storageAccounts = null;
    var disks = null;

    slapchop.azure.client.listAffinityGroups(function(err, response) {
        if (err) {
            return callback(err);
        }

        affinityGroups = response.body;

        slapchop.azure.client.getNetworkConfig(function(err, response) {
            if (err && err.message !== 'Network configuration does not exist.') {
                return callback(err);
            } else if (err) {
                // If there is no network config, start with an empty one
                networkConfig = _emptyNetworkConfig();
            } else {
                networkConfig = response.body;
            }

            slapchop.azure.client.listHostedServices(function(err, response) {
                if (err) {
                    return callback(err);
                }

                cloudServices = response.body;

                slapchop.azure.client.listStorageAccounts(function(err, response) {
                    if (err) {
                        return callback(err);
                    }

                    storageAccounts = response.body;

                    slapchop.azure.client.listDisks(function(err, response) {
                        if (err) {
                            return callback(err);
                        }

                        disks = response.body;

                        return callback(null, affinityGroups, networkConfig, storageAccounts, cloudServices, disks);
                    });
                });
            });
        });
    });
};

var ensureMachinesCreated = module.exports.ensureMachinesCreated = function(environment, cloudServices, machines, callback) {
    var inProgress = [];
    var finished = [];
    var erred = [];
    var lastStatus = Date.now();

    var initialComplete = false;

    machines = machines.slice();

    /*!
     * Create the next machine
     */
    var _createNextMachine = function() {
        if (!machines.length) {
            initialComplete = true;
            return;
        }

        var machine = machines.shift();
        var cloudServiceName = slapchop.azure.util.getCloudServiceName(environment, machine.name);
        var deploymentName = slapchop.azure.util.getDeploymentName(environment, machine.name);
        var roleName = slapchop.azure.util.getRoleName(environment, machine.name);

        // If we already have a cloud service, don't bother trying to create the VM and its cloud service
        if (_.findWhere(cloudServices, {'ServiceName': cloudServiceName})) {
            return ensureMachinesCreated(environment, cloudServices, machines, callback);
        }

        slapchop.azure.client.createHostedService(cloudServiceName, {'AffinityGroup': slapchop.azure.util.getAffinityGroupName(environment)}, function(err) {
            if (err) {
                return callback(err);
            }

            var vmSpec = _vmSpec(environment, machine);
            slapchop.azure.client.createDeployment(cloudServiceName, deploymentName, vmSpec.role, vmSpec.deployment, {

                /*!
                 * Continue creating all the machines after first initial (asynchronous) return. After a machine has begun being created,
                 * we will simply continue to the next by recursively executing.
                 */
                'initial': function(err, response) {
                    if (err) {
                        slapchop.util.log(machine.name, util.format('I failed to receive create request: %s', err.message), 'red');
                        erred.push(machine.name);
                    } else {
                        inProgress.push(machine.name);
                        slapchop.util.log(machine.name, 'I successfully received create request', 'green');
                    }

                    return _createNextMachine();
                },

                'status': function(attempts) {
                    if (initialComplete && (Date.now() - lastStatus > 10000)) {
                        lastStatus = Date.now();
                        slapchop.util.log('slapchop', util.format('Still waiting for %s machine(s) to become created', _.difference(inProgress, finished).length));
                    }
                },

                // Each machine that finally finishes being created will invoke the final callback
                'final': function(err) {
                    if (err) {
                        slapchop.util.log(machine.name, util.format('I failed to finish creating: %s', err.message), 'red');
                        erred.push(machine.name);
                    }

                    finished.push(machine.name);
                    if (_.difference(inProgress, finished).length === 0) {
                        return callback((erred.length > 0) ? erred : null);
                    }
                }
            });
        });
    };

    _createNextMachine();
};

var ensureMachinesDestroyed = module.exports.ensureMachinesDestroyed = function(environment, cloudServices, disks, machineNames, callback) {
    if (_.isString(machineNames)) {
        return ensureMachinesDestroyed(environment, cloudServices, disks, [machineNames], callback);
    } else if (!machineNames || !machineNames.length) {
        return callback();
    }

    var localMachineName = machineNames.shift();
    var cloudServiceName = slapchop.azure.util.getCloudServiceName(environment, localMachineName);
    var deploymentName = slapchop.azure.util.getDeploymentName(environment, localMachineName);
    var roleName = slapchop.azure.util.getRoleName(environment, localMachineName);

    // If we don't have a cloud service, don't try and delete anything since it can't exist
    /*if (!_.findWhere(cloudServices, {'ServiceName': cloudServiceName})) {
        return ensureMachinesDestroyed(environment, cloudServices, disks, machineNames, callback);
    }*/

    slapchop.util.log('slapchop', util.format('Deleting virtual machine: %s', deploymentName.white));
    slapchop.azure.client.deleteDeployment(cloudServiceName, deploymentName, function(err) {
        if (err && err.message.indexOf('does not exist.') === -1) {
            return callback(err);
        }

        var storageAccountName = slapchop.azure.util.getStorageAccountName(environment);
        slapchop.azure.client.getStorageAccountKeys(storageAccountName, function(err, response) {
            if (err && err.message.indexOf('does not exist.') === -1) {
                return callback(err);
            }

            var storageAccountKey = response.body.StorageServiceKeys.Primary;

            // Find the image blob (stored file) that held this machine's disk and break the lease (lock) on it
            var blobService = azure.createBlobService(slapchop.azure.util.getBlobServiceConnectionString(environment, storageAccountKey));
            var osDiskBlobInfo = slapchop.azure.util.getOsBlobInfo(environment, localMachineName);

            blobService.breakLease(osDiskBlobInfo.container, osDiskBlobInfo.name, null, {'leaseBreakPeriod': 0}, function(err) {
                if (err && err.message.indexOf('does not exist.') === -1) {
                    return callback(err);
                }

                console.log('Broke the lease on the machine disk blob');

                blobService.acquireLease(osDiskBlobInfo.container, osDiskBlobInfo.name, function(err, lease) {
                    if (err && err.message.indexOf('does not exist.') === -1) {
                        return callback(err);
                    }

                    console.log('Acquired New Lease: %s', JSON.stringify(lease, null, 2));

                    blobService.releaseLease(osDiskBlobInfo.container, osDiskBlobInfo.name, lease.id, function(err) {
                        if (err) {
                            return callback(err);
                        }

                        console.log('Released the lease so now I can delete it');

                        blobService.deleteBlob(osDiskBlobInfo.container, osDiskBlobInfo.name, function(err) {
                            if (err && err.message.indexOf('does not exist.') === -1) {
                                return callback(err);
                            }

                            console.log('Deleted the blob');

                            // Delete its disk
                            var diskName = _.findWhere(disks, {'MediaLink': slapchop.azure.util.getOsDiskUri(environment, localMachineName)});
                            if (diskName) {
                                diskName = diskName.Name;
                            }

                            console.log('Deleting the disk');

                            slapchop.util.invokeIfNecessary(diskName, slapchop.azure.client.deleteDisk, diskName, function(err) {
                                if (err) {
                                    return callback(err);
                                }

                                console.log('Disk deleted');

                                slapchop.azure.client.deleteHostedService(cloudServiceName, function(err) {
                                    if (err) {
                                        return callback(err);
                                    }

                                    slapchop.util.log('slapchop', util.format('Successfully deleted virtual machine: %s', deploymentName.white), 'green');
                                    return ensureMachinesDestroyed(environment, cloudServices, disks, machineNames, callback);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
};

var _emptyNetworkConfig = function() {
    return {
        "$": {
            "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xmlns": "http://schemas.microsoft.com/ServiceHosting/2011/07/NetworkConfiguration"
        },
        "VirtualNetworkConfiguration": {
            "Dns": "",
            "VirtualNetworkSites": [],
            "LocalNetworkSites": []
        }
    };
};

var _vmSpec = function(environment, machine) {
    return {
        'role': {
            'RoleType': 'PersistentVMRole',
            'RoleName': slapchop.azure.util.getRoleName(environment, machine.name),
            'RoleSize': machine.template.system.size,
            'ConfigurationSets': [{
                'ConfigurationSetType': 'LinuxProvisioningConfiguration',
                'HostName': machine.name,
                'UserName': environment.username,
                'UserPassword': environment.password,
                'DisableSshPasswordAuthentication': false
            }],
            'OSVirtualHardDisk': {
                'MediaLink': slapchop.azure.util.getOsDiskUri(environment, machine.name),
                'SourceImageName': util.format('%s', machine.template.system.image)
            }
        },
        'deployment': {
            'DeploymentSlot': 'Production',
            'VirtualNetworkName': slapchop.azure.util.getVirtualNetworkName(environment)
        }
    };
};
