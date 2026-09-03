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
const { createRequire } = require('node:module');

const builderCli = process.argv[2];
if (!builderCli) {
  throw new Error('electron-builder CLI path was not provided');
}

// Follow the same dependency-resolution chain used by electron-builder.
// The repository also has a root @xmldom/xmldom installation, but plist is
// loaded by app-builder-lib and can resolve a distinct nested copy. Patching
// the root prototype would therefore leave the packaging parser untouched.
const builderRequire = createRequire(builderCli);
const appBuilderEntry = builderRequire.resolve('app-builder-lib');
const appBuilderRequire = createRequire(appBuilderEntry);
const plistEntry = appBuilderRequire.resolve('plist');
const plistRequire = createRequire(plistEntry);
const { DOMParser } = plistRequire('@xmldom/xmldom');

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

process.argv = [process.execPath, builderCli, ...process.argv.slice(3)];
require(builderCli);
