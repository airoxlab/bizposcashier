// Empty stub — webpack alias target for the bare `import 'WebSdk'` inside
// @digitalpersona/devices. The real WebSdk attaches to window.WebSdk at
// runtime via the <script src="/sdk/WebSdk.client.min.js"> tag loaded by
// the fingerprint pages. Webpack sees this empty module and is satisfied;
// at runtime the actual global is already in place before the SDK is used.
export default {}
