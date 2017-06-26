(function () {
    'use strict';

    angular
        .module('app')
        .factory('LanguageService', Service);

    Service.$inject = ['DataFactory'];

    function Service(DataFactory) {

        var collection = new DataFactory.Collection();

        // define public interface
        return {
            list: list,
            detail: detail,
            find: find,
            update: update,
        };

        function list() {

            return collection.list( 'languages' );

        }

        function detail( id ) {

            return collection.detail( 'languages/' + id );

        }

        function find( id ) {

            return collection.find( 'languages/' + id );

        }

        function update( id, data ) {

            return collection.update( 'languages/' + id, data );

        }

    }

})();