import { Router } from "express";
import buildResponse from "../../utils/responseBuilder.js";


import authenticate from "../../middlewares/authenticate.js";
import { getAdminOverview } from "./admin.controller.js";

const router = Router();

router.get("/overview", authenticate("admin"), getAdminOverview);


export default router;
