// // utils/responseBuilder.js

// function buildResponse(
//   res,
//   statusCode = 200,
//   message = "",
//   data = null,
//   isError = false,
//   error = null
// ) {
//   const response = {
//     status: isError ? "error" : "success",
//     message,
//     data,
//     timestamp: new Date().toISOString(),
//   };

//   // Optionally include raw error for debugging (if needed)
//   if (isError && error) {
//     response.error = error.message || error;
//   }

//   return res.status(statusCode).json(response);
// }


// buildResponse.success = (message, data = {}, code = 200) =>
//   buildResponse({ status: "success", message, data, code });

// buildResponse.error = (message, code = 400, data = {}) =>
//   buildResponse({ status: 'error', message, data, code });

// export default buildResponse;
// utils/responseBuilder.js

function buildResponse(
  res,
  statusCode = 200,
  message = "",
  data = null,
  isError = false,
  error = null
) {
  const response = {
    status: isError ? "error" : "success",
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  if (isError && error) {
    response.error = error.message || error;
  }

  return res.status(statusCode).json(response);
}

// ✅ Fixed helper shortcuts
buildResponse.success = (res, message, data = {}, code = 200) =>
  buildResponse(res, code, message, data, false);

buildResponse.error = (res, message, code = 400, error = null) =>
  buildResponse(res, code, message, null, true, error);

export default buildResponse;
