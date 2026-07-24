"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var cert_exports = {};
__export(cert_exports, {
  OASE_CERT_CN: () => OASE_CERT_CN,
  generateSelfSignedCert: () => generateSelfSignedCert
});
module.exports = __toCommonJS(cert_exports);
var import_selfsigned = require("selfsigned");
const OASE_CERT_CN = "com.oase.easycontrol";
async function generateSelfSignedCert(commonName = OASE_CERT_CN) {
  const notBeforeDate = /* @__PURE__ */ new Date("2000-01-01T00:00:00Z");
  const notAfterDate = /* @__PURE__ */ new Date("2099-12-31T23:59:59Z");
  const pems = await (0, import_selfsigned.generate)([{ name: "commonName", value: commonName }], {
    keySize: 2048,
    algorithm: "sha256",
    notBeforeDate,
    notAfterDate
  });
  return { cert: pems.cert, key: pems.private };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OASE_CERT_CN,
  generateSelfSignedCert
});
//# sourceMappingURL=cert.js.map
