// import { Parser as Json2CsvParser } from "json2csv";
// import XLSX from "xlsx";

// /**
//  * ⚡ Advanced Universal Data Fetch & Export Helper
//  * ------------------------------------------------
//  * Supports:
//  *  - Pagination, Filters, Sorting, Search
//  *  - Exports as CSV, Excel, or JSON
//  *  - Exclude fields from export
//  *
//  * @param {Object} req - Express request object
//  * @param {Object} res - Express response object
//  * @param {Object} Model - Mongoose model
//  * @param {Object} [options] - Optional configuration
//  */
// export const fetchDataHelper = async (req, res, Model, options = {}) => {
//   try {
//     const payload = req.method === "GET" ? req.query : req.body;

//     const {
//       page = 1,
//       limit = 20,
//       fields,
//       search_term,
//       filter = {},
//       sort,
//       extraParams = {}, // ✅ New! 
//     } = payload;

//     const enablePagination =
//       options.enablePagination === undefined ? true : options.enablePagination;

//     // 🧱 Base Query
//     let query = {};

//     // 🧩 Merge filters
//     if (filter && typeof filter === "object") Object.assign(query, filter);
//     if (options.additionalFilters)
//       query = { ...query, ...options.additionalFilters };

//     // 🔍 Search
//     if (fields && search_term) {
//       const fieldArray = Array.isArray(fields)
//         ? fields
//         : String(fields).split(",");
//       const regex = { $regex: search_term, $options: "i" };
//       query.$or = fieldArray.map((field) => ({ [field.trim()]: regex }));
//     }

//     // ⚙️ Sort
//     const finalSort = sort || options.sort || { createdAt: -1 };

//     // 🧮 Pagination
//     const currentPage = parseInt(page);
//     const itemsPerPage = parseInt(limit);
//     const skip = (currentPage - 1) * itemsPerPage;

//     let dataQuery = Model.find(query).sort(finalSort);

//     if (enablePagination && !extraParams.asFile) {
//       dataQuery = dataQuery.skip(skip).limit(itemsPerPage);
//     }

//     let data = await dataQuery.lean().exec(); // ✅ Use lean() for plain objects

//     // ✂️ Exclude fields from result (for file export)
//     if (extraParams.excludeFields && Array.isArray(extraParams.excludeFields)) {
//       data = data.map((item) => {
//         extraParams.excludeFields.forEach((field) => delete item[field]);
//         return item;
//       });
//     }

//     // 📁 Handle file export mode
//     if (extraParams.asFile) {
//       const fileType = extraParams.fileType?.toLowerCase() || "csv";
//       const filename = `${Model.modelName}_export_${Date.now()}`;

//       if (fileType === "csv") {
//         const parser = new Json2CsvParser();
//         const csv = parser.parse(data);
//         res.header("Content-Type", "text/csv");
//         res.attachment(`${filename}.csv`);
//         return res.send(csv);
//       }

//       if (fileType === "excel" || fileType === "xlsx") {
//         const worksheet = XLSX.utils.json_to_sheet(data);
//         const workbook = XLSX.utils.book_new();
//         XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
//         const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
//         res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
//         res.attachment(`${filename}.xlsx`);
//         return res.send(buffer);
//       }

//       if (fileType === "json") {
//         res.header("Content-Type", "application/json");
//         res.attachment(`${filename}.json`);
//         return res.send(JSON.stringify(data, null, 2));
//       }

//       return res.status(400).json({ message: "Invalid file type" });
//     }

//     // 📊 Pagination info
//     let pagination = null;
//     if (enablePagination && !extraParams.asFile) {
//       const totalItems = await Model.countDocuments(query);
//       const totalPages = Math.ceil(totalItems / itemsPerPage);
//       pagination = {
//         current_page: currentPage,
//         limit: itemsPerPage,
//         total_pages: totalPages,
//         total_items: totalItems,
//       };
//     }

//     // 🎯 Default JSON response
//     return res.status(200).json({
//       message: `${Model.modelName}s fetched successfully`,
//       ...(pagination ? { pagination } : {}),
//       data,
//     });
//   } catch (error) {
//     console.error("❌ fetchDataHelper Error:", error);
//     return res.status(500).json({
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };


import mongoose from "mongoose";
import { Parser as Json2CsvParser } from "json2csv";
import XLSX from "xlsx";

/* ------------------------------------------------------------
 * 🧠 QUERY BUILDER
 * ------------------------------------------------------------ */
const queryBuilder = (payload, options) => {
  const {
    page = 1,
    limit = 1,
    fields,
    search_term,
    filter = {},
    sort,
    extraParams = {},
  } = payload;

  const enablePagination =
    options.enablePagination === undefined ? true : options.enablePagination;

  const currentPage = parseInt(page);
  const itemsPerPage = Math.max(parseInt(limit) || 20, 1);
  const skip = (currentPage - 1) * itemsPerPage;

  let query = { ...filter };

  if (options.additionalFilters)
    query = { ...query, ...options.additionalFilters };

  // 🔍 Search across multiple fields
  if (fields && search_term) {
    const fieldArray = Array.isArray(fields)
      ? fields
      : String(fields).split(",");
    const regex = { $regex: search_term, $options: "i" };
    query.$or = fieldArray.map((field) => ({ [field.trim()]: regex }));
  }

  const finalSort = sort || options.sort || { createdAt: -1 };

  return { query, finalSort, skip, itemsPerPage, enablePagination, extraParams, currentPage };
};

/* ------------------------------------------------------------
 * 🧙 APPLY TRANSFORMATIONS
 * ------------------------------------------------------------ */
const applyTransformations = async (data, configMap) => {
  if (!configMap) return data;

  const models = mongoose.models;
  const resolvePath = (obj, path) =>
    path.split('.').reduce((o, k) => (o ? o[k] : null), obj);

  return Promise.all(
    data.map(async (doc) => {
      const transformed = {};
      for (const [key, value] of Object.entries(configMap)) {
        if (typeof value === "function") {
          transformed[key] = await value(doc, models);
        } else if (value.startsWith("this.")) {
          transformed[key] = resolvePath(doc, value.replace("this.", ""));
        } else if (value.includes(".")) {
          const [ref, refField] = value.split(".");
          transformed[key] = doc[ref]?.[refField] ?? null;
        } else {
          transformed[key] = value;
        }
      }
      return transformed;
    })
  );
};

/* ------------------------------------------------------------
 * 📁 EXPORT HANDLER
 * ------------------------------------------------------------ */
const exportHandler = (res, modelName, data, fileType) => {
  const filename = `${modelName}_export_${Date.now()}`;
  const lowerType = fileType?.toLowerCase() || "csv";

  if (lowerType === "csv") {
    const parser = new Json2CsvParser();
    const csv = parser.parse(data);
    res.header("Content-Type", "text/csv");
    res.attachment(`${filename}.csv`);
    return res.send(csv);
  }

  if (["excel", "xlsx"].includes(lowerType)) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.attachment(`${filename}.xlsx`);
    return res.send(buffer);
  }

  if (lowerType === "json") {
    res.header("Content-Type", "application/json");
    res.attachment(`${filename}.json`);
    return res.send(JSON.stringify(data, null, 2));
  }

  return res.status(400).json({ message: "Invalid file type" });
};

/* ------------------------------------------------------------
 * ⚡ MAIN UNIVERSAL FETCH & EXPORT HELPER
 * ------------------------------------------------------------ */
export const fetchDataHelper = async (req, res, Model, options = {}) => {
  try {
    const payload = req.method === "GET" ? req.query : req.body;
    const { query, finalSort, skip, itemsPerPage, enablePagination, extraParams, currentPage } =
      queryBuilder(payload, options);

    // 🧩 Base Query
    let dataQuery = Model.find(query).sort(finalSort);

    // Custom populates
    if (options.populate)
      for (const pop of [].concat(options.populate))
        dataQuery = dataQuery.populate(pop);

    // Auto-populate refs
    if (options.autoPopulate !== false) {
      const schemaPaths = Model.schema.paths;
      const populated = new Set(options.populate?.map((p) => p.path || p) || []);
      for (const key in schemaPaths) {
        const path = schemaPaths[key];
        if (path.options?.ref && !populated.has(key))
          dataQuery = dataQuery.populate({ path: key, select: "name" });
      }
    }

    // Pagination
    if (enablePagination && !extraParams.asFile)
      dataQuery = dataQuery.skip(skip).limit(itemsPerPage);

    // Execute query
    let data = await dataQuery.lean().exec();

    // Transform if configMap exists
    data = await applyTransformations(data, options.configMap);

    // Exclude unwanted fields
    if (Array.isArray(extraParams.excludeFields)) {
      data = data.map((item) => {
        extraParams.excludeFields.forEach((f) => delete item[f]);
        return item;
      });
    }

    // Export file if requested
    if (extraParams.asFile) {
      return exportHandler(res, Model.modelName, data, extraParams.fileType);
    }

    // Pagination info
    let pagination = null;
    if (enablePagination && !extraParams.asFile) {
      const totalItems = await Model.countDocuments(query);
      pagination = {
        current_page: currentPage,
        limit: itemsPerPage,
        total_pages: Math.ceil(totalItems / itemsPerPage),
        total_items: totalItems,
      };
    }

    // ✅ Response
    return res.status(200).json({
      message: `${Model.modelName} data fetched successfully`,
      ...(pagination ? { pagination } : {}),
      data,
    });
  } catch (error) {
    console.error("❌ fetchDataHelper Error:", error);
    return res.status(500).json({
      message: "Internal server error", 
      error: error.message,
    });
  }

}
export default fetchDataHelper;
