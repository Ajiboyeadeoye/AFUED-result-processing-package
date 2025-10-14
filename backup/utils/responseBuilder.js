// utils/responseBuilder.js

function buildResponse({ status = 'successs', message = "", data = {}, code = 200 }) {
  return {
    status,
    message,
    data,
    code,
    timestamp: new Date().toISOString(),
  };
}

buildResponse.success = (message, data = {}, code = 200) =>
  buildResponse({ status: "success", message, data, code });

buildResponse.error = (message, code = 400, data = {}) =>
  buildResponse({ status: 'error', message, data, code });

export default buildResponse;
