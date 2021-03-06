(function () {

    angular
        .module('app')
        .controller('EditAssetController',  Controller);

    Controller.$inject = ['$scope', '$q', '$stateParams', 'leafletData', 'ApiService', 'GeocodeService', 'AssetService', 'LanguageService', 'Notification'];

    function Controller($scope, $q, $stateParams, leafletData, ApiService, GeocodeService, AssetService, LanguageService, Notification) {

        var vm = this;

        vm.asset = null;
        vm.languages = null;

        vm.saved_envelope_id = null;

        // Serialize this into vm.asset on save()
        vm.marker = {
            focus: true,
            draggable: true,
            lat: 0,
            lng: 0,
            icon: {
                type: 'awesomeMarker',
                icon: 'glyphicon-volume-up',
                markerColor: 'blue'
            }
        };

        // Leaflet configs: http://angular-ui.github.io/ui-leaflet/
        vm.leaflet = {
            center: {
                lat: 0,
                lng: 0,
                zoom: 17,
            },
            defaults: {
                scrollWheelZoom: false,
            },
            markers: {
                asset: vm.marker,
            },
        };

        // Helper functions for rendering in view
        vm.getFileUrl = getFileUrl;

        // Helpers for setting coordinates + updating map
        vm.setLocation = setLocation;
        vm.resetLocation = resetLocation;
        vm.centerMapOnMarker = centerMapOnMarker;

        // Container for geocoding related stuff
        vm.geocode = {
            search: geocode,
            query: null,
            results: [],
        };

        vm.saving = false;

        vm.save = save;

        activate();

        return vm;

        function activate() {

            $q.all({
                'map': leafletData.getMap('map'),
                'asset': AssetService.find( $stateParams.asset_id ).promise,
                'languages': LanguageService.list().promise,
            }).then( function( results ) {

                vm.map = results.map;

                // Load info from the caches
                vm.asset = results.asset.dirty;
                vm.languages = results.languages.clean;

                // Save the original envelope id
                vm.saved_envelope_id = vm.asset.envelope_ids[0];

                // TODO: Filter languages by project languages?

                // Pan map to marker, when its coordinates change
                // Triggering this for <input/> change requires `ng-change` attr
                $scope.$watchGroup( ['vm.marker.lat', 'vm.marker.lng'], centerMapOnMarker );

                // Update the marker to match the Asset's coordinates
                resetLocation();

            });

        }

        function getFileUrl( path ) {

            // If path is relative: ApiService.getBaseUrl( path )
            // https://stackoverflow.com/a/17819167/1943591
            return path;

        }

        function setLocation( lat, lng ) {

            vm.leaflet.center.lat = vm.marker.lat = parseFloat( lat );
            vm.leaflet.center.lng = vm.marker.lng = parseFloat( lng );

        }

        function resetLocation( ) {

            return setLocation( vm.asset.latitude, vm.asset.longitude );

        }

        function centerMapOnMarker( ) {

            vm.map.panTo( new L.LatLng( vm.marker.lat, vm.marker.lng ) );

        }

        function geocode( ) {

            GeocodeService.get( vm.geocode.query ).then( function( results ) {
                return vm.geocode.results = results;
            });

        }

        function save() {

            vm.saving = true;

            // See AssetService for more details re: args & return
            AssetService.updateEx({

                'asset': vm.asset,
                'marker': vm.marker,

            }).promise.then( function( cache ) {

                // Save the new envelope id
                vm.saved_envelope_id = cache.clean.envelope_ids[0];

                Notification.success( { message: 'Changes saved!' } );

            }).finally( function() {

                vm.saving = false;

            });

        }

    }

})();