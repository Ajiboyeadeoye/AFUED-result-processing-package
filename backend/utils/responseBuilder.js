// utils/responseBuilder.js

function buildResponse({ success = true, message = "", data = {}, code = 200 }) {
  return {
    success,
    message,
    data,
    code,
    timestamp: new Date().toISOString(),
  };
}

buildResponse.success = (message, data = {}, code = 200) =>
  buildResponse({ success: true, message, data, code });

buildResponse.error = (message, code = 400, data = {}) =>
  buildResponse({ success: false, message, data, code });

module.exports = buildResponse;
