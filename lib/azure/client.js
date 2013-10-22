
var _ = require('underscore');
var slapchop = require('../../index');
var ServiceManagementService = require('azure').ServiceManagementService;
var util = require('util');

var init = module.exports.init = function(serviceManagementService) {
    // Proxy all azure functions, handling the 202 response as a special case to poll for completion before
    // invoking the final callback
    _.each(ServiceManagementService.prototype, function(method, name) {
        module.exports[name] = function(/* args..., [initialCallback], [statusCallback], callback */) {

            // Extract the arguments object into a legit array
            var innerArguments = [];
            for (var i = 0; i < arguments.length; i++) {
                innerArguments.push(arguments[i]);
            }

            var initialCallback = function() {};
            var statusCallback = function() {};
            var finalCallback = function() {};
            var lastArg = innerArguments.pop();

            if (_.isFunction(lastArg)) {
                // If the last argument is a function, then it is just a normal callback
                finalCallback = lastArg;
            } else if (_.isObject(lastArg)) {
                // If the last argument is an object, it contains a few different callbacks
                initialCallback = lastArg['initial'] || function() {};
                statusCallback = lastArg['status'] || function() {};
                finalCallback = lastArg['final'] || function() {};
            }

            innerArguments.push(function(err, response) {
                if (err) {
                    // Invoke both the initial callback and final callback with the error
                    initialCallback(err);
                    return finalCallback(err);
                }

                // If the initial callback was specified, indicate that the initial request has completed
                initialCallback(null, response);

                if (response.isSuccessful && response.statusCode === 202) {
                    // When the status code is 202, it is an asynchronous method
                    return _pollForCompletion(response.headers['x-ms-request-id'], statusCallback, function(err) {
                        if (err) {
                            return finalCallback(err);
                        }

                        return finalCallback(null, response);
                    });
                }

                return finalCallback(null, response);
            });

            // Finally invoke the method with the arguments
            method.apply(serviceManagementService, innerArguments);
        };
    });
};

var _pollForCompletion = function(requestId, statusCallback, finalCallback, _attempt) {
    _attempt = _attempt || 0;

    slapchop.azure.client.getOperationStatus(requestId, function(err, response) {
        if (err) {
            return finalCallback(err);
        } else if (response.body.Status === 'Failed') {
            return finalCallback(new Error(response.body.Error.Message));
        } else if (response.body.Status === 'Succeeded') {
            return finalCallback();
        }

        _attempt++;

        if (_attempt % 10 === 0) {
            statusCallback(_attempt);
        }

        return setTimeout(_pollForCompletion, 1, requestId, statusCallback, finalCallback, _attempt);
    });
};