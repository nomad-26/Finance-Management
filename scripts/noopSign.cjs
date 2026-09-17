/**
 * Custom no-op sign hook for electron-builder on Windows.
 * Bypasses signtool.exe / Wine execution when building unsigned local packages.
 */
module.exports = async function (configuration) {
  return true;
};
