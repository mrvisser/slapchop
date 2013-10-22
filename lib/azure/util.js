
var util = require('util');

var getAffinityGroupName = module.exports.getAffinityGroupName = function(environment) {
    return util.format('apereo-oae-ag-%s', environment.name);
};

var getVirtualNetworkName = module.exports.getVirtualNetworkName = function(environment) {
    return util.format('apereo-oae-vnet-%s', environment.name);
};

var getStorageAccountName = module.exports.getStorageAccountName = function(environment) {
    return util.format('apereooaesa%s3', environment.name);
};

var getCloudServiceName = module.exports.getCloudServiceName = function(environment, name) {
    return util.format('apereo-oae-%s-%s', environment.name, name);
};

var getDeploymentName = module.exports.getDeploymentName = function(environment, name) {
    return util.format('apereo-oae-deployment-%s-%s', environment.name, name);
};

var getRoleName = module.exports.getRoleName = function(environment, name) {
    return util.format('apereo-oae-role-%s-%s', environment.name, name);
};

var getBlobServiceConnectionString = module.exports.getBlobServiceConnectionString = function(environment, storageAccountKey) {
    return util.format('DefaultEndpointsProtocol=https;AccountName=%s;AccountKey=%s', getStorageAccountName(environment), storageAccountKey);
};

var getOsBlobInfo = module.exports.getOsBlobInfo = function(environment, name) {
    return {
        'baseUri': util.format('http://%s.blob.core.windows.net', getStorageAccountName(environment)),
        'container': 'vhds',
        'name': util.format('%s/os.vhd', name)
    };
};

var getOsDiskUri = module.exports.getOsDiskUri = function(environment, name) {
    var blobInfo = getOsBlobInfo(environment, name);
    return util.format('%s/%s/%s', blobInfo.baseUri, blobInfo.container, blobInfo.name);
};
