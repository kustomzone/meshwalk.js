// @author yomotsu
// MIT License

// OcTree with Morton Order
// based on http://marupeke296.com/COL_3D_No15_Octree.html
//
//       +------+------+
//       |\   2  \   3  \
//       | +------+------+
//       + |\      \      \
//       |\| +------+------+
//       | + |      |      |
//       +0|\|   6  |   7  |
//        \| +------+------+
//         + |      |      |
//    y     \|   4  |   5  |
//    |      +------+------+
//    +--x
//     \
//      z
//
//
//       +------+------+
//       |\   6  \   7  \
//       | +------+------+
//       + |\      \      \
//       |\| +------+------+
//       | + |      |      |
//       +4|\|   2  |   3  |
//        \| +------+------+
//         + |      |      |
//  z y     \|   0  |   1  |
//   \|      +------+------+
//    +--x
//

;( function ( THREE, ns ) {

  'use strict';

  // min: <THREE.Vector3>
  // max: <THREE.Vector3>
  // maxDepth: <Number>
  ns.Octree = function ( min, max, maxDepth ) {

    this.min = min;
    this.max = max;
    this.maxDepth = maxDepth;
    this.nodes = [];

    var i, length, depth, mortonNumber,
        pow2, pow4,
        indexX, indexY, indexZ,
        nodeBoxSize = new THREE.Vector3(),
        nodeBoxMin = new THREE.Vector3(),
        nodeBoxMax = new THREE.Vector3();

    for ( depth = 0; depth < this.maxDepth; depth ++ ) {

      this.nodes.push( [] );
      pow2 = Math.pow( 2, depth );
      pow4 = Math.pow( 4, depth );
      nodeBoxSize.subVectors( this.max, this.min ).divideScalar( pow2 );

      for ( i = 0, length = Math.pow( 8, depth ); i < length; i ++ ) {

        indexX = i % pow2;
        indexY = ( i / pow4 )|0;
        indexZ = ( ( i / pow2 )|0 ) % pow2;

        nodeBoxMin.set(
          this.min.x + indexX * nodeBoxSize.x,
          this.min.y + indexY * nodeBoxSize.y,
          this.min.z + indexZ * nodeBoxSize.z
        );
        nodeBoxMax.copy( nodeBoxMin ).add( nodeBoxSize );

        mortonNumber = ns.Octree.getMortonNumber( indexX, indexY, indexZ );
        this.nodes[ depth ][ mortonNumber ] = new ns.OctreeNode( this, depth, mortonNumber, nodeBoxMin, nodeBoxMax );

      }

    }

  }

  ns.Octree.prototype = {

    constructor: ns.Octree,

    importThreeMesh: function ( threeMesh ) {


      var i, ii, l, ll,
          vec3 = new THREE.Vector3(),
          geometry,
          geometryId,
          face,
          normal,
          index,
          count,
          start,
          a, b, c,
        	vA  = new THREE.Vector3(),
        	vB  = new THREE.Vector3(),
        	vC  = new THREE.Vector3(),
        	vnA = new THREE.Vector3(),
        	vnB = new THREE.Vector3(),
        	vnC = new THREE.Vector3(),
          ab  = new THREE.Vector3(),
          cb  = new THREE.Vector3(),
          faceNormal;

      threeMesh.updateMatrix();

      geometryId = threeMesh.geometry.uuid;
      geometry   = threeMesh.geometry.clone();
      geometry.applyMatrix( threeMesh.matrix );
      geometry.computeVertexNormals();

      if ( geometry instanceof THREE.BufferGeometry ) {

        if ( geometry.index !== undefined ) {

          var indices   = geometry.index.array;
          var positions = geometry.attributes.position.array;
          var normals   = geometry.attributes.normal.array;
          var offsets   = geometry.groups;

          if ( offsets.length === 0 ) {

            offsets = [ { start: 0, count: indices.length, index: 0 } ];

          }

          for ( i = 0, l = offsets.length; i < l; ++ i ) {

            start  = offsets[ i ].start;
            count  = offsets[ i ].count;
            index  = offsets[ i ].materialIndex;

            for ( ii = start, ll = start + count; ii < ll; ii += 3 ) {

              a = index + indices[ ii ];
              b = index + indices[ ii + 1 ];
              c = index + indices[ ii + 2 ];

              vA = vec3.fromArray( positions, a * 3 ).clone();
              vB = vec3.fromArray( positions, b * 3 ).clone();
              vC = vec3.fromArray( positions, c * 3 ).clone();

              // https://github.com/mrdoob/three.js/issues/4691
              // make face normal
              cb.subVectors( vC, vB );
              ab.subVectors( vA, vB );
              faceNormal = cb.cross( ab ).normalize().clone();

              face = new ns.Face(
                vA,
                vB,
                vC,
                faceNormal,
                geometryId
              );

              this.addFace( face );

            }

          }

        }

        return;

      }

      geometry.computeFaceNormals();

      for ( i = 0, l = geometry.faces.length; i < l; i ++ ) {

        face = new ns.Face(
          geometry.vertices[ geometry.faces[ i ].a ],
          geometry.vertices[ geometry.faces[ i ].b ],
          geometry.vertices[ geometry.faces[ i ].c ],
          geometry.faces[ i ].normal,
          geometryId
        );
        this.addFace( face );

      }

    },

    addFace: function ( face ) {

      var i, ii, l, ll, node, targetNodes = [], tmp = [], isIntersected;

      targetNodes = this.nodes[ 0 ].slice( 0 );

      for ( i = 0, l = this.maxDepth; i < l; i ++ ) {

        for ( ii = 0, ll = targetNodes.length; ii < ll; ii ++ ) {

          node = targetNodes[ ii ];
          isIntersected = ns.collision.isIntersectionTriangleAABB( face.a, face.b, face.c, node );

          if ( isIntersected ) {

            node.trianglePool.push( face );

            if ( i + 1 !== this.maxDepth ) {

              tmp = tmp.concat( node.getChildNodes() );

            }

          }

        }

        if ( tmp.length === 0 ) {

          break;

        }

        targetNodes = tmp.slice( 0 );
        tmp.length = 0;

      }

    },

    removeThreeMesh: function ( meshID ) {

      var that = this;

      this.nodes.forEach( function ( nodeDepth ) {

        nodeDepth.forEach( function ( node ) {

          var newTrianglePool = [];

          node.trianglePool.forEach( function ( face ) {

            if ( face.meshID !== meshID ) {

              newTrianglePool.push( face );

            }

          } );

          node.trianglePool = newTrianglePool;

        } );

      } );

    },

    getIntersectedNodes: function ( sphere, depth ) {

      var i, ii, l, ll, node, targetNodes = [], tmp = [],
          isIntersected, intersectedNodes = [], isAtMaxDepth;

      isIntersected = ns.collision.isIntersectionSphereAABB( sphere, this );

      if ( !isIntersected ) {

        return [];

      }

      targetNodes = this.nodes[ 0 ].slice( 0 );

      for ( i = 0, l = depth; i < l; i ++ ) {

        for ( ii = 0, ll = targetNodes.length; ii < ll; ii ++ ) {

          node = targetNodes[ ii ];
          isIntersected = ns.collision.isIntersectionSphereAABB( sphere, node );

          if ( isIntersected ) {

            isAtMaxDepth = ( i + 1 === depth );

            if ( isAtMaxDepth ) {

              if ( node.trianglePool.length !== 0 ) {

                intersectedNodes.push( node );

              }

            } else {

              tmp = tmp.concat( node.getChildNodes() );

            }

          }

        }

        targetNodes = tmp.slice( 0 );
        tmp.length = 0;

      }

      return intersectedNodes;

    }

  }

  ns.Octree.separate3Bit = function ( n ) {

    n = ( n | n << 8 ) & 0x0000f00f;
    n = ( n | n << 4 ) & 0x000c30c3;
    n = ( n | n << 2 ) & 0x00249249;
    return n;

  }

  ns.Octree.getMortonNumber = function ( x, y, z ) {

    return ns.Octree.separate3Bit( x ) |
           ns.Octree.separate3Bit( y ) << 1 |
           ns.Octree.separate3Bit( z ) << 2;

  }

  ns.Octree.uniqTriangkesfromNodes = function ( nodes ) {

    var i, ii, iii, l, ll, lll, uniq = [], isContained = false;

    if ( nodes.length === 0 ) {

      return [];

    } else if ( nodes.length === 1 ) {

      return nodes[ 0 ].trianglePool.slice( 0 );

    }

    for ( i = 0, l = nodes.length; i < l; i ++ ) {

      for ( ii = 0, ll = nodes[ i ].trianglePool.length; ii < ll; ii ++ ) {

        for ( iii = 0, lll = uniq.length; iii < lll; iii ++ ) {

          if ( nodes[ i ].trianglePool[ ii ] === uniq[ iii ] ) {

            isContained = true;

          }

        }

        if ( !isContained ) {

          uniq.push( nodes[ i ].trianglePool[ ii ] );

        }

        isContained = false;

      }

    }

    return uniq;

  }

  //

  ns.OctreeNode = function ( tree, depth, mortonNumber, min, max ) {

    this.tree = tree;
    this.depth = depth;
    this.mortonNumber = mortonNumber;
    this.min = new THREE.Vector3( min.x, min.y, min.z );
    this.max = new THREE.Vector3( max.x, max.y, max.z );
    this.trianglePool = [];

  }

  ns.OctreeNode.prototype = {

    constructor: ns.OctreeNode,

    getParentNode: function () {

      if ( this.depth === 0 ) {

        return null;

      }

      this.tree.nodes[ this.depth ][ this.mortonNumber >> 3 ];

    },

    getChildNodes: function () {

      if ( this.tree.maxDepth === this.depth ) {

        return null;

      }

      var firstChild = this.mortonNumber << 3;

      return [
        this.tree.nodes[ this.depth + 1 ][ firstChild ],
        this.tree.nodes[ this.depth + 1 ][ firstChild + 1 ],
        this.tree.nodes[ this.depth + 1 ][ firstChild + 2 ],
        this.tree.nodes[ this.depth + 1 ][ firstChild + 3 ],
        this.tree.nodes[ this.depth + 1 ][ firstChild + 4 ],
        this.tree.nodes[ this.depth + 1 ][ firstChild + 5 ],
        this.tree.nodes[ this.depth + 1 ][ firstChild + 6 ],
        this.tree.nodes[ this.depth + 1 ][ firstChild + 7 ]
      ];

    }

  }

  //

  // a: <THREE.Vector3>
  // b: <THREE.Vector3>
  // c: <THREE.Vector3>
  // normal: <THREE.Vector3>
  // meshID: <String>
  ns.Face = function ( a, b, c, normal, meshID ) {

    this.a = a.clone();
    this.b = b.clone();
    this.c = c.clone();
    this.normal = normal.clone();
    this.meshID = meshID;

  }

  ns.Face.prototype = {

    constructor: ns.Face

  }

  // origin   : <THREE.Vector3>
  // direction: <THREE.Vector3>
  // distance : <Float>
  ns.Ray = function ( origin, direction, distance ) {
    this.origin = origin;
    this.direction = direction;
    this.distance = distance;
  }

} )( THREE, MW );
