import _toConsumableArray from '@babel/runtime/helpers/toConsumableArray';
import _defineProperty from '@babel/runtime/helpers/defineProperty';
import macro from '@kitware/vtk.js/macros.js';
import { ac, B as degreesFromRadians } from '@kitware/vtk.js/Common/Core/Math/index.js';
import Constants from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor/Constants.js';

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
var Device = Constants.Device,
    Input = Constants.Input;
var vtkWarningMacro = macro.vtkWarningMacro,
    vtkErrorMacro = macro.vtkErrorMacro,
    normalizeWheel = macro.normalizeWheel,
    vtkOnceErrorMacro = macro.vtkOnceErrorMacro; // ----------------------------------------------------------------------------
// Global methods
// ----------------------------------------------------------------------------

var EMPTY_MOUSE_EVENT = new MouseEvent('');
var deviceInputMap = {
  'xr-standard': [Input.Trigger, Input.Grip, Input.TrackPad, Input.Thumbstick, Input.A, Input.B]
};
var handledEvents = ['StartAnimation', 'Animation', 'EndAnimation', 'PointerEnter', 'PointerLeave', 'MouseEnter', 'MouseLeave', 'StartMouseMove', 'MouseMove', 'EndMouseMove', 'LeftButtonPress', 'LeftButtonRelease', 'MiddleButtonPress', 'MiddleButtonRelease', 'RightButtonPress', 'RightButtonRelease', 'KeyPress', 'KeyDown', 'KeyUp', 'StartMouseWheel', 'MouseWheel', 'EndMouseWheel', 'StartPinch', 'Pinch', 'EndPinch', 'StartPan', 'Pan', 'EndPan', 'StartRotate', 'Rotate', 'EndRotate', 'Button3D', 'Move3D', 'StartPointerLock', 'EndPointerLock', 'StartInteraction', 'Interaction', 'EndInteraction', 'AnimationFrameRateUpdate'];

function preventDefault(event) {
  if (event.cancelable) {
    event.preventDefault();
  }
}

function pointerCacheToPositions(cache) {
  var positions = Object.create(null);
  cache.forEach(function (_ref) {
    var pointerId = _ref.pointerId,
        position = _ref.position;
    positions[pointerId] = position;
  });
  return positions;
} // ----------------------------------------------------------------------------
// vtkRenderWindowInteractor methods
// ----------------------------------------------------------------------------


function vtkRenderWindowInteractor(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkRenderWindowInteractor'); // Initialize list of requesters

  var animationRequesters = new Set(); // map from pointerId to { pointerId: number, position: [x, y] }

  var pointerCache = new Map(); // Public API methods
  //----------------------------------------------------------------------

  publicAPI.start = function () {
    // Let the compositing handle the event loop if it wants to.
    // if (publicAPI.HasObserver(vtkCommand::StartEvent) && !publicAPI.HandleEventLoop) {
    //   publicAPI.invokeEvent({ type: 'StartEvent' });
    //   return;
    // }
    // As a convenience, initialize if we aren't initialized yet.
    if (!model.initialized) {
      publicAPI.initialize();

      if (!model.initialized) {
        return;
      }
    } // Pass execution to the subclass which will run the event loop,
    // this will not return until TerminateApp is called.


    publicAPI.startEventLoop();
  }; //----------------------------------------------------------------------


  publicAPI.setRenderWindow = function (aren) {
    vtkErrorMacro('you want to call setView(view) instead of setRenderWindow on a vtk.js interactor');
  }; //----------------------------------------------------------------------


  publicAPI.setInteractorStyle = function (style) {
    if (model.interactorStyle !== style) {
      if (model.interactorStyle != null) {
        model.interactorStyle.setInteractor(null);
      }

      model.interactorStyle = style;

      if (model.interactorStyle != null) {
        if (model.interactorStyle.getInteractor() !== publicAPI) {
          model.interactorStyle.setInteractor(publicAPI);
        }
      }
    }
  }; //---------------------------------------------------------------------


  publicAPI.initialize = function () {
    model.initialized = true;
    publicAPI.enable();
    publicAPI.render();
  };

  publicAPI.enable = function () {
    return publicAPI.setEnabled(true);
  };

  publicAPI.disable = function () {
    return publicAPI.setEnabled(false);
  };

  publicAPI.startEventLoop = function () {
    return vtkWarningMacro('empty event loop');
  };

  function updateCurrentRenderer(x, y) {
    if (!model._forcedRenderer) {
      model.currentRenderer = publicAPI.findPokedRenderer(x, y);
    }
  }

  publicAPI.getCurrentRenderer = function () {
    if (model.currentRenderer) {
      return model.currentRenderer;
    }

    updateCurrentRenderer(0, 0);
    return model.currentRenderer;
  };

  function getScreenEventPositionFor(source) {
    var canvas = model._view.getCanvas();

    var bounds = canvas.getBoundingClientRect();
    var scaleX = canvas.width / bounds.width;
    var scaleY = canvas.height / bounds.height;
    var position = {
      x: scaleX * (source.clientX - bounds.left),
      y: scaleY * (bounds.height - source.clientY + bounds.top),
      z: 0
    }; // if multitouch, do not update the current renderer

    if (pointerCache.size <= 1 || !model.currentRenderer) {
      updateCurrentRenderer(position.x, position.y);
    }

    return position;
  }

  function getModifierKeysFor(event) {
    return {
      controlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey
    };
  }

  function getKeysFor(event) {
    var modifierKeys = getModifierKeysFor(event);

    var keys = _objectSpread({
      key: event.key,
      keyCode: event.charCode
    }, modifierKeys);

    return keys;
  }

  function getDeviceTypeFor(event) {
    return event.pointerType || '';
  }

  publicAPI.bindEvents = function (container) {
    model.container = container;
    container.addEventListener('contextmenu', preventDefault);
    container.addEventListener('wheel', publicAPI.handleWheel);
    container.addEventListener('DOMMouseScroll', publicAPI.handleWheel);
    container.addEventListener('pointerenter', publicAPI.handlePointerEnter);
    container.addEventListener('pointerleave', publicAPI.handlePointerLeave);
    container.addEventListener('pointermove', publicAPI.handlePointerMove, {
      passive: false
    });
    container.addEventListener('pointerdown', publicAPI.handlePointerDown, {
      passive: false
    });
    container.addEventListener('pointerup', publicAPI.handlePointerUp);
    container.addEventListener('pointercancel', publicAPI.handlePointerCancel);
    document.addEventListener('keypress', publicAPI.handleKeyPress);
    document.addEventListener('keydown', publicAPI.handleKeyDown);
    document.addEventListener('keyup', publicAPI.handleKeyUp);
    document.addEventListener('pointerlockchange', publicAPI.handlePointerLockChange); // using touchAction is more performant than preventDefault
    // in a touchstart handler.

    container.style.touchAction = 'none';
    container.style.userSelect = 'none'; // disables tap highlight for when cursor is pointer

    container.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';
  };

  publicAPI.unbindEvents = function () {
    var container = model.container;
    container.removeEventListener('contextmenu', preventDefault);
    container.removeEventListener('wheel', publicAPI.handleWheel);
    container.removeEventListener('DOMMouseScroll', publicAPI.handleWheel);
    container.removeEventListener('pointerenter', publicAPI.handlePointerEnter);
    container.removeEventListener('pointerleave', publicAPI.handlePointerLeave);
    container.removeEventListener('pointermove', publicAPI.handlePointerMove, {
      passive: false
    });
    container.removeEventListener('pointerdown', publicAPI.handlePointerDown, {
      passive: false
    });
    container.removeEventListener('pointerup', publicAPI.handlePointerUp);
    container.removeEventListener('pointercancel', publicAPI.handlePointerCancel);
    document.removeEventListener('keypress', publicAPI.handleKeyPress);
    document.removeEventListener('keydown', publicAPI.handleKeyDown);
    document.removeEventListener('keyup', publicAPI.handleKeyUp);
    document.removeEventListener('pointerlockchange', publicAPI.handlePointerLockChange);
    model.container = null;
    pointerCache.clear();
  };

  publicAPI.handleKeyPress = function (event) {
    var data = getKeysFor(event);
    publicAPI.keyPressEvent(data);
  };

  publicAPI.handleKeyDown = function (event) {
    var data = getKeysFor(event);
    publicAPI.keyDownEvent(data);
  };

  publicAPI.handleKeyUp = function (event) {
    var data = getKeysFor(event);
    publicAPI.keyUpEvent(data);
  };

  publicAPI.handlePointerEnter = function (event) {
    var callData = _objectSpread(_objectSpread({}, getModifierKeysFor(event)), {}, {
      position: getScreenEventPositionFor(event),
      deviceType: getDeviceTypeFor(event)
    });

    publicAPI.pointerEnterEvent(callData);

    if (callData.deviceType === 'mouse') {
      publicAPI.mouseEnterEvent(callData);
    }
  };

  publicAPI.handlePointerLeave = function (event) {
    var callData = _objectSpread(_objectSpread({}, getModifierKeysFor(event)), {}, {
      position: getScreenEventPositionFor(event),
      deviceType: getDeviceTypeFor(event)
    });

    publicAPI.pointerLeaveEvent(callData);

    if (callData.deviceType === 'mouse') {
      publicAPI.mouseLeaveEvent(callData);
    }
  };

  publicAPI.handlePointerDown = function (event) {
    if (event.button > 2 || publicAPI.isPointerLocked()) {
      // ignore events from extra mouse buttons such as `back` and `forward`
      return;
    }

    if (model.preventDefaultOnPointerDown) {
      preventDefault(event);
    }

    if (event.target.hasPointerCapture(event.pointerId)) {
      event.target.releasePointerCapture(event.pointerId);
    }

    model.container.setPointerCapture(event.pointerId);

    if (pointerCache.has(event.pointerId)) {
      vtkWarningMacro('[RenderWindowInteractor] duplicate pointerId detected');
    }

    pointerCache.set(event.pointerId, {
      pointerId: event.pointerId,
      position: getScreenEventPositionFor(event)
    });

    switch (event.pointerType) {
      case 'pen':
      case 'touch':
        publicAPI.handleTouchStart(event);
        break;

      case 'mouse':
      default:
        publicAPI.handleMouseDown(event);
        break;
    }
  };

  publicAPI.handlePointerUp = function (event) {
    if (pointerCache.has(event.pointerId)) {
      if (model.preventDefaultOnPointerUp) {
        preventDefault(event);
      }

      pointerCache.delete(event.pointerId);
      model.container.releasePointerCapture(event.pointerId);

      switch (event.pointerType) {
        case 'pen':
        case 'touch':
          publicAPI.handleTouchEnd(event);
          break;

        case 'mouse':
        default:
          publicAPI.handleMouseUp(event);
          break;
      }
    }
  };

  publicAPI.handlePointerCancel = function (event) {
    if (pointerCache.has(event.pointerId)) {
      pointerCache.delete(event.pointerId);

      switch (event.pointerType) {
        case 'pen':
        case 'touch':
          publicAPI.handleTouchEnd(event);
          break;

        case 'mouse':
        default:
          publicAPI.handleMouseUp(event);
          break;
      }
    }
  };

  publicAPI.handlePointerMove = function (event) {
    if (pointerCache.has(event.pointerId)) {
      var pointer = pointerCache.get(event.pointerId);
      pointer.position = getScreenEventPositionFor(event);
    }
    switch (event.pointerType) {
      case 'pen':
      case 'touch':
        publicAPI.handleTouchMove(event);
        break;

      case 'mouse':
      default:
        publicAPI.handleMouseMove(event);
        break;
    }
  };

  publicAPI.handleMouseDown = function (event) {
    var callData = _objectSpread(_objectSpread({}, getModifierKeysFor(event)), {}, {
      position: getScreenEventPositionFor(event),
      deviceType: getDeviceTypeFor(event)
    });

    switch (event.button) {
      case 0:
        publicAPI.leftButtonPressEvent(callData);
        break;
        
        case 1:
          publicAPI.middleButtonPressEvent(callData);
          break;
          
        case 2:
          publicAPI.rightButtonPressEvent(callData);
        break;

      default:
        vtkErrorMacro("Unknown mouse button pressed: ".concat(event.button));
        break;
    }
  }; //----------------------------------------------------------------------


  publicAPI.requestPointerLock = function () {
    if (model.container) {
      model.container.requestPointerLock();
    }
  }; //----------------------------------------------------------------------


  publicAPI.exitPointerLock = function () {
    return document.exitPointerLock();
  }; //----------------------------------------------------------------------


  publicAPI.isPointerLocked = function () {
    return !!model.container && document.pointerLockElement === model.container;
  }; //----------------------------------------------------------------------


  publicAPI.handlePointerLockChange = function () {
    if (publicAPI.isPointerLocked()) {
      publicAPI.startPointerLockEvent();
    } else {
      publicAPI.endPointerLockEvent();
    }
  }; //----------------------------------------------------------------------


  function forceRender() {
    if (model._view && model.enabled && model.enableRender) {
      model.inRender = true;

      model._view.traverseAllPasses();

      model.inRender = false;
    } // outside the above test so that third-party code can redirect
    // the render to the appropriate class


    publicAPI.invokeRenderEvent();
  }

  publicAPI.requestAnimation = function (requestor) {
    if (requestor === undefined) {
      vtkErrorMacro("undefined requester, can not start animating");
      return;
    }

    if (animationRequesters.has(requestor)) {
      vtkWarningMacro("requester is already registered for animating");
      return;
    }

    animationRequesters.add(requestor);

    if (!model.animationRequest && animationRequesters.size === 1 && !model.xrAnimation) {
      model._animationStartTime = Date.now();
      model._animationFrameCount = 0;
      model.animationRequest = requestAnimationFrame(publicAPI.handleAnimation);
      publicAPI.startAnimationEvent();
    }
  }; // continue animating for at least the specified duration of
  // milliseconds.


  publicAPI.extendAnimation = function (duration) {
    var newEnd = Date.now() + duration;
    model._animationExtendedEnd = Math.max(model._animationExtendedEnd, newEnd);

    if (!model.animationRequest && animationRequesters.size === 0 && !model.xrAnimation) {
      model._animationStartTime = Date.now();
      model._animationFrameCount = 0;
      model.animationRequest = requestAnimationFrame(publicAPI.handleAnimation);
      publicAPI.startAnimationEvent();
    }
  };

  publicAPI.isAnimating = function () {
    return model.xrAnimation || model.animationRequest !== null;
  };

  publicAPI.cancelAnimation = function (requestor) {
    var skipWarning = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    if (!animationRequesters.has(requestor)) {
      if (!skipWarning) {
        var requestStr = requestor && requestor.getClassName ? requestor.getClassName() : requestor;
        vtkWarningMacro("".concat(requestStr, " did not request an animation"));
      }

      return;
    }

    animationRequesters.delete(requestor);

    if (model.animationRequest && animationRequesters.size === 0 && Date.now() > model._animationExtendedEnd) {
      cancelAnimationFrame(model.animationRequest);
      model.animationRequest = null;
      publicAPI.endAnimationEvent();
      publicAPI.render();
    }
  };

  publicAPI.switchToXRAnimation = function () {
    // cancel existing animation if any
    if (model.animationRequest) {
      cancelAnimationFrame(model.animationRequest);
      model.animationRequest = null;
    }

    model.xrAnimation = true;
  };

  publicAPI.returnFromXRAnimation = function () {
    model.xrAnimation = false;

    if (animationRequesters.size !== 0) {
      model.recentAnimationFrameRate = 10.0;
      model.animationRequest = requestAnimationFrame(publicAPI.handleAnimation);
    }
  };

  publicAPI.updateXRGamepads = function (xrSession, xrFrame, xrRefSpace) {
    // watch for when buttons change state and fire events
    xrSession.inputSources.forEach(function (inputSource) {
      var gripPose = inputSource.gripSpace == null ? null : xrFrame.getPose(inputSource.gripSpace, xrRefSpace);
      var gp = inputSource.gamepad;
      var hand = inputSource.handedness;
      // console.log(inputSource.targetRayMode)
      if (gp) {
        if (!(gp.index in model.lastGamepadValues)) {
          model.lastGamepadValues[gp.index] = {
            left: {
              buttons: {}
            },
            right: {
              buttons: {}
            },
            none: {
              buttons: {}
            }
          };
        }

        for (var b = 0; b < gp.buttons.length; ++b) {
          if (!(b in model.lastGamepadValues[gp.index][hand].buttons)) {
            model.lastGamepadValues[gp.index][hand].buttons[b] = false;
          }

          if (model.lastGamepadValues[gp.index][hand].buttons[b] !== gp.buttons[b].pressed && gripPose != null) {
            publicAPI.button3DEvent({
              gamepad: gp,
              position: gripPose.transform.position,
              orientation: gripPose.transform.orientation,
              pressed: gp.buttons[b].pressed,
              device: inputSource.handedness === 'left' ? Device.LeftController : Device.RightController,
              input: deviceInputMap[gp.mapping] && deviceInputMap[gp.mapping][b] ? deviceInputMap[gp.mapping][b] : Input.Trigger
            });
            model.lastGamepadValues[gp.index][hand].buttons[b] = gp.buttons[b].pressed;
          }

          if (model.lastGamepadValues[gp.index][hand].buttons[b] && gripPose != null) {
            publicAPI.move3DEvent({
              gamepad: gp,
              position: gripPose.transform.position,
              orientation: gripPose.transform.orientation,
              device: inputSource.handedness === 'left' ? Device.LeftController : Device.RightController
            });
          }
        }
      }
    });
  };

  publicAPI.updateXRScreen = function (xrSession, xrFrame, xrRefSpace, vtkRenderer) {
    // watch for when buttons change state and fire events
    xrSession.inputSources.forEach(function (inputSource) {
      var act = vtkRenderer.getVolumes()[0];
      // act.rotateWXYZ(2,0,0.1,0);
      // console.log(act.getPosition())
      // act.setPosition(act.getPosition()[0]+1,0,0);
    });
  };


  publicAPI.handleMouseMove = function (event) {
    var callData = _objectSpread(_objectSpread({}, getModifierKeysFor(event)), {}, {
      position: getScreenEventPositionFor(event),
      deviceType: getDeviceTypeFor(event)
    });

    if (model.moveTimeoutID === 0) {
      publicAPI.startMouseMoveEvent(callData);
    } else {
      publicAPI.mouseMoveEvent(callData);
      clearTimeout(model.moveTimeoutID);
    } // start a timer to keep us animating while we get mouse move events


    model.moveTimeoutID = setTimeout(function () {
      publicAPI.endMouseMoveEvent();
      model.moveTimeoutID = 0;
    }, 200);
  };

  publicAPI.handleAnimation = function () {
    var currTime = Date.now();
    model._animationFrameCount++;

    if (currTime - model._animationStartTime > 1000.0 && model._animationFrameCount > 1) {
      model.recentAnimationFrameRate = 1000.0 * (model._animationFrameCount - 1) / (currTime - model._animationStartTime);
      model.lastFrameTime = 1.0 / model.recentAnimationFrameRate;
      publicAPI.animationFrameRateUpdateEvent();
      model._animationStartTime = currTime;
      model._animationFrameCount = 1;
    }

    publicAPI.animationEvent();
    forceRender();

    if (animationRequesters.size > 0 || Date.now() < model._animationExtendedEnd) {
      model.animationRequest = requestAnimationFrame(publicAPI.handleAnimation);
    } else {
      cancelAnimationFrame(model.animationRequest);
      model.animationRequest = null;
      publicAPI.endAnimationEvent();
      publicAPI.render();
    }
  };

  publicAPI.handleWheel = function (event) {
    preventDefault(event);
    /**
     * wheel event values can vary significantly across browsers, platforms
     * and devices [1]. `normalizeWheel` uses facebook's solution from their
     * fixed-data-table repository [2].
     *
     * [1] https://developer.mozilla.org/en-US/docs/Web/Events/mousewheel
     * [2] https://github.com/facebookarchive/fixed-data-table/blob/master/src/vendor_upstream/dom/normalizeWheel.js
     *
     * This code will return an object with properties:
     *
     *   spinX   -- normalized spin speed (use for zoom) - x plane
     *   spinY   -- " - y plane
     *   pixelX  -- normalized distance (to pixels) - x plane
     *   pixelY  -- " - y plane
     *
     */

    var callData = _objectSpread(_objectSpread(_objectSpread({}, normalizeWheel(event)), getModifierKeysFor(event)), {}, {
      position: getScreenEventPositionFor(event),
      deviceType: getDeviceTypeFor(event)
    });

    if (model.wheelTimeoutID === 0) {
      publicAPI.startMouseWheelEvent(callData);
    } else {
      publicAPI.mouseWheelEvent(callData);
      clearTimeout(model.wheelTimeoutID);
    } // start a timer to keep us animating while we get wheel events


    model.wheelTimeoutID = setTimeout(function () {
      publicAPI.extendAnimation(600);
      publicAPI.endMouseWheelEvent();
      model.wheelTimeoutID = 0;
    }, 200);
  };

  publicAPI.handleMouseUp = function (event) {
    var callData = _objectSpread(_objectSpread({}, getModifierKeysFor(event)), {}, {
      position: getScreenEventPositionFor(event),
      deviceType: getDeviceTypeFor(event)
    });

    switch (event.button) {
      case 0:
        publicAPI.leftButtonReleaseEvent(callData);
        break;

      case 1:
        publicAPI.middleButtonReleaseEvent(callData);
        break;

      case 2:
        publicAPI.rightButtonReleaseEvent(callData);
        break;

      default:
        vtkErrorMacro("Unknown mouse button released: ".concat(event.button));
        break;
    }
  };

  publicAPI.handleTouchStart = function (event) {
    var pointers = _toConsumableArray(pointerCache.values()); // If multitouch


    if (model.recognizeGestures && pointers.length > 1) {
      var positions = pointerCacheToPositions(pointerCache); // did we just transition to multitouch?

      if (pointers.length === 2) {
        var callData = _objectSpread(_objectSpread({}, getModifierKeysFor(EMPTY_MOUSE_EVENT)), {}, {
          position: pointers[0].position,
          deviceType: getDeviceTypeFor(event)
        });

        publicAPI.leftButtonReleaseEvent(callData);
      } // handle the gesture


      publicAPI.recognizeGesture('TouchStart', positions);
    } else if (pointers.length === 1) {
      var _callData = _objectSpread(_objectSpread({}, getModifierKeysFor(EMPTY_MOUSE_EVENT)), {}, {
        position: getScreenEventPositionFor(event),
        deviceType: getDeviceTypeFor(event)
      });

      publicAPI.leftButtonPressEvent(_callData);
    }
  };

  publicAPI.handleTouchMove = function (event) {
    var pointers = _toConsumableArray(pointerCache.values());

    if (model.recognizeGestures && pointers.length > 1) {
      var positions = pointerCacheToPositions(pointerCache);
      publicAPI.recognizeGesture('TouchMove', positions);
    } else if (pointers.length === 1) {
      var callData = _objectSpread(_objectSpread({}, getModifierKeysFor(EMPTY_MOUSE_EVENT)), {}, {
        position: pointers[0].position,
        deviceType: getDeviceTypeFor(event)
      });

      publicAPI.mouseMoveEvent(callData);
    }
  };

  publicAPI.handleTouchEnd = function (event) {
    var pointers = _toConsumableArray(pointerCache.values());

    if (model.recognizeGestures) {
      // No more fingers down
      if (pointers.length === 0) {
        var callData = _objectSpread(_objectSpread({}, getModifierKeysFor(EMPTY_MOUSE_EVENT)), {}, {
          position: getScreenEventPositionFor(event),
          deviceType: getDeviceTypeFor(event)
        });

        publicAPI.leftButtonReleaseEvent(callData);
      } else if (pointers.length === 1) {
        // If one finger left, end touch and start button press
        var positions = pointerCacheToPositions(pointerCache);
        publicAPI.recognizeGesture('TouchEnd', positions);

        var _callData2 = _objectSpread(_objectSpread({}, getModifierKeysFor(EMPTY_MOUSE_EVENT)), {}, {
          position: pointers[0].position,
          deviceType: getDeviceTypeFor(event)
        });

        publicAPI.leftButtonPressEvent(_callData2);
      } else {
        // If more than one finger left, keep touch move
        var _positions = pointerCacheToPositions(pointerCache);

        publicAPI.recognizeGesture('TouchMove', _positions);
      }
    } else if (pointers.length === 1) {
      var _callData3 = _objectSpread(_objectSpread({}, getModifierKeysFor(EMPTY_MOUSE_EVENT)), {}, {
        position: pointers[0].position,
        deviceType: getDeviceTypeFor(event)
      });

      publicAPI.leftButtonReleaseEvent(_callData3);
    }
  };

  publicAPI.setView = function (val) {
    if (model._view === val) {
      return;
    }

    model._view = val;

    model._view.getRenderable().setInteractor(publicAPI);

    publicAPI.modified();
  };

  publicAPI.getFirstRenderer = function () {
    var _model$_view, _model$_view$getRende, _model$_view$getRende2;

    return (_model$_view = model._view) === null || _model$_view === void 0 ? void 0 : (_model$_view$getRende = _model$_view.getRenderable()) === null || _model$_view$getRende === void 0 ? void 0 : (_model$_view$getRende2 = _model$_view$getRende.getRenderersByReference()) === null || _model$_view$getRende2 === void 0 ? void 0 : _model$_view$getRende2[0];
  };

  publicAPI.findPokedRenderer = function () {
    var _model$_view2, _model$_view2$getRend;

    var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

    if (!model._view) {
      return null;
    } // The original order of renderers needs to remain as
    // the first one is the one we want to manipulate the camera on.


    var rc = (_model$_view2 = model._view) === null || _model$_view2 === void 0 ? void 0 : (_model$_view2$getRend = _model$_view2.getRenderable()) === null || _model$_view2$getRend === void 0 ? void 0 : _model$_view2$getRend.getRenderers();

    if (!rc || rc.length === 0) {
      return null;
    }

    rc.sort(function (a, b) {
      return a.getLayer() - b.getLayer();
    });
    var interactiveren = null;
    var viewportren = null;
    var currentRenderer = null;
    var count = rc.length;

    while (count--) {
      var aren = rc[count];

      if (model._view.isInViewport(x, y, aren) && aren.getInteractive()) {
        currentRenderer = aren;
        break;
      }

      if (interactiveren === null && aren.getInteractive()) {
        // Save this renderer in case we can't find one in the viewport that
        // is interactive.
        interactiveren = aren;
      }

      if (viewportren === null && model._view.isInViewport(x, y, aren)) {
        // Save this renderer in case we can't find one in the viewport that
        // is interactive.
        viewportren = aren;
      }
    } // We must have a value.  If we found an interactive renderer before, that's
    // better than a non-interactive renderer.


    if (currentRenderer === null) {
      currentRenderer = interactiveren;
    } // We must have a value.  If we found a renderer that is in the viewport,
    // that is better than any old viewport (but not as good as an interactive
    // one).


    if (currentRenderer === null) {
      currentRenderer = viewportren;
    } // We must have a value - take anything.


    if (currentRenderer == null) {
      currentRenderer = rc[0];
    }

    return currentRenderer;
  }; // only render if we are not animating. If we are animating
  // then renders will happen naturally anyhow and we definitely
  // do not want extra renders as the make the apparent interaction
  // rate slower.


  publicAPI.render = function () {
    if (!publicAPI.isAnimating() && !model.inRender) {
      forceRender();
    }
  }; // create the generic Event methods


  handledEvents.forEach(function (eventName) {
    var lowerFirst = eventName.charAt(0).toLowerCase() + eventName.slice(1);

    publicAPI["".concat(lowerFirst, "Event")] = function (arg) {
      // Check that interactor enabled
      if (!model.enabled) {
        return;
      } // Check that a poked renderer exists


      var renderer = publicAPI.getCurrentRenderer();

      if (!renderer) {
        vtkOnceErrorMacro("\n          Can not forward events without a current renderer on the interactor.\n        ");
        return;
      } // Pass the eventName and the poked renderer


      var callData = _objectSpread({
        type: eventName,
        pokedRenderer: model.currentRenderer,
        firstRenderer: publicAPI.getFirstRenderer()
      }, arg); // Call invoke


      publicAPI["invoke".concat(eventName)](callData);
    };
  }); // we know we are in multitouch now, so start recognizing

  publicAPI.recognizeGesture = function (event, positions) {
    // more than two pointers we ignore
    if (Object.keys(positions).length > 2) {
      return;
    }

    if (!model.startingEventPositions) {
      model.startingEventPositions = {};
    } // store the initial positions


    if (event === 'TouchStart') {
      Object.keys(positions).forEach(function (key) {
        model.startingEventPositions[key] = positions[key];
      }); // we do not know what the gesture is yet

      model.currentGesture = 'Start';
      return;
    } // end the gesture if needed


    if (event === 'TouchEnd') {
      if (model.currentGesture === 'Pinch') {
        publicAPI.render();
        publicAPI.endPinchEvent();
      }

      if (model.currentGesture === 'Rotate') {
        publicAPI.render();
        publicAPI.endRotateEvent();
      }

      if (model.currentGesture === 'Pan') {
        publicAPI.render();
        publicAPI.endPanEvent();
      }

      model.currentGesture = 'Start';
      model.startingEventPositions = {};
      return;
    } // what are the two pointers we are working with


    var count = 0;
    var posVals = [];
    var startVals = [];
    Object.keys(positions).forEach(function (key) {
      posVals[count] = positions[key];
      startVals[count] = model.startingEventPositions[key];
      count++;
    }); // The meat of the algorithm
    // on move events we analyze them to determine what type
    // of movement it is and then deal with it.
    // calculate the distances

    var originalDistance = Math.sqrt((startVals[0].x - startVals[1].x) * (startVals[0].x - startVals[1].x) + (startVals[0].y - startVals[1].y) * (startVals[0].y - startVals[1].y));
    var newDistance = Math.sqrt((posVals[0].x - posVals[1].x) * (posVals[0].x - posVals[1].x) + (posVals[0].y - posVals[1].y) * (posVals[0].y - posVals[1].y)); // calculate rotations

    var originalAngle = degreesFromRadians(Math.atan2(startVals[1].y - startVals[0].y, startVals[1].x - startVals[0].x));
    var newAngle = degreesFromRadians(Math.atan2(posVals[1].y - posVals[0].y, posVals[1].x - posVals[0].x)); // angles are cyclic so watch for that, 1 and 359 are only 2 apart :)

    var angleDeviation = newAngle - originalAngle;
    newAngle = newAngle + 180.0 >= 360.0 ? newAngle - 180.0 : newAngle + 180.0;
    originalAngle = originalAngle + 180.0 >= 360.0 ? originalAngle - 180.0 : originalAngle + 180.0;

    if (Math.abs(newAngle - originalAngle) < Math.abs(angleDeviation)) {
      angleDeviation = newAngle - originalAngle;
    } // calculate the translations


    var trans = [];
    trans[0] = (posVals[0].x - startVals[0].x + posVals[1].x - startVals[1].x) / 2.0;
    trans[1] = (posVals[0].y - startVals[0].y + posVals[1].y - startVals[1].y) / 2.0;

    if (event === 'TouchMove') {
      // OK we want to
      // - immediately respond to the user
      // - allow the user to zoom without panning (saves focal point)
      // - allow the user to rotate without panning (saves focal point)
      // do we know what gesture we are doing yet? If not
      // see if we can figure it out
      if (model.currentGesture === 'Start') {
        // pinch is a move to/from the center point
        // rotate is a move along the circumference
        // pan is a move of the center point
        // compute the distance along each of these axes in pixels
        // the first to break thresh wins
        var thresh = 0.01 * Math.sqrt(model.container.clientWidth * model.container.clientWidth + model.container.clientHeight * model.container.clientHeight);

        if (thresh < 15.0) {
          thresh = 15.0;
        }

        var pinchDistance = Math.abs(newDistance - originalDistance);
        var rotateDistance = newDistance * 3.1415926 * Math.abs(angleDeviation) / 360.0;
        var panDistance = Math.sqrt(trans[0] * trans[0] + trans[1] * trans[1]);

        if (pinchDistance > thresh && pinchDistance > rotateDistance && pinchDistance > panDistance) {
          model.currentGesture = 'Pinch';
          var callData = {
            scale: 1.0,
            touches: positions
          };
          publicAPI.startPinchEvent(callData);
        } else if (rotateDistance > thresh && rotateDistance > panDistance) {
          model.currentGesture = 'Rotate';
          var _callData4 = {
            rotation: 0.0,
            touches: positions
          };
          publicAPI.startRotateEvent(_callData4);
        } else if (panDistance > thresh) {
          model.currentGesture = 'Pan';
          var _callData5 = {
            translation: [0, 0],
            touches: positions
          };
          publicAPI.startPanEvent(_callData5);
        }
      } else {
        // if we have found a specific type of movement then
        // handle it
        if (model.currentGesture === 'Rotate') {
          var _callData6 = {
            rotation: angleDeviation,
            touches: positions
          };
          publicAPI.rotateEvent(_callData6);
        }

        if (model.currentGesture === 'Pinch') {
          var _callData7 = {
            scale: newDistance / originalDistance,
            touches: positions
          };
          publicAPI.pinchEvent(_callData7);
        }

        if (model.currentGesture === 'Pan') {
          var _callData8 = {
            translation: trans,
            touches: positions
          };
          publicAPI.panEvent(_callData8);
        }
      }
    }
  };

  publicAPI.handleVisibilityChange = function () {
    model._animationStartTime = Date.now();
    model._animationFrameCount = 0;
  };

  publicAPI.setCurrentRenderer = function (r) {
    model._forcedRenderer = !!r;
    model.currentRenderer = r;
  }; // Stop animating if the renderWindowInteractor is deleted.


  var superDelete = publicAPI.delete;

  publicAPI.delete = function () {
    while (animationRequesters.size) {
      publicAPI.cancelAnimation(animationRequesters.values().next().value);
    }

    if (typeof document.hidden !== 'undefined') {
      document.removeEventListener('visibilitychange', publicAPI.handleVisibilityChange);
    }

    superDelete();
  }; // Use the Page Visibility API to detect when we switch away from or back to
  // this tab, and reset the animationFrameStart. When tabs are not active, browsers
  // will stop calling requestAnimationFrame callbacks.


  if (typeof document.hidden !== 'undefined') {
    document.addEventListener('visibilitychange', publicAPI.handleVisibilityChange, false);
  }
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------


var DEFAULT_VALUES = {
  renderWindow: null,
  interactorStyle: null,
  picker: null,
  pickingManager: null,
  initialized: false,
  enabled: false,
  enableRender: true,
  currentRenderer: null,
  lightFollowCamera: true,
  desiredUpdateRate: 30.0,
  stillUpdateRate: 2.0,
  container: null,
  // _view: null,
  recognizeGestures: true,
  currentGesture: 'Start',
  animationRequest: null,
  lastFrameTime: 0.1,
  recentAnimationFrameRate: 10.0,
  wheelTimeoutID: 0,
  moveTimeoutID: 0,
  lastGamepadValues: {},
  preventDefaultOnPointerDown: false,
  preventDefaultOnPointerUp: false
}; // ----------------------------------------------------------------------------

function extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, DEFAULT_VALUES, initialValues); // Object methods

  macro.obj(publicAPI, model); // run animation at least until this time

  model._animationExtendedEnd = 0;
  macro.event(publicAPI, model, 'RenderEvent');
  handledEvents.forEach(function (eventName) {
    return macro.event(publicAPI, model, eventName);
  }); // Create get-only macros

  macro.get(publicAPI, model, ['initialized', 'container', 'interactorStyle', 'lastFrameTime', 'recentAnimationFrameRate', '_view']); // Create get-set macros

  macro.setGet(publicAPI, model, ['lightFollowCamera', 'enabled', 'enableRender', 'recognizeGestures', 'desiredUpdateRate', 'stillUpdateRate', 'picker', 'preventDefaultOnPointerDown', 'preventDefaultOnPointerUp']);
  macro.moveToProtected(publicAPI, model, ['view']); // For more macro methods, see "Sources/macros.js"
  // Object specific methods

  vtkRenderWindowInteractor(publicAPI, model);
} // ----------------------------------------------------------------------------

var newInstance = macro.newInstance(extend, 'vtkRenderWindowInteractor'); // ----------------------------------------------------------------------------

var vtkRenderWindowInteractor$1 = _objectSpread({
  newInstance: newInstance,
  extend: extend,
  handledEvents: handledEvents
}, Constants);

export { vtkRenderWindowInteractor$1 as default, extend, newInstance };
