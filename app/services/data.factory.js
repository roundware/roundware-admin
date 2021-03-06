(function () {
    'use strict';

    angular
        .module('app')
        .factory('DataFactory', Service);

    Service.$inject = ['$q', '$injector', 'ApiService', 'CacheFactory'];

    function Service($q, $injector, ApiService, CacheFactory) {

        return {
            Collection: Collection,
        }

        function Collection( options ) {

            var options = options || {};

            if(!options.route) {
                throw 'Missing route in model definition!';
            }

            var settings = {
                route: options.route,
                wrapper: options.wrapper || null,
                refresh: options.refresh || false,
                mapped: options.mapped || null,
                embedded: options.embedded || null,
                ignored: options.ignored || null,
                blanked: options.blanked || null,
            };

            var defaultParams = options.params || {};

            var cache = new CacheFactory.Cache( );

            // define public interface
            return {

                // actions
                list: list,
                paginate: paginate,
                cache: getCache,
                find: find,
                detail: detail,
                inject: inject,
                update: update,
                create: create,
                delete: remove,

                // settings
                setDefaultParam: setDefaultParam,

            };


            function list( config ) {

                var url = getUrl();
                var config = getConfig( config );

                var promise = ApiService.get( url, config )
                    .then( transformResponse )
                    .then( cache.update );

                var data = cache.list();

                return {
                    promise: promise,
                    cache: data,
                }

            }


            // Currently, pagination only works with Assets
            // This works like list, but separates out the meta
            // Instead of returning the cache directly, it returns cache + meta
            // It also nukes the cache to create a clean slate for every page
            function paginate( config ) {

                var url = getUrl();
                var config = getConfig( config );

                // Clear the cache to support sorting
                cache.clear();

                var meta = {};

                var promise = ApiService.get( url, config )
                    .then( function( response ) {

                        // We only care about the count, but might as well grab it all
                        meta.count = response.data.count;
                        meta.next = response.data.next;
                        meta.previous = response.data.previous;

                        return response.data.results;

                    })
                    .then( transformResponse )
                    .then( cache.update )
                    .then( function( cache ) {

                        return {
                            cache: cache,
                            meta: meta,
                        }

                    });

                var data = cache.list();

                return {
                    promise: promise,
                    cache: data,
                }

            }


            // cache() is like a soft list(), meant for modals
            // only use it when you're 100% certain the list hasn't changed
            // its return structure is meant to mirror that of list()
            // this method has to be named `getCache` b/c cache is a variable
            // call it via ModelService.cache()
            function getCache( config ) {

                var url = getUrl();
                var config = getConfig( config );
                var data = cache.list();

                var deferred = $q.defer();

                if( data.both.length < 1 ) {

                    list.config.promise.then( function( cache ) {

                        deferred.resolve( cache );

                    });

                } else {

                    deferred.resolve( data );

                }

                return {
                    promise: deferred.promise,
                    cache: data,
                }

            }


            // find() is like a soft detail(), meant for static views
            // it will get() a datum only if it's not cached yet
            function find( id, config ) {

                var url = getUrl( id );
                var config = getConfig( config );
                var datum = cache.detail( id );

                var deferred = $q.defer();

                // Enrich the datum with an extra property: track whether
                // it is just a stub, or if it contains server data.
                // See also: CacheFactory.Cache.updateDatum()
                if( !datum.initialized ) {

                    ApiService.get( url, config )
                        .then( transformResponse )
                        .then( cache.update )
                        .then( function( cache ) {

                            deferred.resolve( cache );

                        });

                    // Necessary so as to avoid inifinite digest cycles.
                    datum.initialized = true;

                } else {

                    deferred.resolve( datum );

                }

                return {
                    promise: deferred.promise,
                    cache: datum,
                }

            }


            function detail( id, config ) {

                var url = getUrl( id );
                var config = getConfig( config );

                var promise = ApiService.get( url, config )
                    .then( transformResponse )
                    .then( cache.update );

                var datum = cache.detail( id );

                return {
                    promise: promise,
                    cache: datum,
                }

            }


            // inject() is an in-between of detail() and update()
            // it will update the cache without making a server call
            function inject( datum ) {

                return cache.update( datum );

            }


            function update( id, newDatum, config ) {

                var url = getUrl( id );
                var config = getConfig( config );

                var oldDatum = cache.detail( id );

                if(!newDatum || newDatum === oldDatum ) {
                    newDatum = oldDatum.dirty;
                }

                var promise = processRequest( newDatum, function( processedDatum ) {

                    return ApiService.patch( url, processedDatum, config )
                        .then( transformResponse )
                        .then( cache.update )

                });

                return {
                    promise: promise,
                    cache: oldDatum,
                }

            }


            // We cannot know if the create() succeeds ahead of time.
            // Therefore, we cannot return a datum, only a promise.
            function create( datum, config ) {

                var url = getUrl();
                var config = getConfig( config );

                var promise = processRequest( datum, function( processedDatum ) {

                    return ApiService.post( url, processedDatum, config )
                        .then( transformResponse )
                        .then( cache.update )

                });

                return {
                    promise: promise,
                    cache: datum,
                };

            }


            // delete is a reserved word
            function remove( id ) {

                var url = getUrl( id );

                var promise = ApiService.delete( url ).then( null, function( response ) {

                    // Recover from 404s caused by serverside cascade
                    if( response.status == 404 ) {
                        return true;
                    }

                    // ...but reject all other errors
                    return $q.reject( response );

                })

                // Delete all `embedded` items that call for manual deletion
                if( settings.embedded ) {

                    var includes = settings.embedded.filter( function( include ) {
                        return include.delete;
                    });

                    var oldDatum = cache.detail( id );

                    var promises = includes.map( function( include ) {
                        return oldDatum.clean[ include.field ].map( function( id ) {
                            return $injector.get( include.model ).delete( id ).promise;
                        });
                    });

                    promise = promise.then( function() {
                        return $q.all( promises );
                    });

                }

                // Update the cache
                promise = promise.finally( function() {
                    return cache.delete( id );
                });

                return {
                    promise: promise,
                    cache: null,
                }

            }


            // Use this to set persistent params for all GET requests
            // Expects key and value; will be passed to Angular's $http.config.params
            // To unset a param, pass `null` or `undefined` as value
            function setDefaultParam( param, value ) {

                defaultParams[param] = value;

                return defaultParams;

            }


            function getUrl( id ) {

                var url = [ settings.route, id ];

                return url.join('/');

            }


            function getConfig( config ) {

                // config is an optional argument
                config = config || {};

                // apply any defined params
                angular.merge( config, {
                    params: defaultParams
                });

                return config;

            }


            function unwrapData( input, wrapper ) {

                // For convenience, omit wrapper if settings.wrapper is set
                if( !wrapper && settings && settings.wrapper ) {
                    wrapper = settings.wrapper;
                }

                // Determine if this is response or response.data
                // This might fail if response.data (i.e. resource) has these properties too.
                // Checking for two should be enough, for now.
                if( input.hasOwnProperty( 'data' ) && input.hasOwnProperty( 'status' ) ) {
                    input = input.data;
                }

                // Determine if we need to unwrap the data
                if( wrapper && input.hasOwnProperty( wrapper ) ) {
                    input = input[ wrapper ];
                }

                // Note that input is being transformed in place
                return input;

            }


            // Transform incoming data from server
            function transformResponse( input ) {

                var data = unwrapData( input );

                // Determine if we are processing a list
                if( data.constructor === Array ) {
                    return transformResponseData( data );
                }

                // Assume that otherwise, we are processing one datum
                return transformResponseDatum( data );

            }


            // There's no reason why this would fail, currently,
            // so we just return the data, not a promise
            function transformResponseData( data ) {

                data.forEach( transformResponseDatum );

                return data;

            }

            // These functions modify the datum in place + return it
            function transformResponseDatum( datum ) {

                if( settings.ignored ) {
                    transformResponseIgnored( datum, settings.ignored );
                }

                if( settings.mapped ) {
                    transformResponseMapped( datum, settings.mapped );
                }

                if( settings.embedded ) {
                    transformResponseIncludes( datum, settings.embedded );
                }

                return datum;

            }

            // Remove a field from the response, before anything else happens.
            // This is useful to prevent conflicts when a reponse has a field
            // with the same name as one of our `stored` fields defined in `mapped`
            function transformResponseIgnored( datum, ignoredFields ) {

                ignoredFields.forEach( function( field ) {

                    delete datum[ field ];

                });

                return datum;

            }

            // Map incoming fields into outgoing ones
            // Outgoing field names thus become the cannonical ones
            // This modifies the datum in place + returns it
            function transformResponseMapped( datum, mappedFields ) {

                mappedFields.forEach( function( field ) {

                    if( field.incoming == field.stored ) {
                        return;
                    }

                    if( typeof datum[ field.incoming ] !== 'undefined' ) {
                        datum[ field.stored ] = datum[ field.incoming ];
                        delete datum[ field.incoming ];
                    }

                });

                return datum;

            }

            // This modifies the datum in place + returns it
            function transformResponseIncludes( datum, includes ) {

                includes.forEach( function( include ) {

                    // Skip this include if the datum doesn't have this field
                    if( !datum[ include.field ] ) {
                        return;
                    }

                    // Add each embedded object to its model's cache
                    datum[ include.field ].forEach( function( subdatum ) {
                        $injector.get( include.model ).inject( subdatum );
                    });

                    // Replace the array of objects w/ array of ids
                    datum[ include.field ] = datum[ include.field ].map( function( subdatum ) {
                        return subdatum.id;
                    });

                });

                return datum;

            }


            // Request is an outgoing create or update
            // It MUST return a promise!
            function processRequest( datum, callback ) {

                var includes;

                // Start the promise chain
                var promise = $q.when( true );

                // Update all embedded resources before continuing...
                if( settings.embedded ) {

                    includes = processIncludes( datum, settings.embedded );

                    promise = $q.all( [ promise, includes.promise ] );

                }

                // Check if necessary fields have been blanked out
                if( settings.blanked ) {

                    promise = promise.then( function() {

                        var deferred = $q.defer();
                        var is_blanked = false;

                        settings.blanked.forEach( function( field ) {

                            // Assumes the field is a string
                            if( !datum[field] || !datum[field].trim() ) {
                                is_blanked = true;
                            }

                        });

                        if( is_blanked ) {
                            deferred.reject('blanked');
                        } else {
                            deferred.resolve( true );
                        }

                        return deferred.promise;

                    });

                }

                // Transform mapped fields from cached into outgoing
                promise = promise.then( function() {

                    if( settings.mapped ) {
                        processRequestMapped( datum, settings.mapped );
                    }

                });

                // Wait on existing promises to execute, then process this datum
                promise = promise.then( function() {

                    // callback ought to return a promise
                    // it's expected to be either patch() or post() on ApiService
                    return callback( datum );

                });

                // Restore mapped fields from outgoing to stored, regardless of success
                promise = promise.finally( function( response ) {

                    if( settings.mapped ) {
                        cleanupRequestMapped( datum, settings.mapped );
                    }

                    // We pass along the callback response so we can get the new id below
                    return response;

                });

                // Retrive the resource again if settings.refresh is set
                // Roundware has a lot of problems with _admin fields
                // DO NOT set admin=1 for POST or PATCH requests!
                promise = promise.then( function( response ) {

                    if( settings.refresh ) {

                        return detail( response.id ).promise;

                    }

                    return response;

                });

                // Restore any "blanked" embedded objects for editing
                promise = promise.then( function( response ) {

                    if( includes ) {

                        includes.blanked.forEach( function( include ) {
                            datum[ include.field ].push( include.original );
                        });

                    }

                    return response;

                });

                // If anything up to here fails, delete all created resources
                promise = promise.then( null, function( response ) {

                    var deferred = $q.defer();

                    if( includes ) {

                        // This returns a promise, i.e. delete all includes
                        cleanupIncludes( datum, includes.created ).then( function() {
                            deferred.reject( response );
                        });

                    } else {

                        // Just reject the promise outright...
                        deferred.reject( response );

                    }

                    return deferred.promise;

                });

                return promise;

            }


            function processRequestMapped( datum, mappedFields ) {

                mappedFields.forEach( function( field ) {

                    if( field.stored == field.outgoing ) {
                        return;
                    }

                    if( typeof datum[ field.stored ] !== 'undefined' ) {
                        datum[ field.outgoing ] = datum[ field.stored ];
                        delete datum[ field.stored ];
                    }

                });

                return datum;

            }


            function cleanupRequestMapped( datum, mappedFields ) {

                mappedFields.forEach( function( field ) {

                    if( field.outgoing == field.stored ) {
                        return;
                    }

                    if( typeof datum[ field.outgoing ] !== 'undefined' ) {
                        datum[ field.stored ] = datum[ field.outgoing ];
                        delete datum[ field.outgoing ];
                    }

                });

                return datum;

            }


            // This function does not modify the outgoing datum directly,
            // But it does call activateIncludes, which will swap objects for ids
            function processIncludes( datum, includes ) {

                var promises = [];
                var created = [];
                var blanked = [];
                var removed = []

                includes.forEach( function( include ) {

                    // Skip include if ignore_on_save is set
                    if( include.ignore_on_save ) {
                        return;
                    }

                    // Skip include if the datum doesn't have this field
                    if( !datum[ include.field ] ) {
                        return;
                    }

                    // Update each embedded object
                    datum[ include.field ].forEach( function( resource, index ) {

                        var promise;

                        if( typeof resource === 'object' ) {

                            // This is an object that needs to be created serverside
                            promise = $injector.get( include.model ).create( resource ).promise;

                            // If all subresources are created and updated successfully,
                            // swap objects for their ids, before saving the main model.

                            // If any subresource or the main model fails to be saved,
                            // delete all created subresources and reset the main model.

                            promise = promise.then( function( subdatum ) {

                                created.push({
                                    id: subdatum.id,
                                    model: include.model,
                                    field: include.field,
                                    original: resource,
                                    index: index,
                                });

                                return true;

                            }, function( error ) {

                                // Catch cases where a needed field was left empty
                                // Only relevant for LocalizedStrings w/ empty text
                                if( error == 'blanked' ) {

                                    blanked.push({
                                        field: include.field,
                                        original: resource,
                                    });

                                    return true;

                                }

                                return $q.reject();

                            });

                        } else {

                            // This is an id reference to an existing subresource that should be updated
                            promise = $injector.get( include.model ).update( resource ).promise;

                            // Catch cases where a needed field was blanked out
                            // Again, only relevant for LocalizeStrings w/ emptied text
                            promise = promise.then( null, function( error ) {

                                if( error == 'blanked' ) {

                                    removed.push({
                                        field: include.field,
                                        original: resource,
                                    });

                                    return $injector.get( include.model ).delete( resource ).promise;

                                }

                                return $q.reject();

                            });

                        }

                        // Add it to the promise queue for resolving
                        promises.push( promise );

                    });

                });


                // Activate the includes here, once they are all saved successfully
                var promise = $q.all( promises ).then( function() {

                    return activateIncludes( datum, created, blanked, removed );

                });

                // https://stackoverflow.com/questions/21759361/wait-for-all-promises-to-resolve
                return {
                    promise: promise,
                    created: created,
                    blanked: blanked,
                    removed: removed,
                };

            }

            // This function modifies the outgoing datum in place
            // It swaps objects for ids in includes fields
            function activateIncludes( datum, created, blanked, removed ) {

                created.forEach( function( item ) {

                    datum[ item.field ][ item.index ] = item.id;

                });

                // Both blank and removed need the same treatment here
                blanked.concat(removed).forEach( function( item ) {

                    var index = datum[ item.field ].indexOf( item.original );

                    datum[ item.field ].splice( index, 1 );

                });

                return datum;

            }

            // This function modifies the outgoing datum in place
            // It deletes created includes from server, and swaps ids w/ the original objects
            function cleanupIncludes( datum, created ) {

                var promises = [];

                created.forEach( function( item ) {

                    var promise;

                    // Delete the resource from the server
                    promise = $injector.get( item.model ).delete( item.id ).promise;

                    // Afterwards, replace the id w/ the original object
                    promise = promise.then( function() {

                        datum[ item.field ][ item.index ] = item.original;

                    });

                    promises.push( promise );

                });

                var promise = $q.all( promises );

                return promise;

            }

        }

    }


    // TODO: Always mark embedded fields as dirty, so that those models get checked!
    // TODO: Abstract this into a module, or use existing library?
    function getChanges( clean, dirty ) {

        return compareObjects( clean, dirty, {} );

        function compareObjects( a, b, node ) {

            // We will use clean as the reference
            // If dirty contains a property that isn't in clean, ignore it
            for( var prop in a ) {

                // Ignore Angular's internal keys
                if( prop.substring(0,2) == '$$' ) {
                    continue;
                }

                // We assume that dirty contains this property too
                // if(typeof b[prop] == 'undefined'){}

                // Naive comparison
                if( JSON.stringify( a[prop] ) == JSON.stringify( b[prop] ) ) {
                    continue;
                }

                if( isValue( b[prop] ) ){

                    // TODO: parse numeric strings into numbers?
                    node[prop] = b[prop];

                    continue;

                }

                if( isArray( b[prop] ) ){
                    node[prop] = compareArrays( a[prop], b[prop] );
                    continue;
                }

                if( isObject( b[prop] ) ) {
                    compareObjects( a[prop], b[prop], node[prop] );
                    continue;
                }

            }

            return node;

        }

        // This works only for arrays of values, not objects or arrays
        // Does not care about order of elements
        function compareArrays( a, b ) {

            // TODO: Check what happens with numeric strings

            // ensure that all of the values in a are in b
            for( var i in a ) {
                if( b.indexOf(i) < 0 ) {
                    return b;
                }
            }

            // ensure that all of the values in b are in a
            for( var i in b ) {
                if( a.indexOf(i) < 0 ) {
                    return b;
                }
            }

            // otherwise, return undefined
            return undefined;

        }

        function isValue(obj) {
            return typeof obj !== 'object' || obj == null;
        }

        function isArray(obj) {
            return {}.toString.apply(obj) === '[object Array]';
        }

        function isObject(obj) {
            return {}.toString.apply(obj) === '[object Object]';
        }

        // Unused, but might be needed for string -> number
        function isInt(n){
            return Number(n) === n && n % 1 === 0;
        }

        function isFloat(n){
            return Number(n) === n && n % 1 !== 0;
        }

    }

})();