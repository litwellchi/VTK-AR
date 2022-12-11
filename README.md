# Getting Start
This project is still under developing... Expect finishing 2.0 Version at 2022/12/20.
## Device
Ensure the device support the AR envoronment.
You can check your device by [WenXR Examples](https://immersive-web.github.io/webxr-samples/)

## Environment Set up
Install the [Node.js](https://nodejs.org/en/) higher then 14.x.
Then clone the code:
```bash
git clone https://github.com/litwellchi/VTK-AR.git
cd VTK-AR
```
Install the packages by npm:
```bash
npm install @kitware/vtk.js
npm install --save-dev css-loader html-loader
```
Modified the source code of the AR so that the scale function in index.js can work:
in `@kitware\vtk.js\Rendering\OpenGL\RenderWindow.js`, remove the `ren.resetCamera();` in line 361.

## Run the demo
Start demo by using:
```bash
npm run start
```

## Custom interactor
updateXRGamepads() method in `src\js\openGL\RenderWindowInteractor.js`

# Refference
vtk.js
immersive-web/webxr-samples