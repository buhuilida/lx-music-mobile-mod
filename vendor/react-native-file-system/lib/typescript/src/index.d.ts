export interface FileType {
    /** Document Tree Uri for the file or directory */
    /** Name of the file or directory */
    name: string;
    /** Storage path for the file */
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    /** Last modified date of the file or directory */
    lastModified: number;
    canRead: boolean;
    /** data read from the file */
    data: string;
    /** mime type of the file */
    mimeType: string;
    size: number;
}
export type Encoding = 'base64' | 'utf8';
export type HashAlgorithm = 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512';
export declare const Dirs: {
    /**
     * Temporary files. System/user may delete these if device storage is low.
     */
    CacheDir: string;
    /**
     * System recommended location for SQLite files.
     *
     * Android only.
     */
    DatabaseDir?: string;
    /**
     * Persistent data. Generally user created content.
     */
    DocumentDir: string;
    /**
     * App's default root directory.
     */
    MainBundleDir: string;
    /**
     * Root path to removable media. Prefer `cpExternal()` when possible, as
     * Android discourages this access method.
     *
     * Android only.
     */
    SDCardDir: string;
};
export interface OpenDocumentOptions {
    mimeTypes?: string[];
    extTypes?: string[];
    multi?: boolean;
    toPath?: string;
    encoding?: Encoding;
}
export declare const getExternalStoragePaths: (is_removable?: boolean) => Promise<string[]>;
export declare const AndroidScoped: {
    getPersistedUriPermissions(): Promise<string[]>;
    releasePersistableUriPermission(path: string): any;
    openDocumentTree(isPersist: boolean): Promise<FileType>;
    openDocument(options: OpenDocumentOptions): Promise<FileType>;
};
export declare const FileSystem: {
    /**
     * Copy a file.
     */
    cp(source: string, target: string): Promise<void>;
    /**
     * Check if a path exists.
     */
    exists(path: string): Promise<boolean>;
    /**
     * List files in a directory.
     */
    ls(path: string): Promise<FileType[]>;
    /**
     * Make a new directory.
     *
     * Returns path of the created directory.
     */
    mkdir(path: string): Promise<FileType>;
    /**
     * move a file.
     */
    mv(source: string, target: string): Promise<boolean>;
    /**
     * rename a file.
     */
    rename(source: string, name: string): Promise<boolean>;
    /**
     * Read the content of a file.
     */
    readFile(path: string, encoding?: Encoding): Promise<string>;
    /**
     * Read file metadata.
     */
    stat(path: string): Promise<FileType>;
    /**
     * Delete a file.
     */
    unlink(path: string): Promise<boolean>;
    /**
     * Write content to a file.
     *
     * Default encoding of `data` is assumed utf8.
     */
    writeFile(path: string, data: string, encoding?: Encoding): Promise<void>;
    /**
     * Append content to a file.
     *
     * Default encoding of `data` is assumed utf8.
     */
    appendFile(path: string, data: string, encoding?: Encoding): Promise<void>;
    /**
     * Gzip to a file.
     */
    gzipFile(source: string, target: string): Promise<void>;
    /**
     * UnGzip to a file.
     */
    unGzipFile(source: string, target: string): Promise<void>;
    /**
     * Gzip string.
     *
     * Default encoding of `data` is assumed utf8.
     */
    gzipString(data: string, encoding?: Encoding): Promise<string>;
    /**
     * UnGzip string.
     *
     * Default encoding of `data` is assumed utf8.
     */
    unGzipString(data: string, encoding?: Encoding): Promise<string>;
    /**
     * Get File hash string.
     *
     * Default algorithm is md5.
     */
    hash(path: string, algorithm?: HashAlgorithm): Promise<string>;
};
//# sourceMappingURL=index.d.ts.map