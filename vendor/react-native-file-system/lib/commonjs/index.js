"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getExternalStoragePaths = exports.FileSystem = exports.Dirs = exports.AndroidScoped = void 0;
var _reactNative = require("react-native");
const LINKING_ERROR = `The package 'react-native-file-system' doesn't seem to be linked. Make sure: \n\n` + _reactNative.Platform.select({
  ios: "- You have run 'pod install'\n",
  default: ''
}) + '- You rebuilt the app after installing the package\n' + '- You are not using Expo Go\n';
const FileSystemModule = _reactNative.NativeModules.FileSystemModule ? _reactNative.NativeModules.FileSystemModule : new Proxy({}, {
  get() {
    throw new Error(LINKING_ERROR);
  }
});
const Dirs = exports.Dirs = FileSystemModule.getConstants();
const getExternalStoragePaths = async is_removable => {
  return is_removable == null ? FileSystemModule.getAllExternalStoragePaths() : FileSystemModule.getExternalStoragePaths(is_removable);
};
exports.getExternalStoragePaths = getExternalStoragePaths;
const AndroidScoped = exports.AndroidScoped = {
  async getPersistedUriPermissions() {
    return FileSystemModule.getPersistedUriPermissions();
  },
  releasePersistableUriPermission(path) {
    return FileSystemModule.releasePersistableUriPermission(path);
  },
  async openDocumentTree(isPersist) {
    return FileSystemModule.openDocumentTree(isPersist);
  },
  async openDocument(options) {
    return FileSystemModule.openDocument(options);
  }
};
const FileSystem = exports.FileSystem = {
  /**
   * Copy a file.
   */
  async cp(source, target) {
    return FileSystemModule.cp(source, target);
  },
  /**
   * Check if a path exists.
   */
  async exists(path) {
    return FileSystemModule.exists(path);
  },
  /**
   * List files in a directory.
   */
  async ls(path) {
    return FileSystemModule.ls(path);
  },
  /**
   * Make a new directory.
   *
   * Returns path of the created directory.
   */
  async mkdir(path) {
    return FileSystemModule.mkdir(path);
  },
  /**
   * move a file.
   */
  async mv(source, target) {
    return FileSystemModule.mv(source, target);
  },
  /**
   * rename a file.
   */
  async rename(source, name) {
    return FileSystemModule.rename(source, name);
  },
  /**
   * Read the content of a file.
   */
  async readFile(path, encoding = 'utf8') {
    return FileSystemModule.readFile(path, encoding);
  },
  /**
   * Read file metadata.
   */
  async stat(path) {
    return FileSystemModule.stat(path);
  },
  /**
   * Delete a file.
   */
  async unlink(path) {
    return FileSystemModule.unlink(path);
  },
  /**
   * Write content to a file.
   *
   * Default encoding of `data` is assumed utf8.
   */
  async writeFile(path, data, encoding = 'utf8') {
    return FileSystemModule.writeFile(path, data, encoding);
  },
  /**
   * Append content to a file.
   *
   * Default encoding of `data` is assumed utf8.
   */
  async appendFile(path, data, encoding = 'utf8') {
    return FileSystemModule.appendFile(path, data, encoding);
  },
  /**
   * Gzip to a file.
   */
  async gzipFile(source, target) {
    return FileSystemModule.gzipFile(source, target);
  },
  /**
   * UnGzip to a file.
   */
  async unGzipFile(source, target) {
    return FileSystemModule.unGzipFile(source, target);
  },
  /**
   * Gzip string.
   *
   * Default encoding of `data` is assumed utf8.
   */
  async gzipString(data, encoding = 'utf8') {
    return FileSystemModule.gzipString(data, encoding);
  },
  /**
   * UnGzip string.
   *
   * Default encoding of `data` is assumed utf8.
   */
  async unGzipString(data, encoding = 'utf8') {
    return FileSystemModule.unGzipString(data, encoding);
  },
  /**
   * Get File hash string.
   *
   * Default algorithm is md5.
   */
  async hash(path, algorithm = 'md5') {
    return FileSystemModule.hash(path, algorithm);
  }
};
//# sourceMappingURL=index.js.map