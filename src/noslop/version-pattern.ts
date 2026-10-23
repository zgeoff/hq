// A version is `v` with two or three numeric parts, or exactly three bare numeric parts, with at
// most a known pre-release tag. A bare `1.5`, an IP address or a `1.2-hour` is prose or a value.
export const VERSION = /^(?:v\d+\.\d+(?:\.\d+)?|\d+\.\d+\.\d+)(?:-(?:alpha|beta|rc)(?:\.\d+)*)?$/u;
