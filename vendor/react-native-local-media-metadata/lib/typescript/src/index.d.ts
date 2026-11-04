export interface MusicMetadata {
    albumName: string;
    singer: string;
    name: string;
}
export interface MusicMetadataFull {
    type: 'mp3' | 'flac' | 'ogg' | 'wav';
    bitrate: string;
    interval: number;
    size: number;
    ext: 'mp3' | 'flac' | 'ogg' | 'wav';
    albumName: string;
    singer: string;
    name: string;
}
/**
 * Read Metadata
 * @param filePath
 * @returns
 */
export declare const readMetadata: (filePath: string) => Promise<MusicMetadataFull | null>;
/**
 * Write Metadata
 * @param filePath
 * @param metadata
 * @param isOverwrite
 * @returns
 */
export declare const writeMetadata: (filePath: string, metadata: MusicMetadata, isOverwrite?: boolean) => Promise<void>;
/**
 * Read Pic
 * @param filePath
 * @param picDir
 * @returns filePath
 */
export declare const readPic: (filePath: string, picDir: string) => Promise<string>;
/**
 * Write Pic
 * @param filePath
 * @param picPath
 * @returns
 */
export declare const writePic: (filePath: string, picPath: string) => Promise<void>;
/**
 * Read Lyric
 * @param filePath
 * @param isReadLrcFile
 * @returns
 */
export declare const readLyric: (filePath: string, isReadLrcFile?: boolean) => Promise<string>;
/**
 * Write Lyric
 * @param filePath
 * @param lyric
 * @returns
 */
export declare const writeLyric: (filePath: string, lyric: string) => Promise<void>;
//# sourceMappingURL=index.d.ts.map