(function () {

    angular
        .module('app')
        .controller('OrganizeTagsController', Controller);

    Controller.$inject = ['$scope', 'TagService', 'TagCategoryService', 'TagRelationshipService', 'Notification'];

    function Controller($scope, TagService, TagCategoryService, TagRelationshipService, Notification) {

        var vm = this;

        vm.relationships = null;
        vm.categories = null;
        vm.tags = null;

        // Filters for the trees
        vm.show_category = 0; // 0 = all

        // Dedicated arrays for the trees
        vm.tagTree = [];
        vm.relationshipTree = [];

        // Even though nodes will be dropped into relationships,
        // beforeDrop for tags needs to be configured on the tag tree
        vm.tagTreeOptions = {
            beforeDrag: beforeDrag,
            beforeDrop: tagBeforeDrop,
        };

        vm.relationshipTreeOptions = {
            beforeDrag: beforeDrag,
            beforeDrop: relationshipBeforeDrop,
        };

        vm.deleteRelationship = deleteRelationship;

        vm.loaded = false;
        vm.saving = false;

        activate();

        return vm;


        function activate() {

            $scope.$watch( 'vm.tags', nestTags, true );
            $scope.$watch( 'vm.relationships', nestRelationships, true );

            $scope.$watch( 'vm.show_category', nestTags, true );

            // Load tags first to avoid duplicate server calls
            var request = TagService.list();

            request.promise.then( function() {

                vm.tags = request.cache.clean;
                vm.categories = TagCategoryService.list().cache.clean;
                vm.relationships = TagRelationshipService.list().cache.clean;

                vm.loaded = true;

            });

        }


        // Delete cascades serverside:
        // See roundware/rw/migrations/0016_tags_uigroups_api2.py#L74
        function deleteRelationship( node ) {

            vm.saving = true;

            TagRelationshipService.delete( node.id ).promise.then( function() {

                Notification.warning( { message: 'Relationship(s) deleted!' } );

            }).finally( function() {

                vm.saving = false;

            });

        }


        function nestTags( nv, ov ) {

            // Function is triggered by changes in show_categories
            // Therefore we need to grab the tags directly, not from arg
            // Cloning is necessary to avoid triggering $watch
            var tags = angular.merge([], vm.tags);

            // Do nothing if there's nothing to parse
            if( !tags ) {
                return;
            }

            // Special case for wildcard
            if( vm.show_category == 0) {
                vm.tagTree = tags;
                return;
            }

            // Filter items by currently active category
            vm.tagTree = tags.filter( function( tag ) {
                return tag.tag_category_id == vm.show_category;
            });

        }


        function nestRelationships( items, old ) {

            // Do nothing if there's nothing to parse
            if( !items ) {
                return;
            }

            // Cloning is necessary to avoid triggering $watch
            items = angular.merge([], items);

            // Let's make tag accessible directly: this makes
            // it easier to access the tag's localized strings
            items.forEach( function( item, index ) {

                var tag = TagService.find( item.tag_id ).clean;

                // Copy the tag to avoid modifying original
                item.tag = angular.merge({}, tag);

            });

            // Convert from flat to nested
            var nested = flat2nested( items );

            // nested becomes undefined if the array is empty
            // This resets tree if the last item is deleted
            vm.relationshipTree = nested ? nested.nodes : [];

        }


        function beforeDrag( event ) {

            // Prevent dragging if there's an ongoing server operation
            return !vm.saving;

        }


        function tagBeforeDrop( event ) {

            var relationship = {};

            // Determine which tree was the destination
            var dest = event.dest.nodesScope.$treeScope.$element.attr('id');

            // Ignore if the node was dropped in the tags tree
            if( dest == 'rw-tree-tags' ) {
                return false;
            }

            // Determine dest parent node + set parent_id accordingly.
            // If node is being dropped directly into the root of the tree,
            // parent_id will be set to undefined due to absence of data attr.
            relationship.parent_id = event.dest.nodesScope.$element.attr('data-parent-id');

            // Get tag info from event.source.cloneModel
            relationship.tag_id = event.source.cloneModel.id;

            console.log( relationship );

            // Save the tag relationship to server
            vm.saving = true;

            TagRelationshipService.create( relationship ).promise.then( function() {

                Notification.success( { message: 'Changes saved!' } );

            }).finally( function() {

                vm.saving = false;

            });

            // TODO: Prevent drop if that tag has already been nested under the destination?

            // TODO: Temporarily add the relationship to the destination?
            // event.source.cloneModel = relationship;

            // TODO: If so, set dest.index to the last position?
            // event.dest.index = event.dest.nodesScope.childNodes().length - 1;

            // We wait for the server to return + update the relationship collection
            // When this happens, $watch ensures that the tree gets updated as well
            return false;

        }


        function relationshipBeforeDrop( event ) {

            // This is the "enhanced" relationship, not the one in the cache
            // To avoid updating extraneous fields, don't send it directly
            var id = event.source.nodeScope.$modelValue.id;

            // Determine dest parent node + set parent_id accordingly, same as above
            // Unlike above, we need to convert undefined to null, so DRF accepts it
            var parent_id = event.dest.nodesScope.$element.attr('data-parent-id') || null;

            // Save the tag relationship to server
            vm.saving = true;

            TagRelationshipService.update( id, {

                parent_id: parent_id

            }).promise.then( function() {

                Notification.success( { message: 'Changes saved!' } );

            }).finally( function() {

                vm.saving = false;

            });

            // Again, wait for server update to cascade to tree
            return false;

        }


        // Adapted from https://stackoverflow.com/a/31715170/1943591
        function flat2nested( array ){

            var map = {};

            array.forEach( function( obj ) {

                if(!(obj.id in map)) {
                    map[obj.id] = obj;
                    map[obj.id].nodes = [];
                }

                // TODO: Figure out how this works? Fixes unsorted.
                if(typeof map[obj.id].id == 'undefined'){
                    map[obj.id] = angular.merge( map[obj.id], obj );
                }

                var parent = obj.parent_id || '-';

                if(!(parent in map)){
                    map[parent] = {};
                    map[parent].nodes = [];
                }

                map[parent].nodes.push( map[obj.id] );

            });

            return map['-'];

        }

    }

})();