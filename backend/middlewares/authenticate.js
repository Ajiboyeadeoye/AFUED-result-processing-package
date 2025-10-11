import jwt from "jsonwebtoken";
import buildResponse from "../utils/responseBuilder.js";

// System-wide authorized roles
const AUTHORIZED_ROLES = ["superuser", "admin", "hod", "lecturer", "student", "moderator"];

const authenticate = (roles = []) => {
  if (typeof roles === "string") roles = [roles];

  return (req, res, next) => {
    try {
      const publicPaths = ["/signin", "/signup", "/forgot-password", "/reset-password"];
      const isPublicRoute = publicPaths.some((path) => req.path.endsWith(path));

      // ✅ Allow public routes
      if (isPublicRoute) return next();

      // 🔑 Get token from headers or cookies
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : req.cookies?.access_token;

      if (!token) {
        const response = buildResponse.error("Access denied: No token provided.", 401);
        return res.status(401).json(response);
      }

      // ✅ Verify token
      const decoded = jwt.verify(token, process.env.TOKEN_KEY);

      // ✅ Attach user to request
      req.user = decoded;

      // ✅ Validate user role
      if (!AUTHORIZED_ROLES.includes(decoded.role)) {
        const response = buildResponse.error(`Unauthorized role: ${decoded.role}`, 403);
        return res.status(403).json(response);
      }

      // ✅ Restrict specific routes by role
      if (roles.length && !roles.includes(decoded.role)) {
        const response = buildResponse.error("Forbidden: Insufficient privileges.", 403);
        return res.status(403).json(response);
      }

      next();
    } catch (err) {
      console.error("Auth error:", err.message);
      const response = buildResponse.error("Invalid or expired token.", 401);
      return res.status(401).json(response);
    }
  };
};

export default authenticate;
