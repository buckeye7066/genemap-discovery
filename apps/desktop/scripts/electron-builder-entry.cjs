'use strict';

/**
 * Compatibility entrypoint for electron-builder 26.15.3.
 *
 * app-builder-lib currently resolves plist 3.1.0, whose parser calls
 * DOMParser.parseFromString(xml) without a MIME type. Hardened releases of
 * @xmldom/xmldom correctly require that argument. plist 3.1.1 fixed the call
 * upstream, but electron-builder has not adopted it in this dependency path.
 *
 * Keep the hardened XML parser and supply the XML MIME type only when the
 * legacy caller omits it. Remove this bridge once app-builder-lib no longer
 * resolves plist 3.1.0.
 */
const { DOMParser } = require('@xmldom/xmldom');

const patchMarker = Symbol.for('genemap.xmldom.defaultMimeCompatibility');
const originalParseFromString = DOMParser.prototype.parseFromString;

if (!originalParseFromString[patchMarker]) {
  function parseFromStringWithExplicitDefault(source, mimeType) {
    return originalParseFromString.call(
      this,
      source,
      mimeType === undefined ? 'text/xml' : mimeType,
    );
  }

  Object.defineProperty(parseFromStringWithExplicitDefault, patchMarker, {
    value: true,
  });
  DOMParser.prototype.parseFromString = parseFromStringWithExplicitDefault;
}

const builderCli = process.argv[2];
if (!builderCli) {
  throw new Error('electron-builder CLI path was not provided');
}

process.argv = [process.execPath, builderCli, ...process.argv.slice(3)];
require(builderCli);
