import express from "express";
// import ComputationSummary from "../result/computation.model.js";
// import MasterSheetHtmlRenderer from "../services/master-sheet/MasterSheetHtmlRenderer.js";
import ComputationSummary from "../../result/computation.model.js";
import MasterSheetHtmlRenderer from "../services/master-sheet/MasterSheetHtmlRenderer.js";

const router = express.Router();

router.get("/:summaryId/:level", async (req, res) => {
  try {
    const { summaryId, level } = req.params;

    const summary = await ComputationSummary
      .findById(summaryId)
      .populate("department", "name")
      .populate("semester", "name")
      .lean();

    if (!summary || !summary.masterSheetDataByLevel) {
      return res.status(404).send("Master sheet data not found");
    }

    const html = MasterSheetHtmlRenderer.render({
       summary,
      level,
      masterComputationId: summaryId || 'n/a'
    });

    res.setHeader("Content-Type", "text/html");
    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error rendering master sheet");
  }
});

export default router;
