import { mat4 } from 'gl-matrix';
import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Volume';

// Force DataAccessHelper to have access to various data source
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HtmlDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/JSZipDataAccessHelper';

import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
// import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkFullScreenRenderWindow from './js/renderwindow/FullScreenRenderWindow.js'
import HttpDataAccessHelper from '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkImageReslice from '@kitware/vtk.js/Imaging/Core/ImageReslice';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkURLExtract from '@kitware/vtk.js/Common/Core/URLExtract';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';

import './js/iosWebXR/examples/libs/three/three.min.js'
import './WebXRVolume.module.css';
import controlPanel from './controller.html';
import { ac } from '@kitware/vtk.js/Common/Core/Math/index';

// ---------------------------------------------------------------------------x-
// Standard rendering code setup
// ----------------------------------------------------------------------------

const background = [0, 0, 0];
const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background,
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

// ----------------------------------------------------------------------------
// Set up pipeline objects
// ----------------------------------------------------------------------------

const vtiReader = vtkXMLImageDataReader.newInstance();
const reslicer = vtkImageReslice.newInstance();
const actor = vtkVolume.newInstance();
const mapper = vtkVolumeMapper.newInstance();
reslicer.setInputConnection(vtiReader.getOutputPort());
mapper.setInputConnection(reslicer.getOutputPort());
actor.setMapper(mapper);
renderer.addVolume(actor);
// create color and opacity transfer functions
const ctfun = vtkColorTransferFunction.newInstance();
const ofun = vtkPiecewiseFunction.newInstance();
// const img = document.getElementById('target_img');
// Ensure the image is loaded and ready for use
var img = new Image();
img.src = 'hubs.png';
var imgBitmap = null
createImageBitmap(img).then(x=>{imgBitmap = x});
console.log(imgBitmap)

const getImageData = imagePath => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const img = new Image();
  img.src = imagePath;
  canvas.width = img.width;
  canvas.height = img.height;
  context.drawImage(img, 0, 0);
  return context.getImageData(0, 0, img.width, img.height);
};
let hubsImageData = getImageData('hubs.png');
// console.log(hubsImageData)
// console.log(hubsImageData)

// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------

const {
  // fileURL = 'https://data.kitware.com/api/v1/file/624320e74acac99f42254a25/download',
  fileURL = 'https://data.kitware.com/api/v1/file/629921a64acac99f429a45a7/download',
  // fileURL = 'https://data.kitware.com/api/v1/file/59de9dca8d777f31ac641dc2/download',

} = vtkURLExtract.extractURLParameters();

HttpDataAccessHelper.fetchBinary(fileURL).then((fileContents) => {
  // Read data
  vtiReader.parseAsArrayBuffer(fileContents);
  console.log('vtiReader',vtiReader.toJSON())
  // Rotate 90 degrees forward so that default head volume faces camera
  const rotateX = mat4.create();
  mat4.fromRotation(rotateX, vtkMath.radiansFromDegrees(15), [-1, 0, 0]);
  reslicer.setResliceAxes(rotateX);
  
  const data = reslicer.getOutputData(0);
  const dataArray =
  data.getPointData().getScalars() || data.getPointData().getArrays()[0];
  const dataRange = dataArray.getRange();
  
  // Restyle visual appearance
  const sampleDistance =
    0.7 *
    Math.sqrt(
      data
        .getSpacing()
        .map((v) => v * v)
        .reduce((a, b) => a + b, 0)
    );
  
  mapper.setSampleDistance(sampleDistance);
  ctfun.addRGBPoint(dataRange[0], 0.0, 0.3, 0.3);
  ctfun.addRGBPoint(dataRange[1], 1.0, 1.0, 2.0);
  ofun.addPoint(dataRange[0], 0.0);
  ofun.addPoint((dataRange[1] - dataRange[0]) / 10, 0.0);
  ofun.addPoint(dataRange[1], 0.5);
  // console.log(mapper.getBounds())
  actor.getProperty().setRGBTransferFunction(0, ctfun);
  actor.getProperty().setScalarOpacity(0, ofun);
  actor.getProperty().setInterpolationTypeToLinear();
  
  // change the position of the object
  // Set up rendering
  // renderer.getActiveCamera().zoom(0.01);
  renderer.resetCamera();
  actor.setPosition([0, 0, 0])
  // actor.setScale(0.5,0.5,0.5)
  renderer.addActor(actor)
  renderWindow.render();

  // Adding WebXR Options
  let options = {
    // requiredFeatures: ['dom-overlay','image-tracking'],
    requiredFeatures: ['dom-overlay'],
    trackedImages: [
      {
        image: hubsImageData,
        widthInMeters: 0.05
      }
    ],
    // domOverlay: { root: document.body}
};

  // Add button to launch AR (default) or VR scene
  const VR = 1;
  const AR = 2;
  let xrSessionType = 0;
  // const xrButton = document.createElement('button');

  fullScreenRenderer.addController(controlPanel);
  const representationSelector = document.querySelector('.representations');
  const rotateChange = document.querySelector('.rotate');
  const xrButton = document.querySelector('.arbutton');

  let enterText = 'XR not available!';
  const exitText = 'Exit XR';
  xrButton.textContent = enterText;
  // console.log(fullScreenRenderer.getApiSpecificRenderWindow());
  if (
    navigator.xr !== undefined &&
    fullScreenRenderer.getApiSpecificRenderWindow().getXrSupported()
  ) {
    navigator.xr.isSessionSupported('immersive-ar').then((arSupported) => {
      if (arSupported) {
        xrSessionType = AR;
        enterText = 'Start AR';
        xrButton.textContent = enterText;
      } else {
        navigator.xr.isSessionSupported('immersive-vr').then((vrSupported) => {
          if (vrSupported) {
            xrSessionType = VR;
            enterText = 'Start VR';
            xrButton.textContent = enterText;
          }
        });
      }
    });
  }

  rotateChange.addEventListener('input', (e) => {
    const rotate = Number(e.target.value);
    // coneSource.setResolution(resolution);
    actor.rotateWXYZ(rotate,1,0,0)
    renderWindow.render();
  });

  // xrButton.style.position="absolute";
  xrButton.addEventListener('click', () => {
    if (xrButton.textContent === enterText) {
      if (xrSessionType === AR) {
        fullScreenRenderer.setBackground([0, 0, 0, 0]);
      }
      fullScreenRenderer
        .getApiSpecificRenderWindow()
        .startXR(xrSessionType === AR, options);
      xrButton.textContent = exitText;
    } else {
      fullScreenRenderer.setBackground([...background, 255]);
      fullScreenRenderer
        .getApiSpecificRenderWindow()
        .stopXR(xrSessionType === AR);
      xrButton.textContent = enterText;
    }
  });
  // document.querySelector('.content').appendChild(xrButton);
});

// -----------------------------------------------------------
// Make some variables global so that you can inspect and
// modify objects in your browser's developer console:
// -----------------------------------------------------------

global.source = vtiReader;
global.mapper = mapper;
global.actor = actor;
global.ctfun = ctfun;
global.ofun = ofun;
global.renderer = renderer;
global.renderWindow = renderWindow;
global.hubsImageData = hubsImageData;
global.reslicer = reslicer