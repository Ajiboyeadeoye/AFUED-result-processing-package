import jwt from "jsonwebtoken";
import buildResponse from "../utils/responseBuilder.js";

// System-wide authorized roles
const AUTHORIZED_ROLES = ["superuser", "admin", "hod", "lecturer", "student", "moderator"];

const authenticate = (roles = []) => {
  // Normalize roles into an array if a single string is passed
  const allowedRoles = Array.isArray(roles) ? roles : roles ? [roles] : [];

  return (req, res, next) => {
    try {
      const publicPaths = ["/signin", "/signup", "/forgot-password", "/reset-password"];
      const isPublicRoute = publicPaths.some((path) => req.path.endsWith(path));

      // ✅ Allow public routes
      if (isPublicRoute) return next();

      // 🔑 Extract token from Authorization header or cookies
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : req.cookies?.access_token;


      if (!token) {
        return res
          .status(401)
          .json(buildResponse(res, 401, "Access denied: No token provided.", null, true));
      }

      console.log("Verifying token:", token);
      let decoded;

      // ✅ Allow a system token override (for admin setup or service calls)
      console.log(process.env.token)
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
        return res
          .status(403)
          .json(buildResponse(res, 403, `Unauthorized role: ${decoded.role}`, null, true));
      }

      // ✅ Check route-level role restriction (if provided)
      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res
          .status(403)
          .json(buildResponse(res, 403, "Forbidden: Insufficient privileges.", null, true));
      }

      next();
    } catch (err) {
      console.error("Auth error:", err.message);
      return res
        .status(401)
        .json(buildResponse(res, 401, "Invalid or expired token.", null, true, err));
    }
  };
};

export default authenticate;
