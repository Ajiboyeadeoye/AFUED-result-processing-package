import jwt from "jsonwebtoken";
import buildResponse from "../utils/responseBuilder.js";
import { auditLogger } from "../middlewares/auditLogger.js"; // <-- Import the logger

// System-wide authorized roles
const AUTHORIZED_ROLES = [, "admin", "hod", "lecturer", "student", "dean", "pro"];

const authenticate = (roles = []) => {
  const allowedRoles = Array.isArray(roles) ? roles : roles ? [roles] : [];

  return async (req, res, next) => {
    try {
      console.log('hi')
      const publicPaths = ["/signin/:role", "/signup", "/forgot-password", "/reset-password"];
      const isPublicRoute = publicPaths.some((path) => req.path.endsWith(path));

      // ✅ Allow public routes
      if (isPublicRoute) return next();

      // 🔑 Extract token from Authorization header or cookies
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : req.cookies?.access_token;

      if (!token) {
        auditLogger("Unauthorized access: No token provided")(req, res, () => {}); // 🔥 Log this event
        return buildResponse(res, 401, "Access denied: No token provided.", null, true)
      }

      let decoded;

      // ✅ Allow a system token override (for admin setup or service calls)
      if (token === process.env.token) {
        decoded = {
          role: "admin",
          _id: process.env.admin_id,
        };
      } else {
        decoded = jwt.verify(token, process.env.TOKEN_KEY);
      }

      // ✅ Attach user payload to request
      req.user = decoded;

      // ✅ Check that the role exists in the authorized roles list
      if (!AUTHORIZED_ROLES.includes(decoded.role)) {
        auditLogger(`Unauthorized role: ${decoded.role}`)(req, res, () => {}); // 🔥 Log unauthorized role
        return buildResponse(res, 403, `Unauthorized role: ${decoded.role}`, null, true)
      }

      // ✅ Check route-level role restriction
      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        auditLogger(`Forbidden: ${decoded.role} tried to access restricted route`)(req, res, () => {});
        return buildResponse(res, 403, "Forbidden: Insufficient privileges.", null, true)
      }

      // ✅ Success: attach audit logger for later stages
      req.audit = auditLogger(`Authenticated ${decoded.role} access`);
      next();
    } catch (err) {
      console.error("Auth error:", err.message);
      auditLogger(`Authentication error: ${err.message}`)(req, res, () => {});
      return buildResponse(res, 401, "Invalid or expired token.", null, true, err)
    }
  };
};

export default authenticate;
