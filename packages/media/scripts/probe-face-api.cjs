/**
 * Probe: load face-api Node build while stubbing tfjs-node to plain tfjs+cpu.
 */
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === '@tensorflow/tfjs-node' || id === '@tensorflow/tfjs-node-gpu') {
    require('@tensorflow/tfjs-backend-cpu');
    return require('@tensorflow/tfjs');
  }
  return originalRequire.apply(this, arguments);
};

async function main() {
  const tf = require('@tensorflow/tfjs');
  require('@tensorflow/tfjs-backend-cpu');
  await tf.setBackend('cpu');
  await tf.ready();
  const faceapi = require('@vladmandic/face-api');
  const path = require('path');
  const fs = require('fs');
  const modelDir = path.resolve(__dirname, '../../../.cache/face-api');
  console.log('backend', tf.getBackend(), 'models', fs.existsSync(modelDir));
  await faceapi.nets.tinyFaceDetector.loadFromDisk(modelDir);
  console.log('tiny loaded');
  const jpeg = require('jpeg-js');
  const bytes = fs.readFileSync(
    path.resolve(__dirname, '../../../packages/test-utils/fixtures/people-intelligence/person-a-1.jpg'),
  );
  const decoded = jpeg.decode(bytes, { useTArray: true });
  const rgb = new Float32Array(decoded.width * decoded.height * 3);
  for (let i = 0; i < decoded.width * decoded.height; i += 1) {
    rgb[i * 3] = decoded.data[i * 4];
    rgb[i * 3 + 1] = decoded.data[i * 4 + 1];
    rgb[i * 3 + 2] = decoded.data[i * 4 + 2];
  }
  const tensor = tf.tensor3d(rgb, [decoded.height, decoded.width, 3]);
  const detections = await faceapi.detectAllFaces(
    tensor,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }),
  );
  tensor.dispose();
  console.log(JSON.stringify({ count: detections.length, backend: tf.getBackend() }));
}

main().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error).slice(0, 500));
  process.exitCode = 1;
});
