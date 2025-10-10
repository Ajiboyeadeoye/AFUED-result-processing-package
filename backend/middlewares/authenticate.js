// middlewares/authenticate.js
const jwt = require("jsonwebtoken");
const { TOKEN_KEY } = process.env;

// Define the authorized roles in your app
const AUTHORIZED_ROLES = ["admin", "lecturer", "student", "moderator"];

const authenticate = (roles = []) => {
  if (typeof roles === "string") roles = [roles];

  return (req, res, next) => {
    try {
      console.log(req.path)
      // ✅ Skip auth for public routes (like login/signup)
      if (req.path.endsWith("/signin") || req.path.endsWith("/signup")) {
        console.log("yes");
        return next();
      }


      const token = req.headers.authorization?.split(" ")[1] || req.cookies?.access_token;
      if (!token) {
        return res.status(401).json({ msg: "No token provided" });
      }

      const decoded = jwt.verify(token, TOKEN_KEY);
      req.user = decoded;

      // Check that the role is a valid system role
      if (!AUTHORIZED_ROLES.includes(decoded.role)) {
        return res.status(403).json({ msg: "Unauthorized role detected" });
      }

      // If route has restricted roles, enforce it
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ msg: "Forbidden: Insufficient role" });
      }

      next();
    } catch (err) {
      res.status(401).json({ msg: "Invalid or expired token" });
    }
  };
};

module.exports = authenticate;
