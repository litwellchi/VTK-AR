import _slicedToArray from '@babel/runtime/helpers/slicedToArray';
import _toConsumableArray from '@babel/runtime/helpers/toConsumableArray';
import _asyncToGenerator from '@babel/runtime/helpers/asyncToGenerator';
import _regeneratorRuntime from '@babel/runtime/regenerator';
import { VtkDataTypes } from '@kitware/vtk.js/Common/Core/DataArray/Constants.js';
import macro from '@kitware/vtk.js/macros.js';
import { registerViewConstructor } from '@kitware/vtk.js/Rendering/Core/RenderWindow.js';
import vtkForwardPass from '@kitware/vtk.js/Rendering/OpenGL/ForwardPass.js';
import vtkHardwareSelector from '@kitware/vtk.js/Rendering/OpenGL/HardwareSelector.js';
import vtkShaderCache from '@kitware/vtk.js/Rendering/OpenGL/ShaderCache.js';
import vtkTextureUnitManager from '@kitware/vtk.js/Rendering/OpenGL/TextureUnitManager.js';
import vtkViewNodeFactory from '@kitware/vtk.js/Rendering/OpenGL/ViewNodeFactory.js';
import vtkRenderPass from '@kitware/vtk.js/Rendering/SceneGraph/RenderPass.js';
import vtkRenderWindowViewNode from '@kitware/vtk.js/Rendering/SceneGraph/RenderWindowViewNode.js';
import { createContextProxyHandler } from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow/ContextProxy.js';

import controlPanel from '../../controller.html';
import * as mat4 from '../iosWebXR/examples/libs/gl-matrix/mat4.js';
import * as vec3 from '../iosWebXR/examples/libs/gl-matrix/vec3.js';
import { E } from '@kitware/vtk.js/Common/Core/Math/index';
import XREngine from '../iosWebXR/examples/XREngine.js';

var vtkDebugMacro = macro.vtkDebugMacro,
    vtkErrorMacro = macro.vtkErrorMacro;
var SCREENSHOT_PLACEHOLDER = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%'
};
var DEFAULT_RESET_FACTORS = {
  vr: {
    rescaleFactor: 1.0,
    translateZ: -0.7 // 0.7 m forward from the camera

  },
  ar: {
    rescaleFactor: 0.25,
    // scale down AR for viewing comfort by default
    translateZ: -0.5 // 0.5 m forward from the camera

  }
};


const workingMatrix = mat4.create();
const workingVec3 = vec3.create();

let engine = null;
let imageDetectionCreationRequested = false;
let imageActivateDetection = false;
let imageActivated = false;
let imageAnchor = null;

function checkRenderTargetSupport(gl, format, type) {
  // create temporary frame buffer and texture
  var framebuffer = gl.createFramebuffer();
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, format, 2, 2, 0, format, type, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0); // check frame buffer status

  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER); // clean up

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return status === gl.FRAMEBUFFER_COMPLETE;
} // ----------------------------------------------------------------------------
// Monitor the usage of GL context across vtkOpenGLRenderWindow instances
// ----------------------------------------------------------------------------


var GL_CONTEXT_COUNT = 0;
var GL_CONTEXT_LISTENERS = [];

function createGLContext() {
  GL_CONTEXT_COUNT++;
  GL_CONTEXT_LISTENERS.forEach(function (cb) {
    return cb(GL_CONTEXT_COUNT);
  });
}

function deleteGLContext() {
  GL_CONTEXT_COUNT--;
  GL_CONTEXT_LISTENERS.forEach(function (cb) {
    return cb(GL_CONTEXT_COUNT);
  });
}

function pushMonitorGLContextCount(cb) {
  GL_CONTEXT_LISTENERS.push(cb);
}
function popMonitorGLContextCount(cb) {
  return GL_CONTEXT_LISTENERS.pop();
} // ----------------------------------------------------------------------------
// vtkOpenGLRenderWindow methods
// ----------------------------------------------------------------------------

function vtkOpenGLRenderWindow(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkOpenGLRenderWindow');
  var cachingContextHandler = createContextProxyHandler();

  publicAPI.getViewNodeFactory = function () {
    return model.myFactory;
  }; // prevent default context lost handler


  model.canvas.addEventListener('webglcontextlost', function (event) {
    event.preventDefault();
  }, false);
  model.canvas.addEventListener('webglcontextrestored', publicAPI.restoreContext, false); // Cache the value here as calling it on each frame is expensive

  var isImmersiveVrSupported = navigator.xr !== undefined && navigator.xr.isSessionSupported('immersive-vr'); // Auto update style

  var previousSize = [0, 0];

  function updateWindow() {
    // Canvas size
    if (model.renderable) {
      if (model.size[0] !== previousSize[0] || model.size[1] !== previousSize[1]) {
        previousSize[0] = model.size[0];
        previousSize[1] = model.size[1];
        model.canvas.setAttribute('width', model.size[0]);
        model.canvas.setAttribute('height', model.size[1]);
      }
    } // ImageStream size


    if (model.viewStream) {
      // If same size that's a NoOp
      model.viewStream.setSize(model.size[0], model.size[1]);
    } // Offscreen ?


    model.canvas.style.display = model.useOffScreen ? 'none' : 'block'; // Cursor type

    if (model.el) {
      model.el.style.cursor = model.cursorVisibility ? model.cursor : 'none';
    } // Invalidate cached DOM container size


    model.containerSize = null;
  }

  publicAPI.onModified(updateWindow); // Builds myself.

  publicAPI.buildPass = function (prepass) {
    if (prepass) {
      if (!model.renderable) {
        return;
      }

      publicAPI.prepareNodes();
      publicAPI.addMissingNodes(model.renderable.getRenderersByReference());
      publicAPI.removeUnusedNodes();
      publicAPI.initialize();
      model.children.forEach(function (child) {
        child.setOpenGLRenderWindow(publicAPI);
      });
    }
  };

  publicAPI.initialize = function () {
    if (!model.initialized) {
      model.context = publicAPI.get3DContext();
      model.textureUnitManager = vtkTextureUnitManager.newInstance();
      model.textureUnitManager.setContext(model.context);
      model.shaderCache.setContext(model.context); // initialize blending for transparency

      var gl = model.context;
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      model.initialized = true;
    }
  };

  publicAPI.makeCurrent = function () {
    model.context.makeCurrent();
  };

  publicAPI.setContainer = function (el) {
    if (model.el && model.el !== el) {
      if (model.canvas.parentNode !== model.el) {
        vtkErrorMacro('Error: canvas parent node does not match container');
      } // Remove canvas from previous container


      model.el.removeChild(model.canvas); // If the renderer has previously added
      // a background image, remove it from the DOM.

      if (model.el.contains(model.bgImage)) {
        model.el.removeChild(model.bgImage);
      }
    }

    if (model.el !== el) {
      model.el = el;

      if (model.el) {
        model.el.appendChild(model.canvas); // If the renderer is set to use a background
        // image, attach it to the DOM.

        if (model.useBackgroundImage) {
          model.el.appendChild(model.bgImage);
        }
      } // Trigger modified()


      publicAPI.modified();
    }
  };

  publicAPI.getContainer = function () {
    return model.el;
  };

  publicAPI.getContainerSize = function () {
    if (!model.containerSize && model.el) {
      var _model$el$getBounding = model.el.getBoundingClientRect(),
          width = _model$el$getBounding.width,
          height = _model$el$getBounding.height;

      model.containerSize = [width, height];
    }

    return model.containerSize || model.size;
  };

  publicAPI.getFramebufferSize = function () {
    if (model.activeFramebuffer) {
      return model.activeFramebuffer.getSize();
    }

    return model.size;
  };

  publicAPI.getPixelData = function (x1, y1, x2, y2) {
    var pixels = new Uint8Array((x2 - x1 + 1) * (y2 - y1 + 1) * 4);
    model.context.readPixels(x1, y1, x2 - x1 + 1, y2 - y1 + 1, model.context.RGBA, model.context.UNSIGNED_BYTE, pixels);
    return pixels;
  };

  publicAPI.get3DContext = function () {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {
      preserveDrawingBuffer: false,
      depth: true,
      alpha: true,
      powerPreference: 'high-performance'
    };
    var result = null; // Do we have webxr support

    if (isImmersiveVrSupported) {
      publicAPI.invokeHaveVRDisplay();
    }

    var webgl2Supported = typeof WebGL2RenderingContext !== 'undefined';
    model.webgl2 = false;

    if (model.defaultToWebgl2 && webgl2Supported) {
      result = model.canvas.getContext('webgl2', options);

      if (result) {
        model.webgl2 = true;
        vtkDebugMacro('using webgl2');
      }
    }

    if (!result) {
      vtkDebugMacro('using webgl1');
      result = model.canvas.getContext('webgl', options) || model.canvas.getContext('experimental-webgl', options);
    }

    return new Proxy(result, cachingContextHandler);
  }; // Request an XR session on the user device with WebXR,
  // typically in response to a user request such as a button press

  publicAPI.interAction = function(){
    //TODO Adding inter action source and reaction
  }

  publicAPI.getXRSessionInit = function(mode, options) {
  	if ( options && options.referenceSpaceType ) {
      // model.setReferenceSpaceType( options.referenceSpaceType )
  		// renderer.xr.setReferenceSpaceType( options.referenceSpaceType );
  	}
  	var space = (options || {}).referenceSpaceType || 'local-floor';
  	var sessionInit = (options && options.sessionInit) || {};
  
  	// Nothing to do for default features.
  	if ( space == 'viewer' )
  		return sessionInit;
  	if ( space == 'local' && mode.startsWith('immersive' ) )
  		return sessionInit;
  
  	// If the user already specified the space as an optional or required feature, don't do anything.
  	if ( sessionInit.optionalFeatures && sessionInit.optionalFeatures.includes(space) )
  		return sessionInit;
  	if ( sessionInit.requiredFeatures && sessionInit.requiredFeatures.includes(space) )
  		return sessionInit;
  
  	var newInit = Object.assign( {}, sessionInit );
  	newInit.requiredFeatures = [ space ];
  	if ( sessionInit.requiredFeatures ) {
  		newInit.requiredFeatures = newInit.requiredFeatures.concat( sessionInit.requiredFeatures );
  	}
  	return newInit;
   }

  publicAPI.startXR = function (isAR, options) {
    if (navigator.xr === undefined) {
      throw new Error('WebXR is not available');
    }

    model.xrSessionIsAR = isAR;
    var sessionType = isAR ? 'immersive-ar' : 'immersive-vr';

    if (!navigator.xr.isSessionSupported(sessionType)) {
      if (isAR) {
        throw new Error('Device does not support AR session');
      } else {
        throw new Error('VR display is not available');
      }
    }
    var sessionInit = publicAPI.getXRSessionInit( sessionType, {
			mode: sessionType,
			referenceSpaceType: 'local', // 'local-floor'
			sessionInit: options
		});
    console.log(sessionInit)
    if (model.xrSession === null) {
      if(sessionType == 'immersive-ar')
      navigator.xr.requestSession(sessionType, {requiredFeatures: ['worldSensing']}).then(publicAPI.enterXR, function () {
        throw new Error('Failed to create AR session!');
      });
      else
      navigator.xr.requestSession(sessionType).then(publicAPI.enterXR, function () {
        throw new Error('Failed to create VR session!');
      });
    } else {
      throw new Error('XR Session already exists!');
    }
  }; // When an XR session is available, set up the XRWebGLLayer
  // and request the first animation frame for the device


  publicAPI.enterXR = /*#__PURE__*/function () {
    var _ref = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime.mark(function _callee(xrSession) {
      var gl, glLayer;
      return _regeneratorRuntime.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              model.xrSession = xrSession;
              model.oldCanvasSize = model.size.slice();

              if (!(model.xrSession !== null)) {
                _context.next = 15;
                break;
              }

              gl = publicAPI.get3DContext();
              _context.next = 6;
              return gl.makeXRCompatible();

            case 6:
              glLayer = new global.XRWebGLLayer(model.xrSession, gl);
              publicAPI.setSize(glLayer.framebufferWidth, glLayer.framebufferHeight);
              model.xrSession.updateRenderState({
                baseLayer: glLayer
              });
              model.xrSession.requestReferenceSpace('local').then(function (refSpace) {
                model.xrReferenceSpace = refSpace;
              });
              model.xrSession.requestReferenceSpace('viewer').then(function (refSpace) {
                model.xrViewerReferenceSpace = refSpace;
              });
              
              publicAPI.resetXRScene();
              model.renderable.getInteractor().switchToXRAnimation();
              model.xrSceneFrame = model.xrSession.requestAnimationFrame(publicAPI.xrRender);
              _context.next = 16;
              break;

            case 15:
              throw new Error('Failed to enter VR with a null xrSession.');

            case 16:
            case "end":
              return _context.stop();
          }
        }
      }, _callee);
    }));

    return function (_x) {
      return _ref.apply(this, arguments);
    };
  }();

  publicAPI.resetXRScene = function () {
    var inputRescaleFactor = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : DEFAULT_RESET_FACTORS.vr.rescaleFactor;
    var inputTranslateZ = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : DEFAULT_RESET_FACTORS.vr.translateZ;
    // Adjust world-to-physical parameters for different modalities
    // Default parameter values are for VR (model.xrSessionIsAR == false)
    var rescaleFactor = inputRescaleFactor;
    var translateZ = inputTranslateZ;

    if (model.xrSessionIsAR && rescaleFactor === DEFAULT_RESET_FACTORS.vr.rescaleFactor) {
      // Scale down by default in AR
      rescaleFactor = DEFAULT_RESET_FACTORS.ar.rescaleFactor;
    }

    if (model.xrSessionIsAR && translateZ === DEFAULT_RESET_FACTORS.vr.translateZ) {
      // Default closer to the camera in AR
      translateZ = DEFAULT_RESET_FACTORS.ar.translateZ;
    }
    
    var ren = model.renderable.getRenderers()[0];
    // ren.resetCamera();
    // console.log('publicAPI',publicAPI)
    // console.log('model',model.hasOwnProperty('controlContainer'))
    // var act = ren.getVolumes()[0]
    
    // console.log(act.getPosition())
    // console.log(act.getScale())
    // act.setPosition([0, 0, 0.001])
    // act.setScale(act.getScale()[0]/5,act.getScale()[1]/5,act.getScale()[2]/5)
    // console.log(act.getPosition())
    // console.log(act.getScale())
    // ren.addActor(act)
    
    var camera = ren.getActiveCamera();
    var physicalScale = camera.getPhysicalScale();
    var physicalTranslation = camera.getPhysicalTranslation();
    physicalScale /= rescaleFactor;
    translateZ *= physicalScale;
    physicalTranslation[2] += translateZ;
    camera.setPhysicalScale(physicalScale);
    camera.setPhysicalTranslation(physicalTranslation); // Clip at 0.1m, 100.0m in physical space by default

    camera.setClippingRange(0.1 * physicalScale, 100.0 * physicalScale);
  };

  publicAPI.stopXR = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime.mark(function _callee2() {
    var gl, ren;
    return _regeneratorRuntime.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            if (!(navigator.xr === undefined)) {
              _context2.next = 2;
              break;
            }

            return _context2.abrupt("return");

          case 2:
            if (!(model.xrSession !== null)) {
              _context2.next = 10;
              break;
            }

            
            model.xrSession.cancelAnimationFrame(model.xrSceneFrame);
            model.renderable.getInteractor().returnFromXRAnimation();
            gl = publicAPI.get3DContext();
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            _context2.next = 9;
            return model.xrSession.end().catch(function (error) {
              if (!(error instanceof DOMException)) {
                throw error;
              }
            });

          case 9:
            model.xrSession = null;

          case 10:
            if (model.oldCanvasSize !== undefined) {
              publicAPI.setSize.apply(publicAPI, _toConsumableArray(model.oldCanvasSize));
            } // Reset to default canvas


            ren = model.renderable.getRenderers()[0];
            ren.getActiveCamera().setProjectionMatrix(null);
            ren.resetCamera();
            ren.setViewport(0.0, 0, 1.0, 1.0);
            publicAPI.traverseAllPasses();

          case 16:
          case "end":
            return _context2.stop();
        }
      }
    }, _callee2);
  }));

  publicAPI.addAnchoredNode= function(anchor, node){
		if (!anchor || !anchor.uid) {
			console.error("not a valid anchor", anchor)
			return;
		}
		this._anchoredNodes.set(anchor.uid, {
			anchor: anchor,
			node: node
		})
		node.anchor = anchor
		node.matrixAutoUpdate = false
		node.matrix.fromArray(anchor.modelMatrix)
		node.updateMatrixWorld(true)	
		this._scene.add(node)

		anchor.addEventListener("update", this._handleAnchorUpdate.bind(this))
		anchor.addEventListener("remove", this._handleAnchorDelete.bind(this))
	
		return node
	}

  publicAPI.xrRender = /*#__PURE__*/function () {
    var _ref3 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime.mark(function _callee3(t, frame) {
      var xrSession, xrPose, gl, glLayer, ren;
      return _regeneratorRuntime.wrap(function _callee3$(_context3) {
        while (1) {
          switch (_context3.prev = _context3.next) {
            case 0:
              xrSession = frame.session;

              // TODO: Matching the enginee with the vtk renderer
              // get the location of the device, and use it to create an 
				      // anchor with the identity orientation
              // console.log(global.hubsImageData)
              // model.xrViewerReferenceSpace viewer space
              // model.xrReferenceSpace or model.xrLocalReferenceSpace Real world space
              mat4.copy(workingMatrix, frame.getPose(model.xrReferenceSpace, model.xrViewerReferenceSpace).transform.matrix);
              // workingVec3 is 
              mat4.getTranslation(workingVec3, workingMatrix);
              // workingMatrix
              mat4.fromTranslation(workingMatrix, workingVec3);

              // console.log('workingMatrix',workingMatrix)//'Float32Array'
              
              const anchor = frame.addAnchor(workingMatrix, model.xrReferenceSpace);
              publicAPI.addAnchoredNode(anchor, model.renderable.getRenderers()[0]);

              if (!imageDetectionCreationRequested) {
                imageDetectionCreationRequested=true
                // console.log(global.hubsImageData)
                xrSession.nonStandard_createDetectionImage('hubs', global.hubsImageData.data, global.hubsImageData.width, global.hubsImageData.height, 0.2).then(() => {
                  imageActivateDetection = true;
                }).catch(error => {
                  window.alert(`error creating ducky detection image: ${error}`)
                });
              }
              if (!imageActivated && imageActivateDetection) {
                imageActivated = true;
                imageActivateDetection = false;
      
                // window.alert('start detect')
                session.nonStandard_activateDetectionImage('hubs').then(anchor => {
                  imageActivated = false;
                  // imageAnchor = anchor;
                  window.alert("in detect")
                  // imageAnchor.addEventListener('remove', event => {
                  imageActivated = false;
                  // });
                  // engine.addAnchoredNode(imageAnchor, ducky);
                }).catch(error => {
                  imageActivated = false;
                  console.error(`error activating ducky detection image: ${error}`);
                });
              }

              var interactor = model.renderable.getInteractor()
              if(navigator.xr.isSessionSupported('immersive-ar')){
                // console.log(frame)
                // const results = frame.getImageTrackingResults();
                interactor.updateXRScreen(xrSession, frame, model.xrReferenceSpace, model.renderable.getRenderers()[0]);
              }
              else{
                interactor.updateXRScreen(xrSession, frame, model.xrReferenceSpace);
              }
              // Update each frame
              model.xrSceneFrame = model.xrSession.requestAnimationFrame(publicAPI.xrRender);
              xrPose = frame.getViewerPose(model.xrReferenceSpace);

              if (xrPose) {
                gl = publicAPI.get3DContext();

                if (model.xrSessionIsAR && model.oldCanvasSize !== undefined) {
                  gl.canvas.width = model.oldCanvasSize[0];
                  gl.canvas.height = model.oldCanvasSize[1];
                }

                glLayer = xrSession.renderState.baseLayer;
                gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.clear(gl.DEPTH_BUFFER_BIT); // get the first renderer

                ren = model.renderable.getRenderers()[0]; // Do a render pass for each eye

                xrPose.views.forEach(function (view) {
                  var viewport = glLayer.getViewport(view);
                  gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height); // TODO: Appropriate handling for AR passthrough on HMDs
                  // with two eyes will require further investigation.

                  if (!model.xrSessionIsAR) {
                    if (view.eye === 'left') {
                      ren.setViewport(0, 0, 0.5, 1.0);
                    } else if (view.eye === 'right') {
                      ren.setViewport(0.5, 0, 1.0, 1.0);
                    } else {
                      // No handling for non-eye viewport
                      return;
                    }
                  }

                  ren.getActiveCamera().computeViewParametersFromPhysicalMatrix(view.transform.inverse.matrix);
                  ren.getActiveCamera().setProjectionMatrix(view.projectionMatrix);
                  publicAPI.traverseAllPasses();
                });
              }

            case 5:
            case "end":
              return _context3.stop();
          }
        }
      }, _callee3);
    }));

    return function (_x2, _x3) {
      return _ref3.apply(this, arguments);
    };
  }();

  publicAPI.restoreContext = function () {
    var rp = vtkRenderPass.newInstance();
    rp.setCurrentOperation('Release');
    rp.traverse(publicAPI, null);
  };

  publicAPI.activateTexture = function (texture) {
    // Only add if it isn't already there
    var result = model._textureResourceIds.get(texture);

    if (result !== undefined) {
      model.context.activeTexture(model.context.TEXTURE0 + result);
      return;
    }

    var activeUnit = publicAPI.getTextureUnitManager().allocate();

    if (activeUnit < 0) {
      vtkErrorMacro('Hardware does not support the number of textures defined.');
      return;
    }

    model._textureResourceIds.set(texture, activeUnit);

    model.context.activeTexture(model.context.TEXTURE0 + activeUnit);
  };

  publicAPI.deactivateTexture = function (texture) {
    // Only deactivate if it isn't already there
    var result = model._textureResourceIds.get(texture);

    if (result !== undefined) {
      publicAPI.getTextureUnitManager().free(result);

      model._textureResourceIds.delete(texture);
    }
  };

  publicAPI.getTextureUnitForTexture = function (texture) {
    var result = model._textureResourceIds.get(texture);

    if (result !== undefined) {
      return result;
    }

    return -1;
  };

  publicAPI.getDefaultTextureInternalFormat = function (vtktype, numComps, useFloat) {
    if (model.webgl2) {
      switch (vtktype) {
        case VtkDataTypes.UNSIGNED_CHAR:
          switch (numComps) {
            case 1:
              return model.context.R8;

            case 2:
              return model.context.RG8;

            case 3:
              return model.context.RGB8;

            case 4:
            default:
              return model.context.RGBA8;
          }

        case VtkDataTypes.FLOAT:
        default:
          switch (numComps) {
            case 1:
              return model.context.R16F;

            case 2:
              return model.context.RG16F;

            case 3:
              return model.context.RGB16F;

            case 4:
            default:
              return model.context.RGBA16F;
          }

      }
    } // webgl1 only supports four types


    switch (numComps) {
      case 1:
        return model.context.LUMINANCE;

      case 2:
        return model.context.LUMINANCE_ALPHA;

      case 3:
        return model.context.RGB;

      case 4:
      default:
        return model.context.RGBA;
    }
  };

  publicAPI.setBackgroundImage = function (img) {
    model.bgImage.src = img.src;
  };

  publicAPI.setUseBackgroundImage = function (value) {
    model.useBackgroundImage = value; // Add or remove the background image from the
    // DOM as specified.

    if (model.useBackgroundImage && !model.el.contains(model.bgImage)) {
      model.el.appendChild(model.bgImage);
    } else if (!model.useBackgroundImage && model.el.contains(model.bgImage)) {
      model.el.removeChild(model.bgImage);
    }
  };

  function getCanvasDataURL() {
    var format = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : model.imageFormat;
    // Copy current canvas to not modify the original
    var temporaryCanvas = document.createElement('canvas');
    var temporaryContext = temporaryCanvas.getContext('2d');
    temporaryCanvas.width = model.canvas.width;
    temporaryCanvas.height = model.canvas.height;
    temporaryContext.drawImage(model.canvas, 0, 0); // Get current client rect to place canvas

    var mainBoundingClientRect = model.canvas.getBoundingClientRect();
    var renderWindow = model.renderable;
    var renderers = renderWindow.getRenderers();
    renderers.forEach(function (renderer) {
      var viewProps = renderer.getViewProps();
      viewProps.forEach(function (viewProp) {
        // Check if the prop has a container that should have canvas
        if (viewProp.getContainer) {
          var container = viewProp.getContainer();
          var canvasList = container.getElementsByTagName('canvas'); // Go throughout all canvas and copy it into temporary main canvas

          for (var i = 0; i < canvasList.length; i++) {
            var currentCanvas = canvasList[i];
            var boundingClientRect = currentCanvas.getBoundingClientRect();
            var newXPosition = boundingClientRect.x - mainBoundingClientRect.x;
            var newYPosition = boundingClientRect.y - mainBoundingClientRect.y;
            temporaryContext.drawImage(currentCanvas, newXPosition, newYPosition);
          }
        }
      });
    });
    var screenshot = temporaryCanvas.toDataURL(format);
    temporaryCanvas.remove();
    publicAPI.invokeImageReady(screenshot);
  }

  publicAPI.captureNextImage = function () {
    var format = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'image/png';

    var _ref4 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        _ref4$resetCamera = _ref4.resetCamera,
        resetCamera = _ref4$resetCamera === void 0 ? false : _ref4$resetCamera,
        _ref4$size = _ref4.size,
        size = _ref4$size === void 0 ? null : _ref4$size,
        _ref4$scale = _ref4.scale,
        scale = _ref4$scale === void 0 ? 1 : _ref4$scale;

    if (model.deleted) {
      return null;
    }

    model.imageFormat = format;
    var previous = model.notifyStartCaptureImage;
    model.notifyStartCaptureImage = true;
    model._screenshot = {
      size: !!size || scale !== 1 ? size || model.size.map(function (val) {
        return val * scale;
      }) : null
    };
    return new Promise(function (resolve, reject) {
      var subscription = publicAPI.onImageReady(function (imageURL) {
        if (model._screenshot.size === null) {
          model.notifyStartCaptureImage = previous;
          subscription.unsubscribe();

          if (model._screenshot.placeHolder) {
            // resize the main canvas back to its original size and show it
            model.size = model._screenshot.originalSize; // process the resize

            publicAPI.modified(); // restore the saved camera parameters, if applicable

            if (model._screenshot.cameras) {
              model._screenshot.cameras.forEach(function (_ref5) {
                var restoreParamsFn = _ref5.restoreParamsFn,
                    arg = _ref5.arg;
                return restoreParamsFn(arg);
              });
            } // Trigger a render at the original size


            publicAPI.traverseAllPasses(); // Remove and clean up the placeholder, revealing the original

            model.el.removeChild(model._screenshot.placeHolder);

            model._screenshot.placeHolder.remove();

            model._screenshot = null;
          }

          resolve(imageURL);
        } else {
          // Create a placeholder image overlay while we resize and render
          var tmpImg = document.createElement('img');
          tmpImg.style = SCREENSHOT_PLACEHOLDER;
          tmpImg.src = imageURL;
          model._screenshot.placeHolder = model.el.appendChild(tmpImg); // hide the main canvas

          model.canvas.style.display = 'none'; // remember the main canvas original size, then resize it

          model._screenshot.originalSize = model.size;
          model.size = model._screenshot.size;
          model._screenshot.size = null; // process the resize

          publicAPI.modified();

          if (resetCamera) {
            var isUserResetCamera = resetCamera !== true; // If resetCamera was requested, we first save camera parameters
            // from all the renderers, so we can restore them later

            model._screenshot.cameras = model.renderable.getRenderers().map(function (renderer) {
              var camera = renderer.getActiveCamera();
              var params = camera.get('focalPoint', 'position', 'parallelScale');
              return {
                resetCameraArgs: isUserResetCamera ? {
                  renderer: renderer
                } : undefined,
                resetCameraFn: isUserResetCamera ? resetCamera : renderer.resetCamera,
                restoreParamsFn: camera.set,
                // "clone" the params so we don't keep refs to properties
                arg: JSON.parse(JSON.stringify(params))
              };
            }); // Perform the resetCamera() on each renderer only after capturing
            // the params from all active cameras, in case there happen to be
            // linked cameras among the renderers.

            model._screenshot.cameras.forEach(function (_ref6) {
              var resetCameraFn = _ref6.resetCameraFn,
                  resetCameraArgs = _ref6.resetCameraArgs;
              return resetCameraFn(resetCameraArgs);
            });
          } // Trigger a render at the custom size


          publicAPI.traverseAllPasses();
        }
      });
    });
  };

  var hardwareMaximumLineWidth;

  publicAPI.getHardwareMaximumLineWidth = function () {
    // We cache the result of this function because `getParameter` is slow
    if (hardwareMaximumLineWidth != null) {
      return hardwareMaximumLineWidth;
    }

    var gl = publicAPI.get3DContext();
    var lineWidthRange = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
    hardwareMaximumLineWidth = lineWidthRange[1];
    return lineWidthRange[1];
  };

  publicAPI.getGLInformations = function () {
    var gl = publicAPI.get3DContext();
    var glTextureFloat = gl.getExtension('OES_texture_float');
    var glTextureHalfFloat = gl.getExtension('OES_texture_half_float');
    var glDebugRendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    var glDrawBuffers = gl.getExtension('WEBGL_draw_buffers');
    var glAnisotropic = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    var params = [['Max Vertex Attributes', 'MAX_VERTEX_ATTRIBS', gl.getParameter(gl.MAX_VERTEX_ATTRIBS)], ['Max Varying Vectors', 'MAX_VARYING_VECTORS', gl.getParameter(gl.MAX_VARYING_VECTORS)], ['Max Vertex Uniform Vectors', 'MAX_VERTEX_UNIFORM_VECTORS', gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)], ['Max Fragment Uniform Vectors', 'MAX_FRAGMENT_UNIFORM_VECTORS', gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)], ['Max Fragment Texture Image Units', 'MAX_TEXTURE_IMAGE_UNITS', gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)], ['Max Vertex Texture Image Units', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)], ['Max Combined Texture Image Units', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)], ['Max 2D Texture Size', 'MAX_TEXTURE_SIZE', gl.getParameter(gl.MAX_TEXTURE_SIZE)], ['Max Cube Texture Size', 'MAX_CUBE_MAP_TEXTURE_SIZE', gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE)], ['Max Texture Anisotropy', 'MAX_TEXTURE_MAX_ANISOTROPY_EXT', glAnisotropic && gl.getParameter(glAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)], ['Point Size Range', 'ALIASED_POINT_SIZE_RANGE', gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE).join(' - ')], ['Line Width Range', 'ALIASED_LINE_WIDTH_RANGE', gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE).join(' - ')], ['Max Viewport Dimensions', 'MAX_VIEWPORT_DIMS', gl.getParameter(gl.MAX_VIEWPORT_DIMS).join(' - ')], ['Max Renderbuffer Size', 'MAX_RENDERBUFFER_SIZE', gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)], ['Framebuffer Red Bits', 'RED_BITS', gl.getParameter(gl.RED_BITS)], ['Framebuffer Green Bits', 'GREEN_BITS', gl.getParameter(gl.GREEN_BITS)], ['Framebuffer Blue Bits', 'BLUE_BITS', gl.getParameter(gl.BLUE_BITS)], ['Framebuffer Alpha Bits', 'ALPHA_BITS', gl.getParameter(gl.ALPHA_BITS)], ['Framebuffer Depth Bits', 'DEPTH_BITS', gl.getParameter(gl.DEPTH_BITS)], ['Framebuffer Stencil Bits', 'STENCIL_BITS', gl.getParameter(gl.STENCIL_BITS)], ['Framebuffer Subpixel Bits', 'SUBPIXEL_BITS', gl.getParameter(gl.SUBPIXEL_BITS)], ['MSAA Samples', 'SAMPLES', gl.getParameter(gl.SAMPLES)], ['MSAA Sample Buffers', 'SAMPLE_BUFFERS', gl.getParameter(gl.SAMPLE_BUFFERS)], ['Supported Formats for UByte Render Targets     ', 'UNSIGNED_BYTE RENDER TARGET FORMATS', [glTextureFloat && checkRenderTargetSupport(gl, gl.RGBA, gl.UNSIGNED_BYTE) ? 'RGBA' : '', glTextureFloat && checkRenderTargetSupport(gl, gl.RGB, gl.UNSIGNED_BYTE) ? 'RGB' : '', glTextureFloat && checkRenderTargetSupport(gl, gl.LUMINANCE, gl.UNSIGNED_BYTE) ? 'LUMINANCE' : '', glTextureFloat && checkRenderTargetSupport(gl, gl.ALPHA, gl.UNSIGNED_BYTE) ? 'ALPHA' : '', glTextureFloat && checkRenderTargetSupport(gl, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE) ? 'LUMINANCE_ALPHA' : ''].join(' ')], ['Supported Formats for Half Float Render Targets', 'HALF FLOAT RENDER TARGET FORMATS', [glTextureHalfFloat && checkRenderTargetSupport(gl, gl.RGBA, glTextureHalfFloat.HALF_FLOAT_OES) ? 'RGBA' : '', glTextureHalfFloat && checkRenderTargetSupport(gl, gl.RGB, glTextureHalfFloat.HALF_FLOAT_OES) ? 'RGB' : '', glTextureHalfFloat && checkRenderTargetSupport(gl, gl.LUMINANCE, glTextureHalfFloat.HALF_FLOAT_OES) ? 'LUMINANCE' : '', glTextureHalfFloat && checkRenderTargetSupport(gl, gl.ALPHA, glTextureHalfFloat.HALF_FLOAT_OES) ? 'ALPHA' : '', glTextureHalfFloat && checkRenderTargetSupport(gl, gl.LUMINANCE_ALPHA, glTextureHalfFloat.HALF_FLOAT_OES) ? 'LUMINANCE_ALPHA' : ''].join(' ')], ['Supported Formats for Full Float Render Targets', 'FLOAT RENDER TARGET FORMATS', [glTextureFloat && checkRenderTargetSupport(gl, gl.RGBA, gl.FLOAT) ? 'RGBA' : '', glTextureFloat && checkRenderTargetSupport(gl, gl.RGB, gl.FLOAT) ? 'RGB' : '', glTextureFloat && checkRenderTargetSupport(gl, gl.LUMINANCE, gl.FLOAT) ? 'LUMINANCE' : '', glTextureFloat && checkRenderTargetSupport(gl, gl.ALPHA, gl.FLOAT) ? 'ALPHA' : '', glTextureFloat && checkRenderTargetSupport(gl, gl.LUMINANCE_ALPHA, gl.FLOAT) ? 'LUMINANCE_ALPHA' : ''].join(' ')], ['Max Multiple Render Targets Buffers', 'MAX_DRAW_BUFFERS_WEBGL', glDrawBuffers ? gl.getParameter(glDrawBuffers.MAX_DRAW_BUFFERS_WEBGL) : 0], ['High Float Precision in Vertex Shader', 'HIGH_FLOAT VERTEX_SHADER', [gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT).rangeMax, '</sup>)'].join('')], ['Medium Float Precision in Vertex Shader', 'MEDIUM_FLOAT VERTEX_SHADER', [gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT).rangeMax, '</sup>)'].join('')], ['Low Float Precision in Vertex Shader', 'LOW_FLOAT VERTEX_SHADER', [gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.LOW_FLOAT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.LOW_FLOAT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.LOW_FLOAT).rangeMax, '</sup>)'].join('')], ['High Float Precision in Fragment Shader', 'HIGH_FLOAT FRAGMENT_SHADER', [gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).rangeMax, '</sup>)'].join('')], ['Medium Float Precision in Fragment Shader', 'MEDIUM_FLOAT FRAGMENT_SHADER', [gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT).rangeMax, '</sup>)'].join('')], ['Low Float Precision in Fragment Shader', 'LOW_FLOAT FRAGMENT_SHADER', [gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_FLOAT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_FLOAT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_FLOAT).rangeMax, '</sup>)'].join('')], ['High Int Precision in Vertex Shader', 'HIGH_INT VERTEX_SHADER', [gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_INT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_INT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_INT).rangeMax, '</sup>)'].join('')], ['Medium Int Precision in Vertex Shader', 'MEDIUM_INT VERTEX_SHADER', [gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_INT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_INT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_INT).rangeMax, '</sup>)'].join('')], ['Low Int Precision in Vertex Shader', 'LOW_INT VERTEX_SHADER', [gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.LOW_INT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.LOW_INT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.LOW_INT).rangeMax, '</sup>)'].join('')], ['High Int Precision in Fragment Shader', 'HIGH_INT FRAGMENT_SHADER', [gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_INT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_INT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_INT).rangeMax, '</sup>)'].join('')], ['Medium Int Precision in Fragment Shader', 'MEDIUM_INT FRAGMENT_SHADER', [gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_INT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_INT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_INT).rangeMax, '</sup>)'].join('')], ['Low Int Precision in Fragment Shader', 'LOW_INT FRAGMENT_SHADER', [gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_INT).precision, ' (-2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_INT).rangeMin, '</sup> - 2<sup>', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_INT).rangeMax, '</sup>)'].join('')], ['Supported Extensions', 'EXTENSIONS', gl.getSupportedExtensions().join('<br/>\t\t\t\t\t    ')], ['WebGL Renderer', 'RENDERER', gl.getParameter(gl.RENDERER)], ['WebGL Vendor', 'VENDOR', gl.getParameter(gl.VENDOR)], ['WebGL Version', 'VERSION', gl.getParameter(gl.VERSION)], ['Shading Language Version', 'SHADING_LANGUAGE_VERSION', gl.getParameter(gl.SHADING_LANGUAGE_VERSION)], ['Unmasked Renderer', 'UNMASKED_RENDERER', glDebugRendererInfo && gl.getParameter(glDebugRendererInfo.UNMASKED_RENDERER_WEBGL)], ['Unmasked Vendor', 'UNMASKED_VENDOR', glDebugRendererInfo && gl.getParameter(glDebugRendererInfo.UNMASKED_VENDOR_WEBGL)], ['WebGL Version', 'WEBGL_VERSION', model.webgl2 ? 2 : 1]];
    var result = {};

    while (params.length) {
      var _params$pop = params.pop(),
          _params$pop2 = _slicedToArray(_params$pop, 3),
          label = _params$pop2[0],
          key = _params$pop2[1],
          value = _params$pop2[2];

      if (key) {
        result[key] = {
          label: label,
          value: value
        };
      }
    }

    return result;
  };

  publicAPI.traverseAllPasses = function () {
    if (model.renderPasses) {
      for (var index = 0; index < model.renderPasses.length; ++index) {
        model.renderPasses[index].traverse(publicAPI, null);
      }
    }

    if (model.notifyStartCaptureImage) {
      getCanvasDataURL();
    }
  };

  publicAPI.disableCullFace = function () {
    if (model.cullFaceEnabled) {
      model.context.disable(model.context.CULL_FACE);
      model.cullFaceEnabled = false;
    }
  };

  publicAPI.enableCullFace = function () {
    if (!model.cullFaceEnabled) {
      model.context.enable(model.context.CULL_FACE);
      model.cullFaceEnabled = true;
    }
  };

  publicAPI.setViewStream = function (stream) {
    if (model.viewStream === stream) {
      return false;
    }

    if (model.subscription) {
      model.subscription.unsubscribe();
      model.subscription = null;
    }

    model.viewStream = stream;

    if (model.viewStream) {
      // Force background to be transparent + render
      var mainRenderer = model.renderable.getRenderers()[0];
      mainRenderer.getBackgroundByReference()[3] = 0; // Enable display of the background image

      publicAPI.setUseBackgroundImage(true); // Bind to remote stream

      model.subscription = model.viewStream.onImageReady(function (e) {
        return publicAPI.setBackgroundImage(e.image);
      });
      model.viewStream.setSize(model.size[0], model.size[1]);
      model.viewStream.invalidateCache();
      model.viewStream.render();
      publicAPI.modified();
    }

    return true;
  };

  publicAPI.createSelector = function () {
    var ret = vtkHardwareSelector.newInstance();
    ret.setOpenGLRenderWindow(publicAPI);
    return ret;
  };

  publicAPI.delete = macro.chain(publicAPI.delete, publicAPI.setViewStream, deleteGLContext);
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------


var DEFAULT_VALUES = {
  cullFaceEnabled: false,
  shaderCache: null,
  initialized: false,
  context: null,
  canvas: null,
  cursorVisibility: true,
  cursor: 'pointer',
  textureUnitManager: null,
  textureResourceIds: null,
  containerSize: null,
  renderPasses: [],
  notifyStartCaptureImage: false,
  webgl2: false,
  defaultToWebgl2: true,
  // attempt webgl2 on by default
  activeFramebuffer: null,
  xrSession: null,
  xrSessionIsAR: false,
  xrReferenceSpace: null,
  xrSupported: true,
  imageFormat: 'image/png',
  useOffScreen: false,
  useBackgroundImage: false
}; // ----------------------------------------------------------------------------

function extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, DEFAULT_VALUES, initialValues); // Inheritance

  vtkRenderWindowViewNode.extend(publicAPI, model, initialValues); // Create internal instances

  model.canvas = document.createElement('canvas');
  model.canvas.style.width = '100%';
  createGLContext();

  if (!model.selector) {
    model.selector = vtkHardwareSelector.newInstance();
    model.selector.setOpenGLRenderWindow(publicAPI);
  } // Create internal bgImage


  model.bgImage = new Image();
  model.bgImage.style.position = 'absolute';
  model.bgImage.style.left = '0';
  model.bgImage.style.top = '0';
  model.bgImage.style.width = '100%';
  model.bgImage.style.height = '100%';
  model.bgImage.style.zIndex = '-1';
  model._textureResourceIds = new Map();
  model.myFactory = vtkViewNodeFactory.newInstance();
  /* eslint-disable no-use-before-define */

  model.myFactory.registerOverride('vtkRenderWindow', newInstance);
  /* eslint-enable no-use-before-define */

  model.shaderCache = vtkShaderCache.newInstance();
  model.shaderCache.setOpenGLRenderWindow(publicAPI); // setup default forward pass rendering

  model.renderPasses[0] = vtkForwardPass.newInstance();
  macro.event(publicAPI, model, 'imageReady');
  macro.event(publicAPI, model, 'haveVRDisplay'); // Build VTK API

  macro.get(publicAPI, model, ['shaderCache', 'textureUnitManager', 'webgl2', 'vrDisplay', 'useBackgroundImage', 'xrSupported']);
  macro.setGet(publicAPI, model, ['initialized', 'context', 'canvas', 'renderPasses', 'notifyStartCaptureImage', 'defaultToWebgl2', 'cursor', 'useOffScreen', // might want to make this not call modified as
  // we change the active framebuffer a lot. Or maybe
  // only mark modified if the size or depth
  // of the buffer has changed
  'activeFramebuffer']);
  macro.setGetArray(publicAPI, model, ['size'], 2); // Object methods

  vtkOpenGLRenderWindow(publicAPI, model);
} // ----------------------------------------------------------------------------

var newInstance = macro.newInstance(extend, 'vtkOpenGLRenderWindow'); // ----------------------------------------------------------------------------
// Register API specific RenderWindow implementation
// ----------------------------------------------------------------------------

registerViewConstructor('WebGL', newInstance); // ----------------------------------------------------------------------------

var vtkRenderWindow = {
  newInstance: newInstance,
  extend: extend,
  pushMonitorGLContextCount: pushMonitorGLContextCount,
  popMonitorGLContextCount: popMonitorGLContextCount
};

export { vtkRenderWindow as default, extend, newInstance, popMonitorGLContextCount, pushMonitorGLContextCount };
