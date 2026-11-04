"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.writePic = exports.writeMetadata = exports.writeLyric = exports.readPic = exports.readMetadata = exports.readLyric = void 0;
var _reactNative = require("react-native");
const LINKING_ERROR = `The package 'react-native-local-media-metadata' doesn't seem to be linked. Make sure: \n\n` + '- You rebuilt the app after installing the package\n' + '- You are not using Expo Go\n';
const LocalMediaMetadata = _reactNative.NativeModules.LocalMediaMetadata ? _reactNative.NativeModules.LocalMediaMetadata : new Proxy({}, {
  get() {
    throw new Error(LINKING_ERROR);
  }
});
const writeQueue = new Map();
const waitQueuePromise = async (key, run) => {
  let task = writeQueue.get(key);
  if (!task) task = {
    promise: Promise.resolve(),
    num: 0
  };
  task.num++;
  task.promise = task.promise.finally(run).finally(() => {
    let task = writeQueue.get(key);
    if (!task) return;
    task.num--;
    if (task.num > 0) writeQueue.set(key, task);else writeQueue.delete(key);
  });
  writeQueue.set(key, task);
  return task.promise;
};

/**
 * Read Metadata
 * @param filePath
 * @returns
 */
const readMetadata = async filePath => {
  return LocalMediaMetadata.readMetadata(filePath);
};
/**
 * Write Metadata
 * @param filePath
 * @param metadata
 * @param isOverwrite
 * @returns
 */
exports.readMetadata = readMetadata;
const writeMetadata = async (filePath, metadata, isOverwrite = false) => {
  return waitQueuePromise(filePath, () => {
    return LocalMediaMetadata.writeMetadata(filePath, metadata, isOverwrite);
  });
};

/**
 * Read Pic
 * @param filePath
 * @param picDir
 * @returns filePath
 */
exports.writeMetadata = writeMetadata;
const readPic = async (filePath, picDir) => {
  return LocalMediaMetadata.readPic(filePath, picDir);
};
/**
 * Write Pic
 * @param filePath
 * @param picPath
 * @returns
 */
exports.readPic = readPic;
const writePic = async (filePath, picPath) => {
  return waitQueuePromise(filePath, () => {
    return LocalMediaMetadata.writePic(filePath, picPath);
  });
};

/**
 * Read Lyric
 * @param filePath
 * @param isReadLrcFile
 * @returns
 */
exports.writePic = writePic;
const readLyric = async (filePath, isReadLrcFile = true) => {
  return LocalMediaMetadata.readLyric(filePath, isReadLrcFile);
};
/**
 * Write Lyric
 * @param filePath
 * @param lyric
 * @returns
 */
exports.readLyric = readLyric;
const writeLyric = async (filePath, lyric) => {
  return waitQueuePromise(filePath, () => {
    return LocalMediaMetadata.writeLyric(filePath, lyric);
  });
};
exports.writeLyric = writeLyric;
//# sourceMappingURL=index.js.map