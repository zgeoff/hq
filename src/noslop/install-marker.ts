// The file a commit folder holds once its install completed. node_modules alone appears as soon as
// an install starts, so a stopped install would pass for a finished one.
export const INSTALL_MARKER = 'node_modules/.hq-install-complete';
