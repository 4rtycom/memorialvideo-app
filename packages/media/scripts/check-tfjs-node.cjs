try {
  require('@tensorflow/tfjs-node');
  console.log('tfjs-node ok');
} catch (error) {
  console.error(String(error && error.message ? error.message : error).slice(0, 300));
  process.exitCode = 1;
}
