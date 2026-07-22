/**
 * Rendering test helpers.
 *
 * A `.docx` is a zip of XML, so structural assertions mean unzipping the
 * buffer and reading the parts. Doing that inline in every test would bury
 * what is actually being asserted.
 */

import { inflateRawSync } from 'node:zlib';

import { ResumeComposer, type ResumeDocument } from '../../src/domain/index.js';
import { makeLibrary, makeVariant } from '../domain/fixtures.js';

/** Offsets and sizes in a zip's central directory, per the PKZIP spec. */
const ZIP = {
  endOfCentralDirectorySignature: 0x06054b50,
  centralFileHeaderSignature: 0x02014b50,
  localFileHeaderSignature: 0x04034b50,
} as const;

/**
 * Extracts one stored-or-deflated entry from a zip buffer.
 *
 * Implemented here rather than pulled in as a dependency: the tests should not
 * be able to pass because a zip library agreed with the renderer's own zip
 * library about something wrong.
 *
 * @param zip - the complete `.docx` buffer
 * @param entryName - path within the archive, e.g. `word/document.xml`
 */
export function readZipEntry(zip: Buffer, entryName: string): string {
  const endIndex = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(endIndex + 10);
  let offset = zip.readUInt32LE(endIndex + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== ZIP.centralFileHeaderSignature) {
      throw new Error('corrupt central directory');
    }

    const compressionMethod = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');

    if (name === entryName) {
      return readLocalEntry(zip, localOffset, compressedSize, compressionMethod);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`no such entry in archive: ${entryName}`);
}

/** Locates the end-of-central-directory record, scanning back from the tail. */
function findEndOfCentralDirectory(zip: Buffer): number {
  for (let index = zip.length - 22; index >= 0; index -= 1) {
    if (zip.readUInt32LE(index) === ZIP.endOfCentralDirectorySignature) {
      return index;
    }
  }
  throw new Error('not a zip archive');
}

/** Reads and inflates one local file entry. */
function readLocalEntry(
  zip: Buffer,
  localOffset: number,
  compressedSize: number,
  compressionMethod: number,
): string {
  if (zip.readUInt32LE(localOffset) !== ZIP.localFileHeaderSignature) {
    throw new Error('corrupt local file header');
  }

  const nameLength = zip.readUInt16LE(localOffset + 26);
  const extraLength = zip.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  const data = zip.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) {
    return data.toString('utf8');
  }

  return inflateRawSync(data).toString('utf8');
}

/** Composes a realistic document from the Layer 1 fixtures. */
export function makeDocument(): ResumeDocument {
  const composed = new ResumeComposer().compose(makeVariant('v'), makeLibrary());
  if (!composed.ok) {
    throw new Error(composed.error.map((e) => e.message).join('; '));
  }
  return composed.value;
}
